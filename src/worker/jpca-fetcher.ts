/**
 * 石油化学工業協会（JPCA）月次統計 自動取得
 *
 * JPCA「エチレン等生産実績」ページからエチレン・プロピレン等の
 * 月次生産量・在庫量を取得し D1 の petrochem_production テーブルを更新する。
 *
 * データソース:
 *   https://www.jpca.or.jp/statistics/monthly/mainpd.html
 *   （月次統計 概況 — エチレン生産量・在庫量）
 *
 * Cron: 毎月18日 UTC 6:00（reserves/LNG/trade 更新と相乗り）
 *
 * 活用:
 *  - petrochem.tsx のナフサ→エチレン生産指数を動的更新
 *  - PetrochemTree の「現在生産量」バッジを実績値に
 *  - 供給制約下でのエチレン生産減少率シミュレーション精度向上
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

const JPCA_MONTHLY_URL =
  "https://www.jpca.or.jp/statistics/monthly/mainpd.html";
const USER_AGENT = "SurviveAsOne-Bot/1.0 (surviveasonejp.org)";

/** 月次統計の抽出結果 */
interface JpcaExtract {
  month: string;        // YYYY-MM
  ethyleneT: number;    // エチレン生産量（t）
  propyleneT: number | null;   // プロピレン生産量（t）
  butadieneT: number | null;   // ブタジエン生産量（t）
  benzeneT: number | null;     // ベンゼン生産量（t）
  ethyleneInventoryT: number | null;  // エチレン月末在庫（t）
}

/**
 * JPCA 統計を取得して D1 を更新
 */
export async function fetchJpcaUpdate(env: Env): Promise<void> {
  console.log("JPCA statistics update starting...");

  let html: string;
  try {
    const res = await fetch(JPCA_MONTHLY_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        "Referer": "https://www.jpca.or.jp/",
      },
    });
    if (!res.ok) {
      console.warn(`JPCA fetch failed: HTTP ${res.status}`);
      await setFlag(env.CACHE, `HTTP ${res.status}`);
      return;
    }
    html = await res.text();
  } catch (e) {
    console.warn("JPCA fetch error:", e);
    await setFlag(env.CACHE, "Fetch error");
    return;
  }

  console.log(`JPCA page fetched (${html.length} chars)`);

  // 直近月のリンクを探してフォローする場合
  const detailUrl = findLatestDetailUrl(html);
  if (detailUrl) {
    try {
      const detailRes = await fetch(detailUrl, {
        headers: { "User-Agent": USER_AGENT, "Referer": JPCA_MONTHLY_URL },
      });
      if (detailRes.ok) {
        html = await detailRes.text();
        console.log(`JPCA detail page fetched: ${detailUrl} (${html.length} chars)`);
      }
    } catch {
      // 概況ページのまま継続
    }
  }

  const extract = parseJpcaHtml(html);
  if (!extract) {
    console.warn("JPCA: parsing failed");
    await setFlag(env.CACHE, "Parsing failed");
    return;
  }

  // バリデーション
  // エチレン月産量: 50万t〜80万t が日本全体の通常範囲
  if (extract.ethyleneT < 300000 || extract.ethyleneT > 1000000) {
    console.warn(
      `JPCA validation failed: ethyleneT=${extract.ethyleneT} outside 300K-1M range`,
    );
    await setFlag(env.CACHE, `ethyleneT out of range: ${extract.ethyleneT}`);
    return;
  }

  // 前回値との乖離チェック（±40%）
  const prev = await env.DB
    .prepare(
      "SELECT production_t FROM petrochem_production" +
      " WHERE product='ethylene' ORDER BY month DESC LIMIT 1",
    )
    .first<{ production_t: number }>();
  if (prev) {
    const change = Math.abs(extract.ethyleneT - prev.production_t) / prev.production_t;
    if (change > 0.4) {
      console.warn(
        `JPCA validation failed: ethylene change ${(change * 100).toFixed(1)}%` +
        ` exceeds 40% (prev=${prev.production_t}, new=${extract.ethyleneT})`,
      );
      await setFlag(env.CACHE, `ethylene change too large: ${(change * 100).toFixed(1)}%`);
      return;
    }
  }

  // D1 UPSERT（各製品）
  const products: Array<{ product: string; t: number | null; inv: number | null }> = [
    { product: "ethylene", t: extract.ethyleneT, inv: extract.ethyleneInventoryT },
    { product: "propylene", t: extract.propyleneT, inv: null },
    { product: "butadiene", t: extract.butadieneT, inv: null },
    { product: "benzene", t: extract.benzeneT, inv: null },
  ];

  for (const { product, t, inv } of products) {
    if (t === null) continue;
    await env.DB.prepare(`
      INSERT INTO petrochem_production (month, product, production_t, inventory_t, source, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(month, product) DO UPDATE SET
        production_t = excluded.production_t,
        inventory_t  = excluded.inventory_t,
        source       = excluded.source,
        updated_at   = datetime('now')
    `).bind(
      extract.month,
      product,
      t,
      inv,
      "石油化学工業協会（JPCA）月次統計",
    ).run();
  }

  // KV に最新エチレン生産量を保存（PetrochemTree で参照）
  await env.CACHE.put(
    CACHE_KEYS.JPCA_LATEST,
    JSON.stringify({
      month: extract.month,
      ethyleneT: extract.ethyleneT,
      ethyleneInventoryT: extract.ethyleneInventoryT,
      propyleneT: extract.propyleneT,
      updatedAt: new Date().toISOString(),
    }),
    { expirationTtl: 86400 * 35 }, // 月次なので35日TTL
  );

  await invalidateCache(env.CACHE, [CACHE_KEYS.PETROCHEM_TREE]);
  await env.CACHE.delete("jpca_update_needed");

  console.log(
    `JPCA updated: ${extract.month} ethylene=${extract.ethyleneT.toLocaleString()}t` +
    (extract.propyleneT ? ` propylene=${extract.propyleneT.toLocaleString()}t` : ""),
  );
}

