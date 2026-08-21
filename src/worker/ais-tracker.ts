/**
 * AISタンカー位置追跡
 *
 * AISStream.io WebSocket APIからリアルタイムの船舶位置を取得し、
 * KVにキャッシュ。/api/tankers のレスポンスに実位置を反映する。
 *
 * 制約:
 * - AISStream.ioは無料・ベータ版（SLAなし）
 * - WebSocket接続は Cron 実行時に一時的に確立（~10秒）
 * - MMSIフィルタで対象船舶のみ受信（最大50隻）
 * - 無料枠のCPU時間制限（30秒）内で完了させる
 */

import tankersData from "./data/tankers.json";

interface Env {
  CACHE: KVNamespace;
  AISSTREAM_API_KEY?: string;
}

// ─── tanker_overrides 自動書き込み用 ─────────────────────────
// /api/tankers が参照する KV。AIS ETA を Cron 実行直後に反映する。

const TANKER_OVERRIDES_KEY = "tanker_overrides";
const TANKERS_CACHE_KEY = "api:tankers";
/** AIS最終成功取得タイムスタンプ（ISO文字列）を格納するKVキー */
export const AIS_LAST_SUCCESS_KEY = "tanker_ais_last_success_at";

interface TankerOverride {
  id: string;
  eta_days?: number;
  status?: string;
  note?: string;
  updatedAt: string;
}

/** AISStream.ioから受信するメッセージ */
interface AisMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    ShipName: string;
    latitude: number;
    longitude: number;
    time_utc: string;
  };
  Message: {
    PositionReport?: {
      Sog: number;     // Speed Over Ground (knots × 10)
      Cog: number;     // Course Over Ground (degrees × 10)
      TrueHeading: number;
      NavigationalStatus: number;
      Latitude: number;
      Longitude: number;
    };
    ShipStaticData?: {
      Destination: string;   // AIS報告の目的港（自由テキスト）
      Eta: { Month: number; Day: number; Hour: number; Minute: number };
      ImoNumber: number;
      Draught: number;       // × 10
    };
  };
}

/** AISStreamからのメッセージ構造をランタイム検証 */
function isValidAisMessage(raw: unknown): raw is AisMessage {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as Record<string, unknown>;
  if (!m.MetaData || typeof m.MetaData !== "object") return false;
  const meta = m.MetaData as Record<string, unknown>;
  if (typeof meta.MMSI !== "number") return false;
  if (!m.Message || typeof m.Message !== "object") return false;
  return true;
}

/** KVに保存するAIS位置データ */
export interface AisPosition {
  mmsi: number;
  shipName: string;
  lat: number;
  lon: number;
  sog: number;       // knots
  cog: number;       // degrees
  heading: number;
  timestamp: string;
  fetchedAt: string;
  destination?: string;      // AIS報告の目的港
  japanBound?: boolean;      // 日本向け判定
  calculatedEtaDays?: number; // AIS位置+SOGから算出したETA
}

// ─── AIS 追跡対象の導出 ──────────────────────────────
// AISStream は MMSI でしかフィルタできない。以前はこのファイルに 21 隻を
// ハードコードしていたが、船が到着しても更新されず 2026-07-26 時点で
// 20/21 隻が既に到着済み（eta_days<=0）という陳腐化を起こしていた。
// 結果 AIS は有効メッセージ 0 件のまま「成功」と報告し続け、タンカー routine が
// 位置変化を検知できない状態が長期間続いた。
//
// そこで追跡対象は tankers.json から動的に導出する。通常のタンカー更新で
// mmsi を入れておけば AIS 追跡範囲が自動的に追随し、二度と陳腐化しない。


/** AISStream の MMSI フィルタ上限 */
const AIS_MAX_VESSELS = 50;

interface TrackedVessel {
  id: string;
  mmsi: string;
  name: string;
  destPort?: string;
}

/**
 * tankers.json から AIS 追跡対象を選ぶ。
 * mmsi を持つ船のうち、到着が近い＝観測価値の高い航行中の船を優先する。
 * 到着済み（eta_days<=0）の船は位置情報の価値が低いので後回しにし、
 * 上限に収まらない分は落とす。
 */
function deriveTrackedVessels(): TrackedVessel[] {
  const withMmsi = tankersData.vessels.filter(
    (v): v is typeof v & { mmsi: string } => typeof v.mmsi === "string" && v.mmsi.length > 0,
  );

  const inFlight = withMmsi
    .filter((v) => v.eta_days > 0)
    .sort((a, b) => a.eta_days - b.eta_days);
  const arrived = withMmsi.filter((v) => v.eta_days <= 0);

  return [...inFlight, ...arrived].slice(0, AIS_MAX_VESSELS).map((v) => ({
    id: v.id,
    mmsi: v.mmsi,
    name: v.name,
    // destinationPort は JAPAN_PORT_COORDS のキーと対応する（ETA 再計算用）
    ...(v.destinationPort ? { destPort: v.destinationPort } : {}),
  }));
}

