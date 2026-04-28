/**
 * 日本銀行 輸入物価指数 月次自動取得（Phase 25）
 *
 * 日銀 時系列統計データ検索サイト API（2026-02-18 公開・認証不要・JSON）から
 * 輸入物価指数（円ベース・契約通貨ベース）の月次データを取得し
 * D1 の import_price_index テーブルを更新する。
 *
 * データソース:
 *   https://www.stat-search.boj.or.jp/api/v1/getDataCode
 *   ?db=PR01&code=PRCG20_2600000000,PRCG20_2500000000
 *
 *   PRCG20_2600000000: [輸入物価指数/円ベース] 総平均（2020年=100）
 *   PRCG20_2500000000: [輸入物価指数/契約通貨ベース] 総平均（2020年=100）
 *
 * Cron: 毎月18日 UTC 6:00（reserves/LNG/trade と相乗り。日銀の公表は概ね毎月10日前後）
 *
 * 活用:
 *  - EconomicCascade.tsx の WTI 連動モデルを実測ベースで補正
 *  - DecisionTriadPanel の「事実」枠に輸入物価上昇率を提示
 *  - MyHypothesisPanel のシナリオ仮説と公式統計の並置
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

const BOJ_API_BASE = "https://www.stat-search.boj.or.jp/api/v1";
const BOJ_DB_NAME = "PR01";

const SERIES_YEN_BASE = "PRCG20_2600000000";
const SERIES_CONTRACT_BASE = "PRCG20_2500000000";

const SOURCE_LABEL = "日本銀行 企業物価指数 2020年基準（時系列統計データ検索サイト API）";

// バリデーション閾値（2020年=100基準。歴史的には50〜250の範囲）
const INDEX_MIN = 30;
const INDEX_MAX = 400;
// 月次の前回比は通常 ±10% 以内。±25%超は異常値として弾く
const MAX_MONTHLY_CHANGE = 0.25;
// 取込対象月数（直近 N ヶ月）
const UPSERT_MONTHS = 24;

interface BojSeriesValues {
  SURVEY_DATES: number[]; // [YYYYMM, ...]
  VALUES: Array<number | null>;
}

interface BojSeriesEntry {
  SERIES_CODE: string;
  NAME_OF_TIME_SERIES_J?: string;
  UNIT_J?: string;
  FREQUENCY?: string;
  LAST_UPDATE?: number;
  VALUES: BojSeriesValues;
}

interface BojResponse {
  STATUS: number;
  MESSAGE?: string;
  RESULTSET: BojSeriesEntry[];
}

function isValidBojResponse(raw: unknown): raw is BojResponse {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (typeof r.STATUS !== "number") return false;
  if (!Array.isArray(r.RESULTSET)) return false;
  return true;
}

interface MonthlyPoint {
  month: string; // YYYY-MM
  value: number;
}

/** SURVEY_DATES（数値 YYYYMM）と VALUES を直近 limit 件の MonthlyPoint へ畳み込む */
function extractRecent(entry: BojSeriesEntry, limit: number): MonthlyPoint[] {
  const dates = entry.VALUES?.SURVEY_DATES ?? [];
  const values = entry.VALUES?.VALUES ?? [];
  const out: MonthlyPoint[] = [];
  const start = Math.max(0, dates.length - limit);
  for (let i = start; i < dates.length; i++) {
    const d = dates[i];
    const v = values[i];
    if (typeof d !== "number" || typeof v !== "number" || !isFinite(v)) continue;
    const yyyy = Math.floor(d / 100);
    const mm = d % 100;
    if (yyyy < 1960 || yyyy > 2999 || mm < 1 || mm > 12) continue;
    out.push({
      month: `${yyyy}-${String(mm).padStart(2, "0")}`,
      value: v,
    });
  }
  return out;
}

