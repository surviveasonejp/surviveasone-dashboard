/**
 * Bot/クローラーブロック
 *
 * APIエンドポイントへの不要なボットアクセスをブロックし、
 * 無料枠のリクエスト数を節約する。
 *
 * 静的アセットへのクローラーアクセスは許可する（SEO）。
 * APIへのクローラーアクセスのみブロック。
 */

// APIにアクセスすべきでないクローラー/ボットのUA部分一致リスト
const BLOCKED_BOT_PATTERNS = [
  "Googlebot",
  "Bingbot",
  "bingbot",
  "Slurp",       // Yahoo
  "DuckDuckBot",
  "Baiduspider",
  "YandexBot",
  "Sogou",
  "Exabot",
  "facebot",     // Facebook
  "ia_archiver", // Alexa
  "MJ12bot",
  "AhrefsBot",
  "SemrushBot",
  "DotBot",
  "PetalBot",
  "MegaIndex",
  "BLEXBot",
  "DataForSeoBot",
  "serpstatbot",
  "Bytespider",  // TikTok
  "GPTBot",      // OpenAI
  "CCBot",       // Common Crawl
  "ClaudeBot",   // Anthropic
  "Applebot",
  "PaperLiBot",
  "Screaming Frog",
  "Rogerbot",
  "Proximic",
  "UptimeRobot",
  "Pingdom",
  "python-requests",
  "curl/",
  "wget/",
  "Go-http-client",
  "Java/",
  "libwww",
  "httpunit",
  "nutch",
  "phpcrawl",
  "msnbot",
  "adidxbot",
  "blekkobot",
  "teoma",
  "yeti",
  "RetrevoPageAnalyzer",
  "Riddler",
  "linkdexbot",
] as const;

/**
 * リクエストがブロック対象のボットかどうかを判定
 */
export function isBlockedBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // UAなしは拒否
  if (userAgent.length < 5) return true; // 不正なUA
  return BLOCKED_BOT_PATTERNS.some((pattern) => userAgent.includes(pattern));
}

/**
 * 許可するHTTPメソッド（不要なメソッドでリクエスト消費しない）
 */
const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isAllowedMethod(method: string): boolean {
  return ALLOWED_METHODS.has(method);
}

/**
 * ボットブロック用の403レスポンス
 */
export function blockedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "forbidden",
      message: "Bot access to API is not permitted.",
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * メソッド不許可の405レスポンス
 */
export function methodNotAllowedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "method_not_allowed",
      message: "Only GET, HEAD, OPTIONS are allowed.",
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "GET, HEAD, OPTIONS",
        "Cache-Control": "no-store",
      },
    },
  );
}
