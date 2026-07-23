/**
 * JOGMEC 石油備蓄放出イベント フェッチャー（Phase 25-A）
 *
 * 基地別の連続在庫時系列は公的に存在しない。本フェッチャーは
 *   - JOGMEC ニュースリリース (release_NNNNN.html)
 *   - 経産省プレス
 * の **放出イベント** を抽出し、L1（静的容量）と組み合わせて
 * 基地別残存量を擬似時系列化する材料を提供する。
 *
 * Phase 25-A の方針:
 *  - 既知の放出イベント（手動確認済み）を D1 に seed する
 *  - 未知の release_NNNNN.html を R2 にアーカイブし、KV に「要レビュー」フラグを立てる
 *  - 自動 D1 投入は **手動確認済みイベントに限定** する（誤データ混入防止）
 *
 * 月次 cron 枠（毎月18日）に相乗り。
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
}

// ─── 国家備蓄基地マスタ ───────────────────────────────
// regions.json の stockpileBases.name と一致する base_id を採番
export const NATIONAL_BASES = [
  { id: "tomakomai_higashibu", name: "苫小牧東部",   region: "hokkaido", capacity_kL: 6_400_000 },
  { id: "mutsu_ogawara",       name: "むつ小川原",   region: "tohoku",   capacity_kL: 5_700_000 },
  { id: "kuji",                name: "久慈",         region: "tohoku",   capacity_kL: 1_750_000 },
  { id: "akita",               name: "秋田",         region: "tohoku",   capacity_kL: 4_500_000 },
  { id: "fukui",               name: "福井",         region: "hokuriku", capacity_kL: 2_850_000 },
  { id: "kikuma",              name: "菊間",         region: "shikoku",  capacity_kL: 1_500_000 },
  { id: "shirashima",          name: "白島",         region: "kyushu",   capacity_kL: 5_600_000 },
  { id: "kamigoto",            name: "上五島",       region: "kyushu",   capacity_kL: 4_400_000 },
  { id: "kushikino",           name: "串木野",       region: "kyushu",   capacity_kL: 1_750_000 },
  { id: "shibushi",            name: "志布志",       region: "kyushu",   capacity_kL: 5_000_000 },
] as const;

// 民間備蓄拠点（Wave 2 で出荷元として明示された4拠点）
export const PRIVATE_BASES = [
  { id: "private_hokkaido_joint",  name: "北海道石油共同備蓄", region: "hokkaido", capacity_kL: null },
  { id: "private_seibu_yamaguchi", name: "西部石油山陽小野田", region: "chugoku",  capacity_kL: null },
  { id: "private_kashima",         name: "鹿島石油",           region: "tokyo",    capacity_kL: null },
  { id: "private_okinawa",         name: "沖縄石油基地",       region: "okinawa",  capacity_kL: null },
] as const;

export const ALL_BASES = [...NATIONAL_BASES, ...PRIVATE_BASES];
type BaseId = typeof ALL_BASES[number]["id"];

// ─── 既知放出イベント ─────────────────────────────────
// 一次ソースで基地が確定しているもののみ収録。
// 基地別 kL は press release で総量のみ公表されるケースが多く、その場合は
// split_method='estimated_equal' で記録し、UI 側で「推定」ラベル表示する。

interface KnownReleaseEvent {
  wave: string;
  release_date: string;        // YYYY-MM-DD
  source_url: string;
  source_label: string;
  total_volume_kL: number | null;  // 総量（per-base 推定の母数）
  bases: Array<{
    base_id: BaseId;
    volume_kL: number | null;        // 個別確定値があれば設定、無ければ null（split_method で推定）
    reserve_type: "national" | "private" | "joint";
  }>;
  refiners?: string[];
  note?: string;
}

const KNOWN_EVENTS: KnownReleaseEvent[] = [
  {
    // 第1弾: 国家備蓄30日分(約850万kL)・民間15日分・共同6日分=計45日分
    // 国家備蓄5基地は容量加重配分で D1 投入（基地別kLは公式非公表）
    wave: "wave1",
    release_date: "2026-03-26",
    source_url: "https://www.jogmec.go.jp/news/release/release_01248.html",
    source_label: "JOGMEC release_01248 (2026-03-24経産省指示) + 内閣官房dai2資料2",
    total_volume_kL: 8_500_000,
    bases: [
      { base_id: "tomakomai_higashibu", volume_kL: null, reserve_type: "national" },
      { base_id: "kikuma",              volume_kL: null, reserve_type: "national" },
      { base_id: "shirashima",          volume_kL: null, reserve_type: "national" },
      { base_id: "kamigoto",            volume_kL: null, reserve_type: "national" },
      { base_id: "shibushi",            volume_kL: null, reserve_type: "national" },
    ],
    refiners: ["ENEOS", "出光興産", "コスモ石油", "太陽石油"],
    note: "第1弾国家備蓄原油放出 30日分(約850万kL)・総額5,400億円。3/26開始(上五島・志布志は4/1〜)。容量加重配分推定。既知対応: 菊間→太陽石油(パイプライン直送・release_01252)",
  },
  {
    // 第2弾: 国家備蓄6基地+民間4拠点で総量580万kL(20日分)
    // JOGMEC release_01301 + 経産省プレス 20260424009
    wave: "wave2",
    release_date: "2026-05-01",
    source_url: "https://www.jogmec.go.jp/news/release/release_01301.html",
    source_label: "JOGMEC release_01301 + 経産省プレス 20260424009 (2026-04-24発表)",
    total_volume_kL: 5_800_000,
    bases: [
      // 国家6基地
      { base_id: "tomakomai_higashibu", volume_kL: null, reserve_type: "national" },
      { base_id: "kikuma",              volume_kL: null, reserve_type: "national" },
      { base_id: "akita",               volume_kL: null, reserve_type: "national" },
      { base_id: "shirashima",          volume_kL: null, reserve_type: "national" },
      { base_id: "kamigoto",            volume_kL: null, reserve_type: "national" },
      { base_id: "shibushi",            volume_kL: null, reserve_type: "national" },
      // 民間4拠点
      { base_id: "private_hokkaido_joint",  volume_kL: null, reserve_type: "private" },
      { base_id: "private_seibu_yamaguchi", volume_kL: null, reserve_type: "private" },
      { base_id: "private_kashima",         volume_kL: null, reserve_type: "private" },
      { base_id: "private_okinawa",         volume_kL: null, reserve_type: "private" },
    ],
    refiners: ["ENEOS", "出光興産", "コスモ石油", "太陽石油"],
    note: "第2弾国家備蓄原油放出 約580万kL(20日分)・総額5,400億円・5/1以降順次。基地別kL未公表のため均等配分推定。民間義務量は55日維持(追加引き下げなし)",
  },
];

// ─── エントリポイント ────────────────────────────────

/**
 * JOGMEC データの定期更新エントリ。
 *  1. 既知イベントを D1 に seed（idempotent）
 *  2. 直近の release_NNNNN.html を探索 → 未知の石油関連リリースは R2 アーカイブ + KV フラグ
 */