const TRACKED_VESSELS: TrackedVessel[] = deriveTrackedVessels();

const AIS_POSITIONS_KEY = "ais_positions";

/** WebSocket の待機時間。全船分の受信に余裕を持たせる */
const AIS_TIMEOUT_MS = 20000;
const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

// ─── 日本向け判定 ─────────────────────────────────────

const JAPAN_PORT_KEYWORDS = [
  "CHIBA", "YOKKAICHI", "KAWASAKI", "KIIRE", "KITAKYUSHU", "HIROSHIMA",
  "SODEGAURA", "MIZUSHIMA", "YOKOHAMA", "KOBE", "NAGOYA", "FUTTSU",
  "SAKAI", "HIMEJI", "CHITA", "OITA", "TOBATA", "SENDAI", "NIIGATA",
  "HACHINOHE", "KASHIMA", "ANEGASAKI", "NEGISHI", "OGISHIMA",
];

function isJapanBound(destination: string): boolean {
  const d = destination.toUpperCase().trim();
  if (d.startsWith("JP")) return true;
  if (d.includes("JAPAN")) return true;
  return JAPAN_PORT_KEYWORDS.some((kw) => d.includes(kw));
}

// ─── 日本主要港座標（ETA計算用） ──────────────────────

const JAPAN_PORT_COORDS: Record<string, { lat: number; lon: number }> = {
  Chiba: { lat: 35.61, lon: 140.10 },
  Yokkaichi: { lat: 34.97, lon: 136.62 },
  Kawasaki: { lat: 35.52, lon: 139.78 },
  Kiire: { lat: 31.39, lon: 130.58 },
  Kitakyushu: { lat: 33.95, lon: 130.82 },
  Hiroshima: { lat: 34.35, lon: 132.32 },
  Sodegaura: { lat: 35.43, lon: 139.95 },
  Mizushima: { lat: 34.52, lon: 133.74 },
  Futtsu: { lat: 35.30, lon: 139.82 },
  Himeji: { lat: 34.78, lon: 134.67 },
  Sakai: { lat: 34.57, lon: 135.47 },
  Chita: { lat: 34.97, lon: 136.87 },
  Anegasaki: { lat: 35.48, lon: 140.03 },
  Nagoya: { lat: 35.08, lon: 136.88 },
  Ogishima: { lat: 35.50, lon: 139.76 },
  Sakaide: { lat: 34.32, lon: 133.86 },
  Yokohama: { lat: 35.45, lon: 139.66 },
  Tomakomai: { lat: 42.63, lon: 141.62 },
  Hitachi: { lat: 36.62, lon: 140.70 },
  Ehime: { lat: 34.06, lon: 132.85 },
  Oita: { lat: 33.25, lon: 131.70 },
  Japan: { lat: 33.95, lon: 133.00 },
};

/** 大圏距離（海里） */
function greatCircleNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) * 3440.065; // 地球半径(nm)
}

/** AIS位置+SOGから目的港までのETA日数を算出 */
function calculateEtaDays(
  lat: number, lon: number, sog: number, destPort: string | undefined,
): number | undefined {
  if (!destPort || sog < 0.5) return undefined;
  const dest = JAPAN_PORT_COORDS[destPort];
  if (!dest) return undefined;
  const distNm = greatCircleNm(lat, lon, dest.lat, dest.lon);
  return Math.round((distNm / (sog * 24)) * 10) / 10;
}

/**
 * AISStream.ioからリアルタイム位置を取得してKVに保存
 */