// ─── 最新詳細ページ URL 抽出 ────────────────────────

function findLatestDetailUrl(html: string): string | null {
  // 月次統計リンクのパターン: href="2025/202501.html" など
  const pattern = /href="((?:\d{4}\/)?(?:pd\d+|\d{6,8})\.html)"/gi;
  const links: string[] = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    if (m[1]) links.push(m[1]);
  }
  if (links.length === 0) return null;

  // 最後のリンク（最新月）を返す
  const latest = links[links.length - 1];
  if (!latest) return null;
  if (latest.startsWith("http")) return latest;
  return `https://www.jpca.or.jp/statistics/monthly/${latest}`;
}

// ─── HTML パース ──────────────────────────────────────

function parseJpcaHtml(html: string): JpcaExtract | null {
  // 年月の抽出: "2025年1月" "2025年01月" "令和7年1月" など
  const monthMatch = html.match(
    /(?:令和\s*(\d+)|(\d{4}))\s*年\s*(\d{1,2})\s*月/,
  );
  if (!monthMatch) {
    // フォールバック: ISO 形式で探す
    const isoMatch = html.match(/(\d{4})[\/\-](\d{1,2})/);
    if (!isoMatch) return null;
    const year = parseInt(isoMatch[1] ?? "0", 10);
    const mon = parseInt(isoMatch[2] ?? "0", 10);
    if (isNaN(year) || isNaN(mon)) return null;
    const month = `${year}-${String(mon).padStart(2, "0")}`;
    return parseProducts(html, month);
  }

  let year: number;
  if (monthMatch[1]) {
    // 令和
    year = parseInt(monthMatch[1], 10) + 2018;
  } else {
    year = parseInt(monthMatch[2] ?? "0", 10);
  }
  const mon = parseInt(monthMatch[3] ?? "0", 10);
  const month = `${year}-${String(mon).padStart(2, "0")}`;

  return parseProducts(html, month);
}

function parseProducts(html: string, month: string): JpcaExtract | null {
  const extract: JpcaExtract = {
    month,
    ethyleneT: 0,
    propyleneT: null,
    butadieneT: null,
    benzeneT: null,
    ethyleneInventoryT: null,
  };

  /** 数値抽出ヘルパー: 品目名の後の数値 */
  const extractAfter = (pattern: RegExp): number | null => {
    const m = html.match(pattern);
    if (!m?.[1]) return null;
    const v = parseFloat(m[1].replace(/,/g, ""));
    return isNaN(v) || v <= 0 ? null : v;
  };

  // 単位チェック（千t or t）
  const isKiloTonne = html.includes("千t") || html.includes("千ｔ") || html.includes("千トン");
  const multiplier = isKiloTonne ? 1000 : 1;

  // エチレン生産量（必須）
  const ethValue = extractAfter(
    /エチレン[^0-9\n]*?生\s*産[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /エチレン[^0-9]*([0-9,]+(?:\.[0-9]+)?)(?:\s*千?[tｔ])?/,
  );
  if (ethValue === null) return null;
  extract.ethyleneT = Math.round(ethValue * multiplier);

  // エチレン在庫
  extract.ethyleneInventoryT = extractAfter(
    /エチレン[^0-9\n]*?在\s*庫[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  );
  if (extract.ethyleneInventoryT !== null) {
    extract.ethyleneInventoryT = Math.round(extract.ethyleneInventoryT * multiplier);
  }

  // プロピレン
  const propValue = extractAfter(
    /プロピレン[^0-9\n]*?生\s*産[^0-9]*([0-9,]+(?:\.[0-9]+)?)/,
  ) ?? extractAfter(
    /プロピレン[^0-9]*([0-9,]+(?:\.[0-9]+)?)(?:\s*千?[tｔ])?/,
  );
  if (propValue !== null) extract.propyleneT = Math.round(propValue * multiplier);

  // ブタジエン
  const butaValue = extractAfter(
    /ブタジエン[^0-9]*([0-9,]+(?:\.[0-9]+)?)(?:\s*千?[tｔ])?/,
  );
  if (butaValue !== null) extract.butadieneT = Math.round(butaValue * multiplier);

  // ベンゼン
  const benzValue = extractAfter(
    /ベンゼン[^0-9]*([0-9,]+(?:\.[0-9]+)?)(?:\s*千?[tｔ])?/,
  );
  if (benzValue !== null) extract.benzeneT = Math.round(benzValue * multiplier);

  return extract;
}

// ─── KV フラグ ──────────────────────────────────────

async function setFlag(cache: KVNamespace, reason: string): Promise<void> {
  await cache.put(
    "jpca_update_needed",
    JSON.stringify({ reason, timestamp: new Date().toISOString() }),
    { expirationTtl: 86400 * 30 },
  );
}
