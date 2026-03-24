/**
 * LNG在庫データ自動更新
 *
 * 資源エネルギー庁「ガス事業生産動態統計」の概況ページからLNG在庫量を自動取得しD1を更新。
 *
 * 概況URL: https://www.enecho.meti.go.jp/statistics/gas/ga001/{YYYY}/{YYYY}_{MM}.html
 * 公表スケジュール: 約2ヶ月遅れ（例: 1月分は3月公表）
 *
 * reserves テーブルの lng_inventory_t カラムを更新。
 * 取得失敗時はKVに "lng_update_needed" フラグを立てる。
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

const BASE_URL = "https://www.enecho.meti.go.jp/statistics/gas/ga001";

/** LNG在庫抽出結果 */
interface LngExtract {
  /** 基準年月 YYYY-MM */
  baseMonth: string;
  /** LNG月末在庫量 (t) */
  inventoryT: number;
}

/**
 * LNG在庫データを取得してD1を更新
 */
export async function fetchLngUpdate(env: Env): Promise<void> {
  // 直近6ヶ月の概況ページURLを候補として生成
  const candidates = generateLngCandidates();
  console.log(`LNG update: trying ${candidates.length} page candidates`);

  let html: string | null = null;
  let pageUrl = "";

  for (const { url } of candidates) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "SurviveAsOne-Bot/1.0" } });
      if (res.ok) {
        html = await res.text();
        pageUrl = url;
        console.log(`LNG page found: ${url} (${html.length} chars)`);
        break;
      }
    } catch {
      // 次の候補へ
    }
  }

  if (!html) {
    console.warn("LNG update: no page found in candidates");
    await env.CACHE.put("lng_update_needed", "true", { expirationTtl: 86400 * 30 });
    return;
  }

  // HTML からLNG在庫を抽出
  const extract = parseLngHtml(html, pageUrl);
  if (!extract) {
    console.warn("LNG update: parsing failed");
    await env.CACHE.put("lng_update_needed", JSON.stringify({
      reason: "HTML parsing failed",
      pageUrl,
    }), { expirationTtl: 86400 * 30 });
    return;
  }

  console.log(`LNG extracted: ${extract.baseMonth} inventory=${extract.inventoryT}t`);

  // バリデーション
  const validation = await validateLng(env.DB, extract);
  if (!validation.valid) {
    console.warn(`LNG update: validation failed — ${validation.reason}`);
    await env.CACHE.put("lng_update_needed", JSON.stringify({
      reason: `Validation: ${validation.reason}`,
      pageUrl,
      extracted: extract,
    }), { expirationTtl: 86400 * 30 });
    return;
  }

  // D1更新（reserves テーブルの最新行の lng_inventory_t を更新）
  await updateLngInventory(env.DB, extract);

  // KVキャッシュ無効化
  await invalidateCache(env.CACHE, [
    CACHE_KEYS.RESERVES_LATEST,
    CACHE_KEYS.RESERVES_HISTORY,
  ]);

  await env.CACHE.delete("lng_update_needed");
  console.log("LNG update: D1 updated successfully");
}

// ─── URL候補生成 ──────────────────────────────────────

function generateLngCandidates(): Array<{ url: string; month: string }> {
  const now = new Date();
  const candidates: Array<{ url: string; month: string }> = [];

  // 約2ヶ月遅れの公表なので、3〜8ヶ月前を候補に
  for (let offset = 2; offset <= 8; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    candidates.push({
      url: `${BASE_URL}/${yyyy}/${yyyy}_${mm}.html`,
      month: `${yyyy}-${mm}`,
    });
  }

  return candidates;
}

// ─── HTMLパース ───────────────────────────────────────

function parseLngHtml(html: string, url: string): LngExtract | null {
  // 概況ページから「月末在庫量」や「LNG在庫」に関連する数値を抽出
  // パターン: "液化天然ガス" の近くにある数値（千t or t単位）

  // 月を URL から抽出
  const urlMatch = url.match(/(\d{4})_(\d{2})\.html/);
  const baseMonth = urlMatch ? `${urlMatch[1]}-${urlMatch[2]}` : "";
  if (!baseMonth) return null;

  // HTMLから数値を抽出する複数の戦略

  // 戦略1: "在庫" の近くの数値（千t単位が多い）
  const inventoryPatterns = [
    /在庫[^0-9]*?([0-9,]+(?:\.[0-9]+)?)\s*千[tｔ]/,
    /在庫[^0-9]*?([0-9,]+(?:\.[0-9]+)?)\s*万[tｔ]/,
    /LNG[^0-9]*?在庫[^0-9]*?([0-9,]+(?:\.[0-9]+)?)/,
    /液化天然ガス[^0-9]*?在庫[^0-9]*?([0-9,]+(?:\.[0-9]+)?)/,
    /月末在庫[^0-9]*?([0-9,]+(?:\.[0-9]+)?)/,
  ];

  for (const pattern of inventoryPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const rawValue = parseFloat(match[1].replace(/,/g, ""));
      if (isNaN(rawValue) || rawValue <= 0) continue;

      // 単位推定: 千t or 万t or t
      let inventoryT: number;
      if (html.includes("千t") || html.includes("千ｔ")) {
        inventoryT = rawValue * 1000; // 千t → t
      } else if (html.includes("万t") || html.includes("万ｔ")) {
        inventoryT = rawValue * 10000; // 万t → t
      } else if (rawValue < 100000) {
        // 小さい数値は千t単位と推定
        inventoryT = rawValue * 1000;
      } else {
        inventoryT = rawValue; // そのまま t
      }

      // 妥当性チェック: LNG在庫は200万t〜800万tの範囲
      if (inventoryT >= 2000000 && inventoryT <= 8000000) {
        return { baseMonth, inventoryT: Math.round(inventoryT) };
      }
    }
  }

  return null;
}

// ─── バリデーション ──────────────────────────────────

async function validateLng(
  db: D1Database,
  extract: LngExtract,
): Promise<{ valid: boolean; reason: string }> {
  // 絶対範囲: 200万t〜800万t
  if (extract.inventoryT < 2000000 || extract.inventoryT > 8000000) {
    return { valid: false, reason: `inventoryT=${extract.inventoryT} outside 2M-8M range` };
  }

  // 前回値との乖離: ±50%
  const prev = await db
    .prepare("SELECT lng_inventory_t FROM reserves ORDER BY date DESC LIMIT 1")
    .first<{ lng_inventory_t: number }>();

  if (prev && prev.lng_inventory_t > 0) {
    const changeRate = Math.abs(extract.inventoryT - prev.lng_inventory_t) / prev.lng_inventory_t;
    if (changeRate > 0.5) {
      return {
        valid: false,
        reason: `Change rate ${(changeRate * 100).toFixed(1)}% exceeds 50% (prev=${prev.lng_inventory_t}, new=${extract.inventoryT})`,
      };
    }
  }

  return { valid: true, reason: "OK" };
}

// ─── D1更新 ──────────────────────────────────────────

async function updateLngInventory(db: D1Database, extract: LngExtract): Promise<void> {
  // 最新のreserves行のlng_inventory_tを更新
  const latest = await db
    .prepare("SELECT date FROM reserves ORDER BY date DESC LIMIT 1")
    .first<{ date: string }>();

  if (!latest) {
    console.warn("LNG update: no reserves row to update");
    return;
  }

  await db
    .prepare("UPDATE reserves SET lng_inventory_t = ?, updated_at = datetime('now') WHERE date = ?")
    .bind(extract.inventoryT, latest.date)
    .run();

  console.log(`LNG inventory updated: ${latest.date} → ${extract.inventoryT}t`);
}