export async function fetchAisPositions(env: Env): Promise<{
  connected: boolean;
  received: number;
  updated: string[];
}> {
  if (!env.AISSTREAM_API_KEY) {
    console.warn("AIS tracker: AISSTREAM_API_KEY not configured");
    return { connected: false, received: 0, updated: [] };
  }

  const mmsiList = TRACKED_VESSELS.map((v) => v.mmsi);
  const mmsiToId = new Map(TRACKED_VESSELS.map((v) => [v.mmsi, v.id]));

  // 既存のAIS位置データを読み込み
  const existing: Record<string, AisPosition> =
    await env.CACHE.get<Record<string, AisPosition>>(AIS_POSITIONS_KEY, "json") ?? {};

  const updated: string[] = [];
  let received = 0;

  try {
    // WebSocket接続
    const ws = new WebSocket(AISSTREAM_URL);

    const result = await new Promise<{ received: number; updated: string[] }>((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ received, updated });
      }, AIS_TIMEOUT_MS);

      ws.addEventListener("open", () => {
        // サブスクリプションメッセージ送信（3秒以内に必須）
        const subscription = {
          APIKey: env.AISSTREAM_API_KEY,
          BoundingBoxes: [[[-90, -180], [90, 180]]], // 全世界（MMSIフィルタで絞る）
          FiltersShipMMSI: mmsiList,
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
        };
        ws.send(JSON.stringify(subscription));
        console.log(`AIS: WebSocket connected, tracking ${mmsiList.length} vessels`);
      });

      ws.addEventListener("message", (event) => {
        try {
          const parsed: unknown = JSON.parse(event.data as string);
          if (!isValidAisMessage(parsed)) return;
          const msg = parsed;
          received++;

          const mmsi = String(msg.MetaData.MMSI);
          const vesselId = mmsiToId.get(mmsi);
          if (!vesselId) return;

          const vessel = TRACKED_VESSELS.find((v) => v.id === vesselId);
          const prev = existing[vesselId];

          if (msg.Message.PositionReport) {
            const lat = msg.Message.PositionReport.Latitude ?? msg.MetaData.latitude;
            const lon = msg.Message.PositionReport.Longitude ?? msg.MetaData.longitude;
            const sog = (msg.Message.PositionReport.Sog ?? 0) / 10;

            const pos: AisPosition = {
              mmsi: msg.MetaData.MMSI,
              shipName: msg.MetaData.ShipName,
              lat,
              lon,
              sog,
              cog: (msg.Message.PositionReport.Cog ?? 0) / 10,
              heading: msg.Message.PositionReport.TrueHeading ?? 0,
              timestamp: msg.MetaData.time_utc,
              fetchedAt: new Date().toISOString(),
              destination: prev?.destination,
              japanBound: prev?.japanBound,
              calculatedEtaDays: calculateEtaDays(lat, lon, sog, vessel?.destPort),
            };

            existing[vesselId] = pos;
            updated.push(vesselId);
            console.log(`AIS: ${vesselId} (${pos.shipName}) → ${lat.toFixed(3)},${lon.toFixed(3)} SOG=${sog}kn ETA=${pos.calculatedEtaDays ?? "?"}d`);
          }

          if (msg.Message.ShipStaticData) {
            const dest = msg.Message.ShipStaticData.Destination?.trim() || undefined;
            const japanBound = dest ? isJapanBound(dest) : undefined;

            if (prev) {
              prev.destination = dest;
              prev.japanBound = japanBound;
            } else {
              existing[vesselId] = {
                mmsi: msg.MetaData.MMSI,
                shipName: msg.MetaData.ShipName,
                lat: msg.MetaData.latitude,
                lon: msg.MetaData.longitude,
                sog: 0, cog: 0, heading: 0,
                timestamp: msg.MetaData.time_utc,
                fetchedAt: new Date().toISOString(),
                destination: dest,
                japanBound: japanBound,
              };
            }
            if (!updated.includes(vesselId)) updated.push(vesselId);
            console.log(`AIS: ${vesselId} destination="${dest}" japanBound=${japanBound}`);
          }
        } catch {
          // パースエラーは無視
        }
      });

      ws.addEventListener("error", (e) => {
        console.error("AIS WebSocket error:", e);
        clearTimeout(timeout);
        resolve({ received, updated });
      });

      ws.addEventListener("close", () => {
        clearTimeout(timeout);
        resolve({ received, updated });
      });
    });

    // KVに保存（24時間保持）
    await env.CACHE.put(AIS_POSITIONS_KEY, JSON.stringify(existing), {
      expirationTtl: 86400,
    });

    // 収穫ゼロを可視化する。received=0 でも Promise は resolve するため
    // cron からは «fulfilled» に見え、無収穫が長期間気付かれない状態だった。
    // 診断記録を残して /api/ais から観測できるようにする。
    await writeAisDiagnostic(env.CACHE, {
      tracked: mmsiList.length,
      received: result.received,
      updated: result.updated.length,
    });

    if (result.received === 0) {
      console.warn(
        `AIS: 収穫ゼロ — ${mmsiList.length}隻を購読したが ${AIS_TIMEOUT_MS / 1000}秒間で有効メッセージ0件。` +
        `APIキーの失効、または TRACKED_VESSELS が就航中の船を含んでいない可能性がある`,
      );
    } else {
      console.log(`AIS: ${result.updated.length} vessels updated, ${result.received} messages received`);
    }
    return { connected: true, ...result };

  } catch (e) {
    console.error("AIS tracker error:", e);
    return { connected: false, received: 0, updated: [] };
  }
}

