/**
 * KVキャッシュ層
 *
 * D1クエリ結果をKVにキャッシュし、D1の読み取りクォータを節約する。
 * キャッシュミス時のみD1にクエリを実行。
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: string;
}

/**
 * KVからキャッシュを取得。TTL内ならデータを返す。
 */
export async function getFromCache<T>(
  kv: KVNamespace,
  key: string,
): Promise<{ data: T; hit: boolean } | null> {
  const raw = await kv.get(key, "text");
  if (!raw) return null;

  const entry: CacheEntry<T> = JSON.parse(raw);
  return { data: entry.data, hit: true };
}

/**
 * KVにキャッシュを格納。TTL（秒）を指定。
 */
export async function setCache<T>(
  kv: KVNamespace,
  key: string,
  data: T,
  ttlSeconds: number,
): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    cachedAt: new Date().toISOString(),
  };
  await kv.put(key, JSON.stringify(entry), {
    expirationTtl: ttlSeconds,
  });
}

/**
 * D1更新後にキャッシュを無効化する。
 * Cron更新後に呼び出して最新データをAPIに反映させる。
 */
export async function invalidateCache(kv: KVNamespace, keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => kv.delete(key)));
}

/** キャッシュキー定義 */
export const CACHE_KEYS = {
  RESERVES_LATEST: "api:reserves:latest",
  RESERVES_HISTORY: "api:reserves:history",
  CONSUMPTION_LATEST: "api:consumption:latest",
  REGIONS_ALL: "api:regions:all",
  ELECTRICITY_LATEST: "api:electricity:latest",
  TANKERS: "api:tankers",
  OIL_PRICE: "oil:wti:latest",
  PETROCHEM_TREE: "api:petrochemtree",
  // 新規追加: 省庁データソース
  TRADE_LATEST: "api:trade:latest",
  OIL_PRODUCTS_LATEST: "api:oil-products:latest",
  JPCA_LATEST: "api:jpca:latest",
  FOOD_COLD_STORAGE_LATEST: "api:food-cold-storage:latest",
  FOOD_SUPPLY_LATEST: "api:food-supply:latest",
} as const;

/** シナリオ別キャッシュキー生成 */
export function scenarioCacheKey(base: string, scenario: string, extra?: string): string {
  return extra ? `${base}:${scenario}:${extra}` : `${base}:${scenario}`;
}

/** TTL定義（秒） */
export const CACHE_TTL = {
  RESERVES: 3600,           // 1時間（日次更新データ）
  CONSUMPTION: 86400,       // 24時間（年次ベースライン）
  REGIONS: 86400,           // 24時間（静的に近いデータ）
  ELECTRICITY: 300,         // 5分（電力需給実測、日次自動取得）
  SIMULATION: 3600,         // 1時間（シミュレーション結果）
  OIL_PRICE: 86400,         // 24時間（WTI原油価格、日次自動取得）
  PETROCHEM: 86400,         // 24時間（静的ツリーデータ）
  TRADE: 86400 * 3,         // 72時間（貿易統計、月次更新）
  OIL_PRODUCTS: 86400 * 8,  // 8日（石油製品在庫、週次更新）
  JPCA: 86400 * 35,         // 35日（JPCA統計、月次更新）
  FOOD_COLD_STORAGE: 86400 * 35, // 35日（JARW統計、月次更新）
} as const;
