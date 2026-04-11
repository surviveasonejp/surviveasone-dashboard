/**
 * 日本冷蔵倉庫協会（JARW）月次統計 自動取得
 *
 * JARW「冷蔵倉庫統計（月次）」から全国の冷蔵倉庫在庫量を取得し
 * D1 の food_cold_storage テーブルを更新する。
 *
 * データソース:
 *   https://www.jarw.or.jp/know/statistics/
 *   （月次統計: 全国主要都市・品目別在庫量）
 *
 * Cron: 毎月18日 UTC 6:00（reserves/LNG/trade/JPCA 更新と相乗り）
 *
 * 活用:
 *  - foodSupply.json の冷凍食品在庫日数を動的更新
 *  - FoodCollapse ページの「店頭在庫○日分」表示を実績値ベースに
 *  - 季節変動（夏: 冷凍食品増、冬: 根菜類減少）の反映
 *  - 供給制約下での生鮮食品バッファ期間試算精度向上
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

const JARW_STATS_BASE = "https://www.jarw.or.jp/know/statistics";
const USER_AGENT = "SurviveAsOne-Bot/1.0 (surviveasonejp.org)";

/** 月次統計の抽出結果 */
interface JarwExtract {
  month: string;            // YYYY-MM
  totalT: number;           // 総在庫量（t）
  seafoodT: number | null;  // 水産物（t）
  meatT: number | null;     // 食肉（t）
  dairyT: number | null;    // 乳製品（t）
  otherT: number | null;    // その他（t）
}

/**
 * JARW 統計を取得して D1 を更新
 */
export async function fetchJarwUpdate(env: Env): Promise<void> {
  console.log("JARW cold storage update starting...");

  // 直近6ヶ月を候補として試行（公表は約2〜3ヶ月遅れ）
  const candidates = generateCandidateUrls();
  let extract: JarwExtract | null = null;

  for (const { url, month } of candidates) {
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Referer": JARW_STATS_BASE,
        },
      });
      if (!res.ok) continue;
      html = await res.text();
      console.log(`JARW page found: ${url} (${html.length} chars)`);
    } catch {
      continue;
    }

    extract = parseJarwHtml(html, month);
    if (extract) break;
  }

  // フォールバック: 統計一覧ページから最新リンクを辿る
  if (!extract) {
    extract = await fetchFromIndexPage();
  }

  if (!extract) {
    console.warn("JARW update: no data extracted");
    await env.CACHE.put(
      "jarw_update_needed",
      JSON.stringify({ timestamp: new Date().toISOString() }),
      { expirationTtl: 86400 * 30 },
    );
    return;
  }

  // バリデーション
  // 全国冷蔵倉庫総在庫: 通常 300万t〜700万t
  if (extract.totalT < 1000000 || extract.totalT > 10000000) {
    console.warn(
      `JARW validation failed: totalT=${extract.totalT} outside 1M-10M range`,
    );
    await env.CACHE.put(
      "jarw_update_needed",
      JSON.stringify({ reason: `totalT out of range: ${extract.totalT}` }),
      { expirationTtl: 86400 * 30 },
    );
    return;
  }

  // 前回値との乖離チェック（±35%）
  const prev = await env.DB
    .prepare("SELECT total_t FROM food_cold_storage ORDER BY month DESC LIMIT 1")
    .first<{ total_t: number }>();
  if (prev) {
    const change = Math.abs(extract.totalT - prev.total_t) / prev.total_t;
    if (change > 0.35) {
      console.warn(
        `JARW validation failed: change ${(change * 100).toFixed(1)}%` +
        ` exceeds 35% (prev=${prev.total_t}, new=${extract.totalT})`,
      );
      await env.CACHE.put(
        "jarw_update_needed",
        JSON.stringify({ reason: `change too large: ${(change * 100).toFixed(1)}%` }),
        { expirationTtl: 86400 * 30 },
      );
      return;
    }
  }

  // D1 UPSERT
  await env.DB.prepare(`
    INSERT INTO food_cold_storage
      (month, total_t, seafood_t, meat_t, dairy_t, other_t, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(month) DO UPDATE SET
      total_t    = excluded.total_t,
      seafood_t  = excluded.seafood_t,
      meat_t     = excluded.meat_t,
      dairy_t    = excluded.dairy_t,
      other_t    = excluded.other_t,
      source     = excluded.source,
      updated_at = datetime('now')
  `).bind(
    extract.month,
    extract.totalT,
    extract.seafoodT,
    extract.meatT,
    extract.dairyT,
    extract.otherT,
    "日本冷蔵倉庫協会（JARW）月次統計",
  ).run();

  // KV に最新在庫量を保存（FoodCollapse ページで参照）
  await env.CACHE.put(
    CACHE_KEYS.FOOD_COLD_STORAGE_LATEST,
    JSON.stringify({
      ...extract,
      updatedAt: new Date().toISOString(),
    }),
    { expirationTtl: 86400 * 35 },
  );

  await invalidateCache(env.CACHE, [CACHE_KEYS.FOOD_SUPPLY_LATEST]);
  await env.CACHE.delete("jarw_update_needed");

  console.log(
    `JARW updated: ${extract.month} total=${Math.round(extract.totalT / 10000)}万t` +
    (extract.seafoodT ? ` seafood=${Math.round(extract.seafoodT / 10000)}万t` : ""),
  );
}

