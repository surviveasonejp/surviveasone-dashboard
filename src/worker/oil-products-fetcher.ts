/**
 * 石油製品在庫 週次自動取得 — 【凍結中 2026-07-23】
 *
 * cron からの呼び出しを外した。以下の調査で、この実装は前提から誤っており
 * 修正しても動かないことが確定したため。復活させる場合は必ずこの記録を読むこと。
 *
 * 1. **UA が 403 で弾かれていた**
 *    `SurviveAsOne-Bot/1.0` は enecho で HTTP 403。`Mozilla/5.0` で始まる UA なら 200。
 *    全 fetch が同一 UA だったため「URL 候補もフォールバックも全滅」する症状になり、
 *    中身の誤り（下記2〜3）が長期間露呈しなかった。
 *
 * 2. **統計コードの取り違え**
 *    pl007 は「石油製品**価格**調査」であり在庫統計ではない。
 *    週次在庫の正しいコードは pl004「石油製品需給動態統計調査」。
 *    したがって下の parseOilProductsHtml が探す品目在庫は、そもそも当該ページに存在しない。
 *
 * 3. **配信形式が HTML ではない**
 *    pl007 の実データは xlsx 配信（例: /statistics/petroleum_and_lpgas/pl007/xlsx/260723.xlsx）。
 *    HTML テーブルを正規表現で舐める本実装は原理的に空振りする。
 *
 * 4. **代替データ源も全て Excel/PDF**
 *    - e-Stat DB（API/JSON）: 年報のみ・2007-01〜2024-03（公開 2025-02-10）で鮮度不足
 *    - e-Stat ファイル: 2026年5月分を 2026-07-14 公開だが Excel/PDF のみ
 *    - 石油連盟(PAJ): xlsx/xls/PDF のみ
 *    JSON/CSV で取得できる鮮度のある在庫データは存在しない。Worker に Excel パーサを
 *    入れる案は、CPU 上限が疑われている月曜枠に重い処理を足すことになるため見送った。
 *
 * 再構築する場合の候補: GitHub Actions の週次 schedule で xlsx を落として Node 側で
 * パースし、wrangler 経由で D1 に書く（Worker の CPU・バンドルに影響しない）。
 * 判断は月曜枠の cron 復旧（→ /api/cron-status）を確認してから。
 *
 * D1 テーブル oil_products_inventory とスキーマは復活に備えて残置（現在 0 行）。
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

const ENECHO_PL007_BASE =
  "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007";
const USER_AGENT = "Mozilla/5.0 (compatible; surviveasonejp-DataBot/1.0; +https://surviveasonejp.org)";

/** 在庫抽出結果 */
interface OilProductsExtract {
  weekEnding: string;   // YYYY-MM-DD
  gasolineKl: number | null;
  keroseneKl: number | null;
  dieselKl: number | null;
  fuelOilHeavyKl: number | null;
  naphthaKl: number | null;
  totalKl: number | null;
}

/**
 * 石油製品在庫を取得して D1 を更新
 */
