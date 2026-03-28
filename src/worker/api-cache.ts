/**
 * APIレスポンスキャッシュ（Cache APIベース）
 *
 * 同一リクエストに対してWorkerの処理を再実行せずに
 * キャッシュ済みレスポンスを返すことで、CPU時間を節約し
 * リクエスト処理の実質コストを下げる。
 *
 * 注意: Cache APIのキャッシュヒットでもWorkerの起動は発生するため
 * 100K/日のカウントには含まれる。しかしCPU時間を大幅に削減し、
 * 外部サブリクエスト数を節約できる（Phase 2以降で重要）。
 */

// エンドポイント別のキャッシュTTL（秒）
const CACHE_TTL: Record<string, number> = {
  "/api/health": 30,           // 30秒
  "/api/reserves": 3600,       // 1時間（備蓄データ、月次更新だがD1取得コスト削減）
  "/api/consumption": 86400,   // 24時間（年次ベースライン、変動少ない）
  "/api/regions": 86400,       // 24時間（静的に近いデータ）
  "/api/electricity": 300,     // 5分（電力需給実測、日次自動取得）
  "/api/countdowns": 300,      // 5分（シナリオ依存、軽量計算）
  "/api/collapse": 3600,       // 1時間（計算コスト高）
  "/api/simulation": 3600,     // 1時間（計算コスト最大）
  "/api/food-collapse": 3600,  // 1時間
  "/api/tankers": 1800,        // 30分
  "/api/summary": 3600,        // 1時間
  "/api/simulate": 3600,       // 1時間
  "/api": 86400,               // 24時間（エンドポイント一覧は静的）
};

const DEFAULT_TTL = 300; // デフォルト5分

/**
 * キャッシュからレスポンスを取得（ヒットすればそのまま返す）
 */
export async function getCachedResponse(
  request: Request,
): Promise<Response | null> {
  // GETリクエストのみキャッシュ
  if (request.method !== "GET") return null;

  const cache = await caches.open("api-response");
  const cached = await cache.match(request);

  if (cached) {
    // キャッシュヒットヘッダーを付与
    const response = new Response(cached.body, cached);
    response.headers.set("X-Cache", "HIT");
    return response;
  }

  return null;
}

/**
 * レスポンスをキャッシュに格納
 */
export async function cacheResponse(
  request: Request,
  response: Response,
  pathname: string,
): Promise<Response> {
  // GETリクエストかつ成功レスポンスのみキャッシュ
  if (request.method !== "GET" || response.status !== 200) {
    return response;
  }

  const ttl = CACHE_TTL[pathname] ?? DEFAULT_TTL;

  // レスポンスをクローンしてキャッシュ制御ヘッダーを付与
  const cacheable = new Response(response.body, response);
  cacheable.headers.set("Cache-Control", `public, max-age=${ttl}`);
  cacheable.headers.set("X-Cache", "MISS");
  cacheable.headers.set("X-Cache-TTL", ttl.toString());

  const cache = await caches.open("api-response");
  // bodyを2つ必要とするのでcloneしてからput
  const [forCache, forClient] = [cacheable.clone(), cacheable];
  await cache.put(request, forCache);

  return forClient;
}
