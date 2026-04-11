/**
 * 貿易統計 自動取得（ホルムズ依存率 月次更新）
 *
 * 資源エネルギー庁「石油輸入統計（pl006）」HTML から
 * 原油・LNG の原産国別輸入量を取得し、ホルムズ依存率を計算して
 * D1 の trade_statistics テーブルを更新する。
 *
 * フォールバック: e-Stat API（ESTAT_APP_ID が設定されている場合）
 *
 * Cron: 毎月18日 UTC 6:00（既存の reserves/LNG 更新と相乗り）
 *
 * ホルムズ依存率の算出基準:
 *   中東（ホルムズ経由）= サウジアラビア + UAE + クウェート + カタール + イラク + イラン + バーレーン + オマーン
 *   原油の場合: 輸出港がホルムズ海峡内側の産地のみカウント
 *   注: アラブ首長国連邦のフジャイラ積出し分は一部ホルムズ外だが、統計上は UAE として集計
 */

import { fetchEStatData, normalizeValues, generateMonthCodes } from "./estat-client";
import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ESTAT_APP_ID?: string;
}

// ホルムズ経由とみなす中東産油国コード（ISO 3166-1 alpha-3 相当）
const HORMUZ_COUNTRIES_OIL = new Set([
  "SAU", // サウジアラビア
  "ARE", // アラブ首長国連邦
  "KWT", // クウェート
  "QAT", // カタール
  "IRQ", // イラク
  "IRN", // イラン
  "BHR", // バーレーン
  "OMN", // オマーン（マスカット積出し）
]);

// LNG 輸入でホルムズ経由とみなす国
const HORMUZ_COUNTRIES_LNG = new Set([
  "QAT", // カタール（全量ラスラファン積出し）
  "ARE", // UAE（ダス島）
  "OMN", // オマーン（LNG 輸出）
]);

// 資源エネルギー庁 石油輸入統計 URL パターン
// pl006: https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl006/results.html
const ENECHO_OIL_IMPORT_BASE =
  "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl006";

// e-Stat 統計表ID（外国貿易統計 輸入 品目別国別）
// 0003522697: 外国貿易概況 輸入 原油（HS: 2709）国別月次
const ESTAT_TRADE_CRUDE_ID = "0003522697";
// 0003522698: 外国貿易概況 輸入 LNG（HS: 2711210000）国別月次
const ESTAT_TRADE_LNG_ID = "0003522698";

/** 国名→ISO コードのマッピング（日本語表記） */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "サウジアラビア": "SAU",
  "アラブ首長国連邦": "ARE",
  "ＵＡＥ": "ARE",
  "UAE": "ARE",
  "クウェート": "KWT",
  "カタール": "QAT",
  "イラク": "IRQ",
  "イラン": "IRN",
  "バーレーン": "BHR",
  "オマーン": "OMN",
  "ロシア": "RUS",
  "マレーシア": "MYS",
  "オーストラリア": "AUS",
  "アメリカ": "USA",
  "米国": "USA",
};

/** 抽出した輸入量データ */
interface TradeExtract {
  month: string;            // YYYY-MM
  commodity: "crude_oil" | "lng";
  origins: Array<{
    countryCode: string;    // ISO 3166-1 alpha-3
    countryName: string;    // 日本語国名
    volumeKl: number;       // 数量（kL）
  }>;
  totalVolumeKl: number;
}

/**
 * 貿易統計データを取得して D1 を更新
 */
