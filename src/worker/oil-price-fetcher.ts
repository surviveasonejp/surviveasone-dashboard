/**
 * WTI原油価格 日次自動取得
 *
 * EIA (U.S. Energy Information Administration) の公式APIから
 * WTI原油スポット価格（$/バレル）を取得し、D1 + KVに保存する。
 *
 * Cron: UTC 18:00（JST 03:00）に電力需給・AISと並行して実行
 * APIシリーズ: RWTC（WTI Crude Oil, Cushing OK）
 */

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  EIA_API_KEY: string;
}

interface EiaResponse {
  response: {
    data: Array<{
      period: string;
      value: string | null;
    }>;
  };
}

const EIA_WTI_URL = "https://api.eia.gov/v2/petroleum/pri/spt/data/";
const WTI_SERIES = "RWTC";

// バリデーション閾値
const WTI_MIN_USD = 10;
const WTI_MAX_USD = 300;
const WTI_MAX_DAILY_CHANGE_PCT = 0.20; // 20%超の変動は異常値と判定

export const KV_KEY_OIL_PRICE = "oil:wti:latest";
export const KV_TTL_OIL_PRICE = 86400; // 24時間

export async function fetchOilPrice(env: Env): Promise<void> {
  const url = new URL(EIA_WTI_URL);
  url.searchParams.set("api_key", env.EIA_API_KEY);
  url.searchParams.set("frequency", "daily");
  url.searchParams.append("data[0]", "value");
  url.searchParams.set("facets[series][]", WTI_SERIES);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("length", "1");

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (e) {
    console.error("EIA API fetch failed:", e);
    return;
  }

  if (!response.ok) {
    console.error(`EIA API error: ${response.status} ${response.statusText}`);
    return;
  }

  let json: EiaResponse;
  try {
    json = await response.json() as EiaResponse;
  } catch (e) {
    console.error("EIA API: failed to parse JSON:", e);
    return;
  }

  const record = json.response?.data?.[0];
  if (!record || record.value === null || record.value === undefined) {
    console.error("EIA API: no data in response");
    return;
  }

  const wti = parseFloat(record.value);
  const date = record.period; // "YYYY-MM-DD"

  // 絶対範囲チェック
  if (isNaN(wti) || wti < WTI_MIN_USD || wti > WTI_MAX_USD) {
    console.error(`WTI validation failed: ${wti} outside ${WTI_MIN_USD}-${WTI_MAX_USD} range`);
    return;
  }

  // 前回値との乖離チェック
  const prev = await env.DB
    .prepare("SELECT wti_usd FROM oil_prices ORDER BY date DESC LIMIT 1")
    .first<{ wti_usd: number }>();
  if (prev) {
    const change = Math.abs(wti - prev.wti_usd) / prev.wti_usd;
    if (change > WTI_MAX_DAILY_CHANGE_PCT) {
      console.error(
        `WTI validation failed: change ${(change * 100).toFixed(1)}% exceeds 20%` +
        ` (prev=${prev.wti_usd}, new=${wti})`,
      );
      return;
    }
  }

  // D1に保存
  await env.DB.prepare(`
    INSERT INTO oil_prices (date, wti_usd, source, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      wti_usd = excluded.wti_usd,
      updated_at = datetime('now')
  `).bind(date, wti, `EIA ${WTI_SERIES} WTI Spot Price`).run();

  // KVに最新値を保存
  await env.CACHE.put(
    KV_KEY_OIL_PRICE,
    JSON.stringify({ wti_usd: wti, date, updatedAt: new Date().toISOString() }),
    { expirationTtl: KV_TTL_OIL_PRICE },
  );

  console.log(`WTI oil price updated: $${wti}/barrel (${date})`);
}
