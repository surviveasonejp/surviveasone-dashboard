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

/** キャッシュキー定義 */
export const CACHE_KEYS = {
  RESERVES_LATEST: "api:reserves:latest",
  RESERVES_HISTORY: "api:reserves:history",
  CONSUMPTION_LATEST: "api:consumption:latest",
  REGIONS_ALL: "api:regions:all",
} as const;

/** TTL定義（秒） */
export const CACHE_TTL = {
  RESERVES: 3600,      // 1時間（日次更新データ）
  CONSUMPTION: 86400,  // 24時間（年次ベースライン）
  REGIONS: 86400,      // 24時間（静的に近いデータ）
} as const;