export async function fetchTradeUpdate(env: Env): Promise<void> {
  console.log("Trade statistics update starting...");

  // e-Stat API を優先、フォールバックは METI HTML スクレイピング
  const extracted: TradeExtract[] = [];

  if (env.ESTAT_APP_ID) {
    const estatResults = await fetchFromEStatApi(env.ESTAT_APP_ID);
    extracted.push(...estatResults);
  }

  if (extracted.length === 0) {
    // e-Stat 未設定またはエラー時は HTML スクレイピング
    const htmlResults = await fetchFromMetiHtml();
    extracted.push(...htmlResults);
  }

  if (extracted.length === 0) {
    console.warn("Trade update: no data extracted from any source");
    await env.CACHE.put("trade_update_needed", "true", { expirationTtl: 86400 * 30 });
    return;
  }

  // D1 更新
  for (const extract of extracted) {
    const hormuzCountries = extract.commodity === "crude_oil"
      ? HORMUZ_COUNTRIES_OIL
      : HORMUZ_COUNTRIES_LNG;

    const hormuzVolumeKl = extract.origins
      .filter((o) => hormuzCountries.has(o.countryCode))
      .reduce((sum, o) => sum + o.volumeKl, 0);

    const hormuzRate = extract.totalVolumeKl > 0
      ? hormuzVolumeKl / extract.totalVolumeKl
      : 0;

    // バリデーション: 原油は 85%〜100%、LNG は 0%〜20% が想定範囲
    const [minRate, maxRate] = extract.commodity === "crude_oil" ? [0.75, 1.0] : [0.0, 0.30];
    if (hormuzRate < minRate || hormuzRate > maxRate) {
      console.warn(
        `Trade validation failed: ${extract.commodity} hormuzRate=${(hormuzRate * 100).toFixed(1)}%` +
        ` outside ${(minRate * 100).toFixed(0)}-${(maxRate * 100).toFixed(0)}% range`,
      );
      continue;
    }

    // 上位 5 国の内訳（JSON）
    const topOrigins = [...extract.origins]
      .sort((a, b) => b.volumeKl - a.volumeKl)
      .slice(0, 5)
      .map((o) => ({
        country: o.countryCode,
        name: o.countryName,
        share: Math.round(o.volumeKl / extract.totalVolumeKl * 1000) / 1000,
      }));

    await env.DB.prepare(`
      INSERT INTO trade_statistics
        (month, commodity, total_volume_kl, mideast_volume_kl, hormuz_rate, top_origins, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(month, commodity) DO UPDATE SET
        total_volume_kl   = excluded.total_volume_kl,
        mideast_volume_kl = excluded.mideast_volume_kl,
        hormuz_rate       = excluded.hormuz_rate,
        top_origins       = excluded.top_origins,
        source            = excluded.source,
        updated_at        = datetime('now')
    `).bind(
      extract.month,
      extract.commodity,
      extract.totalVolumeKl,
      hormuzVolumeKl,
      Math.round(hormuzRate * 10000) / 10000,
      JSON.stringify(topOrigins),
      env.ESTAT_APP_ID ? "e-Stat 外国貿易統計" : "資源エネルギー庁 石油輸入統計",
    ).run();

    console.log(
      `Trade upserted: ${extract.month} ${extract.commodity}` +
      ` hormuz=${(hormuzRate * 100).toFixed(1)}% (${extract.origins.length}カ国)`,
    );

    // reserves テーブルのホルムズ率を更新（最新月のみ）
    if (extract.commodity === "crude_oil") {
      await env.DB.prepare(
        "UPDATE reserves SET oil_hormuz_rate = ?, updated_at = datetime('now')" +
        " WHERE date = (SELECT MAX(date) FROM reserves)",
      ).bind(Math.round(hormuzRate * 10000) / 10000).run();
      console.log(`reserves.oil_hormuz_rate updated: ${(hormuzRate * 100).toFixed(1)}%`);
    } else if (extract.commodity === "lng") {
      await env.DB.prepare(
        "UPDATE reserves SET lng_hormuz_rate = ?, updated_at = datetime('now')" +
        " WHERE date = (SELECT MAX(date) FROM reserves)",
      ).bind(Math.round(hormuzRate * 10000) / 10000).run();
      console.log(`reserves.lng_hormuz_rate updated: ${(hormuzRate * 100).toFixed(1)}%`);
    }
  }

  // KV キャッシュ無効化
  await invalidateCache(env.CACHE, [
    CACHE_KEYS.RESERVES_LATEST,
    CACHE_KEYS.TRADE_LATEST,
  ]);
  await env.CACHE.delete("trade_update_needed");
  console.log("Trade statistics update completed");
}

// ─── e-Stat API フェッチ ──────────────────────────────