export async function fetchJogmecUpdate(env: Env): Promise<void> {
  console.log("JOGMEC update: starting");

  // 1) 既知イベント seed
  const seeded = await seedKnownReleases(env.DB);
  console.log(`JOGMEC update: seeded ${seeded} event rows`);

  // 2) 新規リリース探索（best-effort、失敗してもCronを止めない）
  try {
    await scanRecentReleases(env);
  } catch (err) {
    console.warn(`JOGMEC update: scan failed — ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3) KV キャッシュ無効化
  await invalidateCache(env.CACHE, [
    CACHE_KEYS.OIL_RELEASES_ALL,
    CACHE_KEYS.OIL_RESERVE_BASES,
  ]);

  await env.CACHE.put("jogmec_last_updated", new Date().toISOString(), {
    expirationTtl: 86400 * 60,
  });
  console.log("JOGMEC update: done");
}

// ─── seed ──────────────────────────────────────────────

/**
 * 既知放出イベントを D1 に投入する。同一 id は ON CONFLICT で UPDATE。
 * 基地別 volume_kL は total が分かっていて per-base が空なら均等配分で推定する。
 */
async function seedKnownReleases(db: D1Database): Promise<number> {
  let inserted = 0;

  for (const event of KNOWN_EVENTS) {
    const allocations = computeAllocations(event);

    for (const alloc of allocations) {
      const baseInfo = lookupBase(alloc.base_id);
      if (!baseInfo) {
        console.warn(`JOGMEC seed: unknown base_id=${alloc.base_id}, skipping`);
        continue;
      }

      // バリデーション: 容量超過拒否（民間は capacity null なのでスキップ）
      if (baseInfo.capacity_kL && alloc.volume_kL > baseInfo.capacity_kL) {
        console.warn(
          `JOGMEC seed: ${alloc.base_id} volume ${alloc.volume_kL}kL exceeds capacity ${baseInfo.capacity_kL}kL, skipping`,
        );
        continue;
      }

      const id = `${event.wave}_${alloc.base_id}`;
      const refinersJson = event.refiners ? JSON.stringify(event.refiners) : null;

      await db
        .prepare(`
          INSERT INTO oil_release_events (
            id, release_date, base_id, base_name, reserve_type,
            volume_kL, split_method, wave, refiners,
            source_url, source_label, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            release_date = excluded.release_date,
            volume_kL    = excluded.volume_kL,
            split_method = excluded.split_method,
            refiners     = excluded.refiners,
            source_url   = excluded.source_url,
            source_label = excluded.source_label,
            note         = excluded.note,
            updated_at   = datetime('now')
        `)
        .bind(
          id,
          event.release_date,
          alloc.base_id,
          baseInfo.name,
          alloc.reserve_type,
          alloc.volume_kL,
          alloc.split_method,
          event.wave,
          refinersJson,
          event.source_url,
          event.source_label,
          event.note ?? null,
        )
        .run();

      inserted++;
    }
  }

  return inserted;
}

interface Allocation {
  base_id: BaseId;
  volume_kL: number;
  split_method: "confirmed" | "estimated_equal" | "capacity_weighted";
  reserve_type: "national" | "private" | "joint";
}

/**
 * 既知イベントの per-base 配分を計算する。
 *
 * 配分戦略:
 *  1. 全基地で個別確定値があれば → 'confirmed'
 *  2. 全基地が国家備蓄（容量既知）→ 容量加重配分 'capacity_weighted'
 *     - 容量大きい基地ほど多く放出された前提（保管原油の比例消費を仮定）
 *     - 均等配分だと小規模基地で容量超過が発生するため
 *  3. 民間混在 / 容量不明あり → 均等配分 'estimated_equal'
 */
function computeAllocations(event: KnownReleaseEvent): Allocation[] {
  const allConfirmed = event.bases.every((b) => b.volume_kL !== null);
  if (allConfirmed) {
    return event.bases.map((b) => ({
      base_id: b.base_id,
      volume_kL: b.volume_kL ?? 0,
      split_method: "confirmed",
      reserve_type: b.reserve_type,
    }));
  }

  if (event.total_volume_kL === null) {
    console.warn(`JOGMEC seed: event ${event.wave} has neither per-base nor total volume`);
    return [];
  }

  // 全基地が容量既知なら容量加重配分
  const capacities = event.bases.map((b) => {
    const info = lookupBase(b.base_id);
    return info?.capacity_kL ?? null;
  });
  const allCapacityKnown = capacities.every((c) => c !== null && c > 0);

  if (allCapacityKnown) {
    const totalCapacity = capacities.reduce<number>((s, c) => s + (c ?? 0), 0);
    return event.bases.map((b, i) => {
      const cap = capacities[i] ?? 0;
      const share = cap / totalCapacity;
      const allocated = Math.round((event.total_volume_kL ?? 0) * share);
      return {
        base_id: b.base_id,
        volume_kL: b.volume_kL ?? allocated,
        split_method: b.volume_kL !== null ? "confirmed" : "capacity_weighted",
        reserve_type: b.reserve_type,
      };
    });
  }

  // それ以外は均等配分
  const perBase = Math.round(event.total_volume_kL / event.bases.length);
  return event.bases.map((b) => ({
    base_id: b.base_id,
    volume_kL: b.volume_kL ?? perBase,
    split_method: b.volume_kL !== null ? "confirmed" : "estimated_equal",
    reserve_type: b.reserve_type,
  }));
}

function lookupBase(id: string): { name: string; capacity_kL: number | null } | null {
  const found = ALL_BASES.find((b) => b.id === id);
  if (!found) return null;
  return { name: found.name, capacity_kL: found.capacity_kL };
}

// ─── 新規リリース探索（best-effort） ──────────────────

const JOGMEC_RELEASE_BASE = "https://www.jogmec.go.jp/news/release";

/**
 * 直近の release_NNNNN.html を走査し、石油関連キーワードが含まれるものを R2 に保存。
 * D1 への自動投入は行わない（誤抽出防止）。
 *
 * 既知の最新 release_NNNNN は KV "jogmec_last_release_id" に保存。
 * 初回は環境変数で起点を渡す or デフォルト 01250 から +20 件走査。
 */
async function scanRecentReleases(env: Env): Promise<void> {
  const lastIdRaw = await env.CACHE.get("jogmec_last_release_id");
  // Wave 2 = release_01301 が確認済み。次回スキャンは 01301 から
  const startId = lastIdRaw ? parseInt(lastIdRaw, 10) : 1301;
  const SCAN_RANGE = 30;
  const KEYWORDS = ["国家備蓄", "石油備蓄", "備蓄原油", "原油放出"];

  let highestFound = startId;
  const candidates: Array<{ id: number; url: string }> = [];

  for (let i = 1; i <= SCAN_RANGE; i++) {
    const id = startId + i;
    const padded = String(id).padStart(5, "0");
    const url = `${JOGMEC_RELEASE_BASE}/release_${padded}.html`;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; surviveasonejp-DataBot/1.0; +https://surviveasonejp.org)" },
      });
      if (!res.ok) continue;

      const html = await res.text();
      highestFound = id;

      const hit = KEYWORDS.some((kw) => html.includes(kw));
      if (hit) {
        candidates.push({ id, url });

        // R2 アーカイブ
        const archiveKey = `jogmec/release_${padded}.html`;
        await env.ARCHIVE.put(archiveKey, html, {
          httpMetadata: { contentType: "text/html; charset=utf-8" },
          customMetadata: { source: url, fetchedAt: new Date().toISOString() },
        });
        console.log(`JOGMEC scan: archived ${archiveKey} (oil keyword hit)`);
      }
    } catch {
      // 個別失敗は無視
    }
  }

  // 最新 ID を更新
  await env.CACHE.put("jogmec_last_release_id", String(highestFound), {
    expirationTtl: 86400 * 365,
  });

  if (candidates.length > 0) {
    await env.CACHE.put(
      "jogmec_review_needed",
      JSON.stringify({
        candidates,
        flaggedAt: new Date().toISOString(),
        action: "Confirm bases manually and add to KNOWN_EVENTS in jogmec-fetcher.ts",
      }),
      { expirationTtl: 86400 * 60 },
    );
    console.log(`JOGMEC scan: ${candidates.length} oil-related release(s) flagged for review`);
  }
}