// ─── URL 候補生成 ─────────────────────────────────────

/**
 * 直近6ヶ月の統計ページ URL を生成
 * JARW の URL 規則: /know/statistics/{YYYY}/{YYYYMM}.html 等
 */
function generateCandidateUrls(): Array<{ url: string; month: string }> {
  const now = new Date();
  const candidates: Array<{ url: string; month: string }> = [];

  for (let offset = 2; offset <= 7; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const month = `${yyyy}-${mm}`;

    // 複数 URL パターンを試行
    candidates.push(
      { url: `${JARW_STATS_BASE}/${yyyy}/${yyyy}${mm}.html`, month },
      { url: `${JARW_STATS_BASE}/${yyyy}${mm}.html`, month },
    );
  }

  return candidates;
}

// ─── インデックスページからリンク抽出 ────────────────

async function fetchFromIndexPage(): Promise<JarwExtract | null> {
  let html: string;
  try {
    const res = await fetch(`${JARW_STATS_BASE}/`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // 月次統計リンクを探す
  const linkPattern = /href="([^"]*(?:\d{6,8})[^"]*\.html)"/gi;
  const links: string[] = [];
  let m;
  while ((m = linkPattern.exec(html)) !== null) {
    if (m[1] && !m[1].includes("javascript")) links.push(m[1]);
  }

  if (links.length === 0) return null;

  // 最新リンクから試行
  for (const link of links.reverse().slice(0, 5)) {
    const url = link.startsWith("http")
      ? link
      : link.startsWith("/")
        ? `https://www.jarw.or.jp${link}`
        : `${JARW_STATS_BASE}/${link}`;

    // URL から年月を推定
    const monthMatch = url.match(/(\d{4})(\d{2})/);
    if (!monthMatch) continue;
    const month = `${monthMatch[1]}-${monthMatch[2]}`;

    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) continue;
      const pageHtml = await res.text();
      const extract = parseJarwHtml(pageHtml, month);
      if (extract) return extract;
    } catch {
      continue;
    }
  }

  return null;
}

// ─── HTML パース ──────────────────────────────────────

/**
 * JARW 月次統計 HTML から在庫量を抽出
 *
 * テーブル構造（一般的なパターン）:
 *   品目 | 入庫量 | 出庫量 | 月末在庫量
 * 単位: t または 千t
 */
function parseJarwHtml(html: string, month: string): JarwExtract | null {
  const isKiloTonne =
    html.includes("千t") || html.includes("千ｔ") || html.includes("千トン");
  const multiplier = isKiloTonne ? 1000 : 1;

  const extractAfter = (pattern: RegExp): number | null => {
    const m = html.match(pattern);
    if (!m?.[1]) return null;
    const v = parseFloat(m[1].replace(/,/g, ""));
    return isNaN(v) || v <= 0 ? null : Math.round(v * multiplier);
  };

  // 合計在庫量（必須）
  const totalT = extractAfter(
    /合\s*計[^0-9\n]*?在\s*庫[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /総\s*在\s*庫[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /合\s*計[^0-9]*([0-9,]{4,}(?:\.[0-9]+)?)/,
  );

  if (totalT === null) return null;

  // 品目別
  const seafoodT = extractAfter(
    /水\s*産\s*物[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /魚\s*介[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  );

  const meatT = extractAfter(
    /食\s*肉[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /畜\s*産[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  );

  const dairyT = extractAfter(
    /乳\s*製\s*品[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /乳\s*品[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  );

  const otherT = extractAfter(
    /その他[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /他\s*品[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  );

  return {
    month,
    totalT,
    seafoodT,
    meatT,
    dairyT,
    otherT,
  };
}