/** KVからAIS位置データを取得 */
export async function getAisPositions(cache: KVNamespace): Promise<Record<string, AisPosition>> {
  return await cache.get<Record<string, AisPosition>>(AIS_POSITIONS_KEY, "json") ?? {};
}

// ─── 取得結果の診断記録 ──────────────────────────────
// 「取得は成功したが中身が空」を外から判別できるようにする。

const AIS_DIAGNOSTIC_KEY = "ais:last_result";

export interface AisDiagnostic {
  /** 購読した MMSI 数（= TRACKED_VESSELS の件数） */
  tracked: number;
  /** 受信した有効 AIS メッセージ数 */
  received: number;
  /** 位置を更新できた船の数 */
  updated: number;
  fetchedAt: string;
}

async function writeAisDiagnostic(
  cache: KVNamespace,
  r: Omit<AisDiagnostic, "fetchedAt">,
): Promise<void> {
  try {
    const record: AisDiagnostic = { ...r, fetchedAt: new Date().toISOString() };
    await cache.put(AIS_DIAGNOSTIC_KEY, JSON.stringify(record), { expirationTtl: 86400 * 30 });
  } catch (err) {
    // 診断記録の失敗で本体を止めない
    console.warn(`AIS diagnostic write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 直近の AIS 取得結果（未取得なら null） */
export async function getAisDiagnostic(cache: KVNamespace): Promise<AisDiagnostic | null> {
  const raw = await cache.get(AIS_DIAGNOSTIC_KEY, "text");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AisDiagnostic;
  } catch {
    return null;
  }
}

/** 追跡対象船舶の一覧 */
export { TRACKED_VESSELS };

// ─── AIS → tanker_overrides 自動同期 ─────────────────────────

/**
 * AIS位置データをもとに tanker_overrides KVを自動更新し、
 * タンカーAPIキャッシュを無効化する。
 *
 * Cron内で fetchAisPositions() の直後に呼び出すことで、
 * AIS取得→ETA自動反映→キャッシュ更新まで一気通貫で完了する。
 *
 * 更新条件:
 *   - calculatedEtaDays が 0.3〜60日の範囲 → eta_days を上書き
 *   - SOG < 0.3kn かつ calculatedEtaDays が未算出 → 現在の override を維持（上書きしない）
 *
 * cron.ts からは `fetchAisPositions(env).then(() => applyAisToOverrides(env.CACHE))` で呼ぶ
 */
export async function applyAisToOverrides(
  cache: KVNamespace,
): Promise<{ updated: string[]; skipped: string[] }> {
  // KVから最新AIS位置を読み込む（fetchAisPositions()が保存した値）
  const positions = await getAisPositions(cache);

  const existing: TankerOverride[] =
    await cache.get<TankerOverride[]>(TANKER_OVERRIDES_KEY, "json") ?? [];
  const overrideMap = new Map(existing.map((o) => [o.id, o]));

  const updated: string[] = [];
  const skipped: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const [vesselId, pos] of Object.entries(positions)) {
    const etaDays = pos.calculatedEtaDays;

    // ETAが算出できない（停泊中・速度不足）はスキップ（既存overrideを保護）
    if (etaDays == null || etaDays < 0.3 || etaDays > 60) {
      skipped.push(vesselId);
      continue;
    }

    const rounded = Math.round(etaDays * 10) / 10;
    const override: TankerOverride = {
      id: vesselId,
      eta_days: rounded,
      status: overrideMap.get(vesselId)?.status, // 既存ステータスを維持
      note: `AIS自動: SOG=${pos.sog.toFixed(1)}kn pos=${pos.lat.toFixed(2)},${pos.lon.toFixed(2)}`,
      updatedAt: today,
    };

    overrideMap.set(vesselId, override);
    updated.push(vesselId);
    console.log(`AIS→override: ${vesselId} (${pos.shipName}) eta=${rounded}d SOG=${pos.sog.toFixed(1)}kn`);
  }

  if (updated.length > 0) {
    const newOverrides = Array.from(overrideMap.values());
    await cache.put(TANKER_OVERRIDES_KEY, JSON.stringify(newOverrides), {
      expirationTtl: 86400 * 30, // 30日保持
    });
    // AIS最終成功取得タイムスタンプを保存（UI表示・鮮度管理用）
    await cache.put(AIS_LAST_SUCCESS_KEY, new Date().toISOString(), {
      expirationTtl: 86400 * 7, // 7日保持
    });
    // タンカーAPIキャッシュを無効化（次リクエストで最新ETA反映）
    await cache.delete(TANKERS_CACHE_KEY);
    console.log(`AIS→overrides: ${updated.length}隻更新, ${skipped.length}隻スキップ`);
  }

  return { updated, skipped };
}