export async function fetchBojImportPriceUpdate(env: Env): Promise<void> {
  console.log("BOJ import price index update starting...");

  const url = new URL(`${BOJ_API_BASE}/getDataCode`);
  url.searchParams.set("db", BOJ_DB_NAME);
  url.searchParams.set("code", `${SERIES_YEN_BASE},${SERIES_CONTRACT_BASE}`);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { "User-Agent": "SurviveAsOne-Bot/1.0 (surviveasonejp.org)" },
    });
  } catch (e) {
    console.error("BOJ API fetch failed:", e);
    return;
  }

  if (!response.ok) {
    console.error(`BOJ API error: ${response.status} ${response.statusText}`);
    return;
  }

  let json: BojResponse;
  try {
    const parsed: unknown = await response.json();
    if (!isValidBojResponse(parsed)) {
      console.error("BOJ API: unexpected response schema");
      return;
    }
    json = parsed;
  } catch (e) {
    console.error("BOJ API: failed to parse JSON:", e);
    return;
  }

  if (json.STATUS !== 200) {
    console.error(`BOJ API status=${json.STATUS} message=${json.MESSAGE ?? ""}`);
    return;
  }

  const yenSeries = json.RESULTSET.find((s) => s.SERIES_CODE === SERIES_YEN_BASE);
  const contractSeries = json.RESULTSET.find(
    (s) => s.SERIES_CODE === SERIES_CONTRACT_BASE,
  );

  if (!yenSeries) {
    console.error(`BOJ API: series ${SERIES_YEN_BASE} not found in response`);
    return;
  }

  const yenPoints = extractRecent(yenSeries, UPSERT_MONTHS);
  if (yenPoints.length === 0) {
    console.error("BOJ API: no usable yen-base points");
    return;
  }

  const contractMap = new Map<string, number>();
  if (contractSeries) {
    for (const p of extractRecent(contractSeries, UPSERT_MONTHS)) {
      contractMap.set(p.month, p.value);
    }
  }

  // 前回値との乖離チェック（最新点のみ・閾値超過なら全体を破棄して警告）
  const latest = yenPoints[yenPoints.length - 1];
  if (!latest) {
    console.error("BOJ API: latest point missing after extraction");
    return;
  }

  if (latest.value < INDEX_MIN || latest.value > INDEX_MAX) {
    console.error(
      `BOJ validation failed: yen_base=${latest.value} outside ${INDEX_MIN}-${INDEX_MAX}`,
    );
    return;
  }

  const prev = await env.DB
    .prepare("SELECT yen_base FROM import_price_index ORDER BY month DESC LIMIT 1")
    .first<{ yen_base: number }>();
  if (prev) {
    const change = Math.abs(latest.value - prev.yen_base) / prev.yen_base;
    if (change > MAX_MONTHLY_CHANGE) {
      console.error(
        `BOJ validation failed: monthly change ${(change * 100).toFixed(1)}%` +
          ` exceeds ${(MAX_MONTHLY_CHANGE * 100).toFixed(0)}%` +
          ` (prev=${prev.yen_base}, new=${latest.value})`,
      );
      return;
    }
  }

  // UPSERT（直近 24 ヶ月）
  let upserted = 0;
  for (const p of yenPoints) {
    if (p.value < INDEX_MIN || p.value > INDEX_MAX) continue;
    const contract = contractMap.get(p.month) ?? null;
    await env.DB.prepare(
      `INSERT INTO import_price_index (month, yen_base, contract_base, source, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(month) DO UPDATE SET
         yen_base      = excluded.yen_base,
         contract_base = excluded.contract_base,
         source        = excluded.source,
         updated_at    = datetime('now')`,
    )
      .bind(p.month, p.value, contract, SOURCE_LABEL)
      .run();
    upserted++;
  }

  await invalidateCache(env.CACHE, [CACHE_KEYS.IMPORT_PRICE_LATEST]);

  console.log(
    `BOJ import price upserted: ${upserted} months,` +
      ` latest=${latest.month} yen_base=${latest.value}` +
      ` (last_update=${yenSeries.LAST_UPDATE ?? "unknown"})`,
  );
}