export async function fetchOilProductsUpdate(env: Env): Promise<void> {
  console.log("Oil products inventory update starting...");

  const candidates = generateCandidateUrls();
  let extract: OilProductsExtract | null = null;

  for (const { url, weekEnding } of candidates) {
    let html: string;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) continue;
      html = await res.text();
      console.log(`Oil products page found: ${url} (${html.length} chars)`);
    } catch {
      continue;
    }

    extract = parseOilProductsHtml(html, weekEnding);
    if (extract) break;
  }

  // フォールバック: 概況ページから最新リンクを辿る
  if (!extract) {
    extract = await fetchFromResultsPage();
  }

  if (!extract) {
    console.warn("Oil products update: no data extracted");
    await env.CACHE.put("oil_products_update_needed", "true", { expirationTtl: 86400 * 14 });
    return;
  }

  // バリデーション
  const validation = validateExtract(extract);
  if (!validation.valid) {
    console.warn(`Oil products validation failed: ${validation.reason}`);
    await env.CACHE.put("oil_products_update_needed", JSON.stringify({
      reason: validation.reason,
      extract,
    }), { expirationTtl: 86400 * 14 });
    return;
  }

  // D1 UPSERT
  await env.DB.prepare(`
    INSERT INTO oil_products_inventory
      (week_ending, gasoline_kl, kerosene_kl, diesel_kl, fuel_oil_heavy_kl, naphtha_kl, total_kl, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(week_ending) DO UPDATE SET
      gasoline_kl       = excluded.gasoline_kl,
      kerosene_kl       = excluded.kerosene_kl,
      diesel_kl         = excluded.diesel_kl,
      fuel_oil_heavy_kl = excluded.fuel_oil_heavy_kl,
      naphtha_kl        = excluded.naphtha_kl,
      total_kl          = excluded.total_kl,
      source            = excluded.source,
      updated_at        = datetime('now')
  `).bind(
    extract.weekEnding,
    extract.gasolineKl,
    extract.keroseneKl,
    extract.dieselKl,
    extract.fuelOilHeavyKl,
    extract.naphthaKl,
    extract.totalKl,
    "資源エネルギー庁 石油製品需給動態統計 pl007",
  ).run();

  // KV キャッシュ更新（最新在庫を即時反映）
  await env.CACHE.put(
    CACHE_KEYS.OIL_PRODUCTS_LATEST,
    JSON.stringify({ ...extract, updatedAt: new Date().toISOString() }),
    { expirationTtl: 86400 * 8 }, // 週次なので8日TTL
  );

  await invalidateCache(env.CACHE, [CACHE_KEYS.RESERVES_LATEST]);
  await env.CACHE.delete("oil_products_update_needed");

  console.log(
    `Oil products updated: ${extract.weekEnding}` +
    ` gasoline=${extract.gasolineKl?.toLocaleString()}kL` +
    ` naphtha=${extract.naphthaKl?.toLocaleString()}kL`,
  );
}

// ─── URL 候補生成 ─────────────────────────────────────

/**
 * 直近4週分の概況ページ URL を生成
 * pl007 URL パターン: {BASE}/{YYYY}/{YYYY}{WW}.html
 * WW: 暦週番号（01〜53）
 */
function generateCandidateUrls(): Array<{ url: string; weekEnding: string }> {
  const now = new Date();
  const candidates: Array<{ url: string; weekEnding: string }> = [];

  for (let weekOffset = 1; weekOffset <= 5; weekOffset++) {
    // 直近 N 週の土曜日（週末日）を計算
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay() - (weekOffset - 1) * 7); // 今週の日曜日から遡る
    const saturday = new Date(d);
    saturday.setDate(d.getDate() - 1); // 土曜日

    const yyyy = saturday.getFullYear();
    const ww = getWeekNumber(saturday);
    const weekEnding = saturday.toISOString().slice(0, 10);

    candidates.push({
      url: `${ENECHO_PL007_BASE}/${yyyy}/${yyyy}${String(ww).padStart(2, "0")}.html`,
      weekEnding,
    });
  }

  return candidates;
}

/** 週番号を計算（ISO 8601: 月曜始まり） */
function getWeekNumber(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

// ─── 概況ページからリンクを辿る ───────────────────────

async function fetchFromResultsPage(): Promise<OilProductsExtract | null> {
  const resultsUrl = `${ENECHO_PL007_BASE}/results.html`;
  let html: string;
  try {
    const res = await fetch(resultsUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // 概況ページの最新リンクを抽出
  // パターン: href="2025/202501.html" など
  const linkPattern = /href="(\d{4}\/\d{4}\d{2}\.html)"/g;
  const links: string[] = [];
  let m;
  while ((m = linkPattern.exec(html)) !== null) {
    if (m[1]) links.push(m[1]);
  }

  if (links.length === 0) return null;

  // 最新（末尾）から試行
  for (const link of links.reverse().slice(0, 3)) {
    const url = `${ENECHO_PL007_BASE}/${link}`;
    // URL から週末日を推定（ファイル名から年週を取得し土曜日に変換）
    const fileMatch = link.match(/(\d{4})(\d{2})\.html/);
    if (!fileMatch) continue;

    const yyyy = parseInt(fileMatch[1] ?? "0", 10);
    const ww = parseInt(fileMatch[2] ?? "0", 10);
    const weekEnding = weekNumberToSaturday(yyyy, ww).toISOString().slice(0, 10);

    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) continue;
      const pageHtml = await res.text();
      const extract = parseOilProductsHtml(pageHtml, weekEnding);
      if (extract) return extract;
    } catch {
      continue;
    }
  }

  return null;
}

/** 週番号 → 土曜日の Date */
function weekNumberToSaturday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const d = new Date(startOfWeek1);
  d.setDate(d.getDate() + (week - 1) * 7 + 5); // +5 = 土曜日
  return d;
}

