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
  };
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
}

// ─── 船舶MMSI一覧 ────────────────────────────────────
// IMO→MMSI対応（MarineTraffic/VesselFinder公開データより）
// AISStream.ioはMMSIフィルタのみ対応

const TRACKED_VESSELS: Array<{ id: string; mmsi: string; name: string }> = [
  // VLCC
  { id: "vlcc-01", mmsi: "636021014", name: "TATESHINA" },          // IMO 9910117
  { id: "vlcc-02", mmsi: "538003869", name: "KAZUSA" },             // IMO 9513402
  { id: "vlcc-03", mmsi: "354919000", name: "TAKASAGO" },           // IMO 9770696
  // LNG
  { id: "lng-01", mmsi: "311003300", name: "QUEST KIRISHIMA" },     // IMO 9963853 (estimated)
  { id: "lng-02", mmsi: "374375000", name: "MARVEL EAGLE" },        // IMO 9759240
  { id: "lng-03", mmsi: "212883000", name: "GRAND ANIVA" },         // IMO 9338955
  { id: "lng-04", mmsi: "563098700", name: "SHARQ" },               // IMO 9981506 (estimated)
  { id: "lng-05", mmsi: "432634000", name: "ENERGY NAVIGATOR" },    // IMO 9355264
  { id: "lng-06", mmsi: "228099000", name: "ELISA HALCYON" },       // IMO 9980552 (estimated)
  { id: "lng-07", mmsi: "563098800", name: "AL ZUWAIR" },           // IMO 9981491 (estimated)
];

const AIS_POSITIONS_KEY = "ais_positions";
const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

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
      }, 8000); // 8秒でタイムアウト（Cron CPU制限内）

      ws.addEventListener("open", () => {
        // サブスクリプションメッセージ送信（3秒以内に必須）
        const subscription = {
          APIKey: env.AISSTREAM_API_KEY,
          BoundingBoxes: [[[-90, -180], [90, 180]]], // 全世界（MMSIフィルタで絞る）
          FiltersShipMMSI: mmsiList,
          FilterMessageTypes: ["PositionReport"],
        };
        ws.send(JSON.stringify(subscription));
        console.log(`AIS: WebSocket connected, tracking ${mmsiList.length} vessels`);
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg: AisMessage = JSON.parse(event.data as string);
          received++;

          const mmsi = String(msg.MetaData.MMSI);
          const vesselId = mmsiToId.get(mmsi);
          if (!vesselId) return;

          const pos: AisPosition = {
            mmsi: msg.MetaData.MMSI,
            shipName: msg.MetaData.ShipName,
            lat: msg.Message.PositionReport?.Latitude ?? msg.MetaData.latitude,
            lon: msg.Message.PositionReport?.Longitude ?? msg.MetaData.longitude,
            sog: (msg.Message.PositionReport?.Sog ?? 0) / 10,
            cog: (msg.Message.PositionReport?.Cog ?? 0) / 10,
            heading: msg.Message.PositionReport?.TrueHeading ?? 0,
            timestamp: msg.MetaData.time_utc,
            fetchedAt: new Date().toISOString(),
          };

          existing[vesselId] = pos;
          updated.push(vesselId);
          console.log(`AIS: ${vesselId} (${pos.shipName}) → ${pos.lat.toFixed(3)},${pos.lon.toFixed(3)} SOG=${pos.sog}kn`);
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
