/**
 * surviveasone-dashboard Worker
 *
 * Cloudflare Workers無料枠を絶対に超えないための多層防御:
 *
 * Layer 0: 静的アセットにセキュリティヘッダー付与（dev時CSPスキップ）
 * Layer 1: Bot/クローラーブロック → 不要なリクエスト排除
 * Layer 2: HTTPメソッドフィルタ → GET/HEAD/OPTIONSのみ許可
 * Layer 3: APIレスポンスキャッシュ → Cache APIで同一リクエストを吸収
 * Layer 4: Per-IPレート制限 → 単一IPの暴走を防止
 * Layer 5: グローバル日次予算 → 全体の85%で完全停止
 * Layer 6: D1/KV/R2クォータガード → Phase 2以降の操作制限
 */

import { WORKERS_FREE, SAFETY, getSecondsUntilDailyReset } from "./free-tier";
import {
  checkGlobalDailyLimit,
  checkIpRateLimit,
  getGlobalUsageLevel,
  rateLimitHeaders,
} from "./rate-limit";
import {
  isBlockedBot,
  isAllowedMethod,
  blockedResponse,
  methodNotAllowedResponse,
} from "./bot-guard";
import { getCachedResponse, cacheResponse } from "./api-cache";
import { getQuotaStatus } from "./quota-guard";

interface Env {
  ASSETS: Fetcher;
}

// ─── セキュリティヘッダー ──────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
};

function isDevRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function addSecurityHeaders(response: Response, isDev: boolean): Response {
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (isDev && key === "Content-Security-Policy") {
      continue;
    }
    newResponse.headers.set(key, value);
  }
  return newResponse;
}

// ─── メインハンドラー ──────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isDev = isDevRequest(request);

    // ── 静的アセット: セキュリティヘッダー付与して返す ──
    if (!url.pathname.startsWith("/api/")) {
      const response = await env.ASSETS.fetch(request);
      return addSecurityHeaders(response, isDev);
    }

    // ── 以下、APIリクエストのみ ──

    // Layer 1: Botブロック
    const ua = request.headers.get("User-Agent");
    if (isBlockedBot(ua)) {
      return blockedResponse();
    }

    // Layer 2: メソッドフィルタ
    if (!isAllowedMethod(request.method)) {
      return methodNotAllowedResponse();
    }

    // OPTIONSプリフライト: 即座に返す
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: "GET, HEAD, OPTIONS",
          "Cache-Control": "max-age=86400",
        },
      });
    }

    // Layer 3: キャッシュヒットチェック（Worker CPU時間を節約）
    const cached = await getCachedResponse(request);
    if (cached) {
      return addSecurityHeaders(cached, isDev);
    }

    // Layer 4: Per-IPレート制限
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const ipCheck = await checkIpRateLimit(clientIp);
    if (!ipCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message:
            ipCheck.reason === "per_minute_limit"
              ? "リクエスト頻度が高すぎます。1分後に再試行してください。"
              : "本日のIPあたりのリクエスト上限に達しました。",
          retry_after_seconds: ipCheck.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": ipCheck.retryAfter.toString(),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // Layer 5: グローバル日次予算チェック
    const globalCheck = await checkGlobalDailyLimit();
    if (!globalCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "daily_quota_exceeded",
          message: "本日のAPI利用上限に達しました。明日UTC 0:00にリセットされます。",
          retry_after_seconds: globalCheck.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": globalCheck.retryAfter.toString(),
            ...rateLimitHeaders(globalCheck.count),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // ── APIルーティング ──
    const response = await handleApiRoute(url.pathname, globalCheck.count);

    // レスポンスにレート制限ヘッダーを付与
    const headers = rateLimitHeaders(globalCheck.count);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    // Layer 3: レスポンスをキャッシュに格納 + セキュリティヘッダー付与
    const cachedResponse = await cacheResponse(request, response, url.pathname);
    return addSecurityHeaders(cachedResponse, isDev);
  },
} satisfies ExportedHandler<Env>;

// ─── APIルーティング ───────────────────────────────────

async function handleApiRoute(
  pathname: string,
  requestCount: number,
): Promise<Response> {
  switch (pathname) {
    case "/api/health":
      return handleHealth(requestCount);
    default:
      return new Response(
        JSON.stringify({ error: "not_found", message: "Endpoint not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
  }
}

function handleHealth(requestCount: number): Response {
  const usageRatio = requestCount / WORKERS_FREE.DAILY_REQUESTS;
  const level = getGlobalUsageLevel(requestCount);

  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.0.1",
      free_tier: {
        workers: {
          requests_today: requestCount,
          daily_limit: WORKERS_FREE.DAILY_REQUESTS,
          usage_percent: Math.round(usageRatio * 100),
          throttle_at_percent: Math.round(SAFETY.API_THROTTLE_RATIO * 100),
          cutoff_at_percent: Math.round(SAFETY.API_CUTOFF_RATIO * 100),
          warning_level: level,
          resets_in_seconds: getSecondsUntilDailyReset(),
        },
        storage: getQuotaStatus(),
      },
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