// ─── HTML パース ──────────────────────────────────────

/**
 * pl007 概況ページから石油製品在庫量を抽出
 *
 * テーブル構造（各ページにより異なるが一般的なパターン）:
 *   品目名 | 前週末 | 当週末 | 前年同週末
 * 単位: 千kL（kilo-kiloliter）→ kL に換算
 */
function parseOilProductsHtml(html: string, weekEnding: string): OilProductsExtract | null {
  // 千kL 単位で記載されているかチェック
  const isKiloKL = html.includes("千kL") || html.includes("千ｋＬ") || html.includes("千KL");
  const multiplier = isKiloKL ? 1000 : 1;

  const extract: OilProductsExtract = {
    weekEnding,
    gasolineKl: null,
    keroseneKl: null,
    dieselKl: null,
    fuelOilHeavyKl: null,
    naphthaKl: null,
    totalKl: null,
  };

  /** 品目名パターン → プロパティのマッピング */
  const productPatterns: Array<{
    patterns: RegExp[];
    key: keyof Omit<OilProductsExtract, "weekEnding">;
  }> = [
    {
      patterns: [/ガソリン[^0-9]*([0-9,]+(?:\.[0-9]+)?)/],
      key: "gasolineKl",
    },
    {
      patterns: [/灯\s*油[^0-9]*([0-9,]+(?:\.[0-9]+)?)/],
      key: "keroseneKl",
    },
    {
      patterns: [
        /軽\s*油[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
        /ディーゼル[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
      ],
      key: "dieselKl",
    },
    {
      patterns: [
        /重\s*油[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
        /Ｃ重油[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
      ],
      key: "fuelOilHeavyKl",
    },
    {
      patterns: [
        /ナフサ[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
        /粗製ガソリン[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
      ],
      key: "naphthaKl",
    },
    {
      patterns: [/合\s*計[^0-9]*([0-9,]+(?:\.[0-9]+)?)/],
      key: "totalKl",
    },
  ];

  for (const { patterns, key } of productPatterns) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const v = parseFloat(match[1].replace(/,/g, ""));
        if (!isNaN(v) && v > 0) {
          (extract[key] as number | null) = Math.round(v * multiplier);
          break;
        }
      }
    }
  }

  // 最低限ガソリンかナフサのどちらかが取れていれば有効
  if (extract.gasolineKl === null && extract.naphthaKl === null) return null;

  return extract;
}

// ─── バリデーション ──────────────────────────────────

interface ValidationResult {
  valid: boolean;
  reason: string;
}

function validateExtract(extract: OilProductsExtract): ValidationResult {
  // ガソリン在庫: 500万〜2500万kL が通常範囲
  if (extract.gasolineKl !== null) {
    if (extract.gasolineKl < 3000000 || extract.gasolineKl > 30000000) {
      return {
        valid: false,
        reason: `gasolineKl=${extract.gasolineKl} outside 3M-30M range`,
      };
    }
  }
  // ナフサ在庫: 200万〜1500万kL が通常範囲
  if (extract.naphthaKl !== null) {
    if (extract.naphthaKl < 1000000 || extract.naphthaKl > 20000000) {
      return {
        valid: false,
        reason: `naphthaKl=${extract.naphthaKl} outside 1M-20M range`,
      };
    }
  }
  return { valid: true, reason: "OK" };
}
