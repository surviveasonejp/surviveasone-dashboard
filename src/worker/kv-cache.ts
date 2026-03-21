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
} as const;

/** シナリオ別キャッシュキー生成 */
export function scenarioCacheKey(base: string, scenario: string, extra?: string): string {
  return extra ? `${base}:${scenario}:${extra}` : `${base}:${scenario}`;
}

/** TTL定義（秒） */
export const CACHE_TTL = {
  RESERVES: 3600,      // 1時間（日次更新データ）
  CONSUMPTION: 86400,  // 24時間（年次ベースライン）
  REGIONS: 86400,      // 24時間（静的に近いデータ）
  ELECTRICITY: 3600,   // 1時間（日次更新データ）
  SIMULATION: 3600,    // 1時間（シミュレーション結果）
} as const;
