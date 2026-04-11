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

// ─── 船舶MMSI一覧 ────────────────────────────────────
// IMO→MMSI対応（MarineTraffic/VesselFinder公開データより）
// AISStream.ioはMMSIフィルタのみ対応

const TRACKED_VESSELS: Array<{ id: string; mmsi: string; name: string; destPort?: string }> = [
  // ─── VLCC ────────────────────────────────────────────────────────────
  { id: "vlcc-alt-06", mmsi: "636021014", name: "TATESHINA",       destPort: "Ehime" },       // IMO 9910117 米国ガルフ→喜望峰→愛媛
  { id: "vlcc-02",     mmsi: "538003869", name: "KAZUSA",          destPort: "Mizushima" },    // IMO 9513402
  { id: "vlcc-03",     mmsi: "354919000", name: "TAKASAGO",        destPort: "Mizushima" },    // IMO 9770696
  { id: "vlcc-05",     mmsi: "477254200", name: "ENEOS OCEAN",     destPort: "Oita" },         // IMO 9662875 JX Ocean
  { id: "vlcc-alt-04", mmsi: "303521000", name: "KHURAIS",         destPort: "Yokkaichi" },    // IMO 9783679 Bahri/スエズ経由
  { id: "vlcc-alt-07", mmsi: "352002979", name: "ENEOS GLORY",     destPort: "Oita" },         // IMO 9851608 JX Ocean/STS転送
  // ─── VLCCサイズ以外の代替ルート ──────────────────────────────────────
  { id: "tanker-alt-05", mmsi: "403494000", name: "NCC HUDA",      destPort: "Yokohama" },     // IMO 9399272 Bahri MRタンカー
  // ─── LNG ────────────────────────────────────────────────────────────
  { id: "lng-01",      mmsi: "432807000", name: "ENERGY HORIZON",  destPort: "Yokohama" },     // IMO 9483877 Gorgon→横浜
  { id: "lng-02",      mmsi: "311000261", name: "SEISHU MARU",     destPort: "Kawasaki" },     // IMO 9666558
  { id: "lng-03",      mmsi: "212883000", name: "GRAND ANIVA",     destPort: "Kitakyushu" },   // IMO 9338955 サハリン2
  { id: "lng-04",      mmsi: "563099000", name: "DIAMOND GAS ORCHID", destPort: "Yokkaichi" }, // IMO 9779226
  { id: "lng-05",      mmsi: "432634000", name: "ENERGY NAVIGATOR",destPort: "Hiroshima" },    // IMO 9355264
  { id: "lng-06",      mmsi: "432884000", name: "ENERGY ADVANCE",  destPort: "Hitachi" },      // IMO 9269180 サハリン2→日立
  { id: "lng-07",      mmsi: "432924000", name: "LNG MARS",        destPort: "Sakai" },        // IMO 9645748 Darwin→堺
  { id: "lng-08",      mmsi: "311058200", name: "ASIA VENTURE",    destPort: "Yokkaichi" },    // IMO 9680190 Ashburton→四日市
  { id: "lng-09",      mmsi: "357186000", name: "SOHAR LNG",       destPort: "Japan" },        // IMO 9210816 ホルムズ通過第1号
  { id: "lng-10",      mmsi: "355037000", name: "DIAMOND GAS ROSE",destPort: "Futtsu" },       // IMO 9355252 サハリン2→富津
  { id: "lng-11",      mmsi: "352965000", name: "PACIFIC NOTUS",   destPort: "Sodegaura" },    // IMO 9309688 Bintulu→袖ケ浦
  { id: "lng-12",      mmsi: "432820000", name: "ENERGY FRONTIER", destPort: "Chiba" },        // IMO 9422908 Gladstone→千葉
  // ─── 引き返し/監視対象 ────────────────────────────────────────────────
  { id: "lng-cat-01",  mmsi: "311133000", name: "AL DAAYEN",       destPort: "Japan" },        // IMO 9325702 カタール/引き返し
  { id: "lng-cat-02",  mmsi: "538006284", name: "RASHEEDA",        destPort: "Japan" },        // IMO 9443413 カタール/引き返し
];

const AIS_POSITIONS_KEY = "ais_positions";
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
      }, 20000); // 20秒でタイムアウト（全船取得に余裕を持たせる）

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

    console.log(`AIS: ${result.updated.length} vessels updated, ${result.received} messages received`);
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