async function fetchFromEStatApi(appId: string): Promise<TradeExtract[]> {
  const results: TradeExtract[] = [];
  // 直近3ヶ月分の月コードを生成（公表は約2ヶ月遅れ）
  const monthCodes = generateMonthCodes(4);

  // 原油
  for (const monthCode of monthCodes) {
    const data = await fetchEStatData(appId, {
      statsDataId: ESTAT_TRADE_CRUDE_ID,
      cdTime: monthCode,
      limit: 100,
    });
    if (!data) continue;

    const values = normalizeValues(data);
    if (values.length === 0) continue;

    const origins: TradeExtract["origins"] = [];
    let total = 0;

    for (const v of values) {
      if (!v.$ || v.$ === "-") continue;
      const volumeKl = parseFloat(v.$.replace(/,/g, ""));
      if (isNaN(volumeKl) || volumeKl <= 0) continue;

      const countryName = v["@area"] ?? "";
      const countryCode = COUNTRY_NAME_TO_CODE[countryName] ?? countryName.slice(0, 3).toUpperCase();
      origins.push({ countryCode, countryName, volumeKl });
      total += volumeKl;
    }

    if (origins.length > 0 && total > 0) {
      const ym = monthCode.slice(0, 4) + "-" + monthCode.slice(6, 8);
      results.push({ month: ym, commodity: "crude_oil", origins, totalVolumeKl: total });
      break; // 最新月が取れたら終了
    }
  }

  // LNG は同様の処理（statsDataId を差し替え）
  for (const monthCode of monthCodes) {
    const data = await fetchEStatData(appId, {
      statsDataId: ESTAT_TRADE_LNG_ID,
      cdTime: monthCode,
      limit: 50,
    });
    if (!data) continue;

    const values = normalizeValues(data);
    if (values.length === 0) continue;

    const origins: TradeExtract["origins"] = [];
    let total = 0;

    for (const v of values) {
      if (!v.$ || v.$ === "-") continue;
      const volumeKl = parseFloat(v.$.replace(/,/g, ""));
      if (isNaN(volumeKl) || volumeKl <= 0) continue;

      const countryName = v["@area"] ?? "";
      const countryCode = COUNTRY_NAME_TO_CODE[countryName] ?? countryName.slice(0, 3).toUpperCase();
      origins.push({ countryCode, countryName, volumeKl });
      total += volumeKl;
    }

    if (origins.length > 0 && total > 0) {
      const ym = monthCode.slice(0, 4) + "-" + monthCode.slice(6, 8);
      results.push({ month: ym, commodity: "lng", origins, totalVolumeKl: total });
      break;
    }
  }

  return results;
}

// ─── METI HTML スクレイピング（フォールバック） ────────

async function fetchFromMetiHtml(): Promise<TradeExtract[]> {
  const results: TradeExtract[] = [];
  const now = new Date();

  // pl006 概況ページ: 直近4ヶ月を試行（公表は約2ヶ月遅れ）
  for (let offset = 2; offset <= 5; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const ym = `${yyyy}-${mm}`;
    const url = `${ENECHO_OIL_IMPORT_BASE}/${yyyy}/${yyyy}_${mm}.html`;

    let html: string;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SurviveAsOne-Bot/1.0" },
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }

    // 原油輸入の国別テーブルを解析
    const crudeExtract = parseMetiImportHtml(html, ym, "crude_oil");
    if (crudeExtract) {
      results.push(crudeExtract);
      break;
    }
  }

  return results;
}

/**
 * METI pl006 HTML から原産国別輸入量を解析
 * テーブル構造: 国名 | 数量(kL) | 金額(千円)
 */
function parseMetiImportHtml(
  html: string,
  month: string,
  commodity: "crude_oil" | "lng",
): TradeExtract | null {
  // 国名と数量のパターン: テーブルセルから抽出
  // "サウジアラビア" に続く数値を kL として取得
  const origins: TradeExtract["origins"] = [];
  let totalVolumeKl = 0;

  for (const [jpName, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    // 国名の後に続く数値（カンマ区切り）を探す
    const pattern = new RegExp(
      jpName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "[^0-9]*([0-9,]{3,}(?:\\.[0-9]+)?)",
    );
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    const vol = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(vol) || vol <= 0) continue;

    origins.push({ countryCode: code, countryName: jpName, volumeKl: vol });
    totalVolumeKl += vol;
  }

  // 合計行を探す
  const totalMatch = html.match(/合\s*計[^0-9]*([0-9,]{5,}(?:\.[0-9]+)?)/);
  if (totalMatch?.[1]) {
    const parsed = parseFloat(totalMatch[1].replace(/,/g, ""));
    if (!isNaN(parsed) && parsed > totalVolumeKl) {
      totalVolumeKl = parsed;
    }
  }

  if (origins.length < 3 || totalVolumeKl <= 0) return null;

  return { month, commodity, origins, totalVolumeKl };
}
