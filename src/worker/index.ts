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
 * Layer 6: D1/KV/R2クォータガード → ストレージ操作制限
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
import {
  getLatestReserves,
  getReservesHistory,
  getLatestConsumption,
  getAllRegions,
  getLatestElectricityDemand,
  getElectricityHistory,
} from "./db";
import {
  getFromCache,
  setCache,
  CACHE_KEYS,
  CACHE_TTL,
  scenarioCacheKey,
} from "./kv-cache";
import { handleScheduled } from "./cron";
import { type ScenarioId, SCENARIOS } from "../shared/scenarios";
import type { FamilyInputs } from "../shared/types";
import {
  getAllCountdowns,
  calcTankerArrivals,
  calcFoodDepletion,
  calcFamilySurvival,
  calcRegionCollapse,
  mapReservesRow,
  mapConsumptionRow,
} from "./simulation/calculations";
import { runFlowSimulation } from "./simulation/flowSimulation";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
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

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
          Allow: "GET, HEAD, OPTIONS, POST",
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
    const response = await handleApiRoute(url, env, globalCheck.count, request);

    // レスポンスにレート制限ヘッダーを付与
    const headers = rateLimitHeaders(globalCheck.count);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    // Layer 3: レスポンスをキャッシュに格納 + セキュリティヘッダー付与
    const cachedResponse = await cacheResponse(request, response, url.pathname);
    return addSecurityHeaders(cachedResponse, isDev);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleScheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;

// ─── APIルーティング ───────────────────────────────────

async function handleApiRoute(
  url: URL,
  env: Env,
  requestCount: number,
  request?: Request,
): Promise<Response> {
  switch (url.pathname) {
    case "/api/health":
      return handleHealth(requestCount);
    case "/api/reserves":
      return handleReserves(url, env);
    case "/api/consumption":
      return handleConsumption(env);
    case "/api/regions":
      return handleRegions(env);
    case "/api/electricity":
      return handleElectricity(url, env);
    case "/api/countdowns":
      return handleCountdowns(url, env);
    case "/api/collapse":
      return handleCollapse(url, env);
    case "/api/simulation":
      return handleSimulation(url, env);
    case "/api/food-collapse":
      return handleFoodCollapse(url, env);
    case "/api/tankers":
      return handleTankers(env);
    case "/api/family-survival":
      return handleFamilySurvival(request);
    case "/api":
      return jsonResponse({
        name: "Survive as One API",
        version: "0.2.0",
        docs: "https://github.com/surviveasonejp/surviveasone-dashboard#api",
        endpoints: {
          "GET /api/health": "ヘルスチェック",
          "GET /api/reserves": "石油・LNG備蓄データ（出典: 資源エネルギー庁）",
          "GET /api/consumption": "日次消費量データ（出典: OWID energy-data）",
          "GET /api/regions": "10電力エリア別パラメータ（出典: OCCTO, 原子力規制委員会）",
          "GET /api/countdowns?scenario={id}": "石油/LNG/電力の残存日数カウントダウン",
          "GET /api/collapse?scenario={id}": "10エリア崩壊順序（連系線融通・原子力補正込み）",
          "GET /api/simulation?scenario={id}&maxDays={n}": "フロー型在庫シミュレーション（365日タイムライン）",
          "GET /api/food-collapse?scenario={id}": "食品カテゴリ別消失予測",
          "GET /api/tankers": "タンカー12隻の到着予測",
          "POST /api/family-survival": "家庭生存日数算出（body: {members,waterLiters,foodDays,gasCanisterCount,batteryWh,cashYen}）",
          "GET /api/electricity?area={id}": "電力需給実測データ",
        },
        scenarios: ["optimistic", "realistic", "pessimistic"],
        license: "AGPL-3.0",
        source: "https://github.com/surviveasonejp/surviveasone-dashboard",
      });
    default:
      return jsonResponse({ error: "not_found", message: "Endpoint not found" }, 404);
  }
}

// ─── /api/health ───────────────────────────────────────

async function handleHealth(requestCount: number): Promise<Response> {
  const level = getGlobalUsageLevel(requestCount);

  return jsonResponse({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.2.0",
    level,
  });
}

// ─── /api/reserves ─────────────────────────────────────

async function handleReserves(url: URL, env: Env): Promise<Response> {
  const history = url.searchParams.get("history") === "true";

  if (history) {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "30"), 365);
    const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.RESERVES_HISTORY);
    if (cached) {
      return jsonResponse({ data: cached.data, cache: "hit" });
    }
    const data = await getReservesHistory(env.DB, limit);
    await setCache(env.CACHE, CACHE_KEYS.RESERVES_HISTORY, data, CACHE_TTL.RESERVES);
    return jsonResponse({ data, cache: "miss" });
  }

  const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.RESERVES_LATEST);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }
  const data = await getLatestReserves(env.DB);
  if (!data) {
    return jsonResponse({ error: "no_data", message: "備蓄データが見つかりません" }, 404);
  }
  await setCache(env.CACHE, CACHE_KEYS.RESERVES_LATEST, data, CACHE_TTL.RESERVES);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/consumption ──────────────────────────────────

async function handleConsumption(env: Env): Promise<Response> {
  const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.CONSUMPTION_LATEST);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }
  const data = await getLatestConsumption(env.DB);
  if (!data) {
    return jsonResponse({ error: "no_data", message: "消費データが見つかりません" }, 404);
  }
  await setCache(env.CACHE, CACHE_KEYS.CONSUMPTION_LATEST, data, CACHE_TTL.CONSUMPTION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/regions ──────────────────────────────────────

async function handleRegions(env: Env): Promise<Response> {
  const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.REGIONS_ALL);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }
  const data = await getAllRegions(env.DB);
  await setCache(env.CACHE, CACHE_KEYS.REGIONS_ALL, data, CACHE_TTL.REGIONS);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/electricity ─────────────────────────────────

async function handleElectricity(url: URL, env: Env): Promise<Response> {
  const areaId = url.searchParams.get("area");

  if (areaId) {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "30"), 365);
    const data = await getElectricityHistory(env.DB, areaId, limit);
    return jsonResponse({ data });
  }

  const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.ELECTRICITY_LATEST);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }
  const data = await getLatestElectricityDemand(env.DB);
  await setCache(env.CACHE, CACHE_KEYS.ELECTRICITY_LATEST, data, CACHE_TTL.ELECTRICITY);
  return jsonResponse({ data, cache: "miss" });
}

// ─── シナリオ検証ヘルパー ────────────────────────────

function parseScenario(url: URL): ScenarioId {
  const s = url.searchParams.get("scenario");
  if (s && s in SCENARIOS) return s as ScenarioId;
  return "realistic";
}

// ─── D1データ取得ヘルパー ────────────────────────────

async function getReservesAndConsumption(env: Env) {
  const [reservesRow, consumptionRow] = await Promise.all([
    getLatestReserves(env.DB),
    getLatestConsumption(env.DB),
  ]);
  const reservesData = reservesRow ? mapReservesRow(reservesRow) : null;
  const consumptionData = consumptionRow ? mapConsumptionRow(consumptionRow) : null;
  return { reservesData, consumptionData };
}

// ─── /api/countdowns ─────────────────────────────────

async function handleCountdowns(url: URL, env: Env): Promise<Response> {
  const scenario = parseScenario(url);
  const cacheKey = scenarioCacheKey("api:countdowns", scenario);

  const cached = await getFromCache<unknown>(env.CACHE, cacheKey);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }

  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const data = getAllCountdowns(reservesData, consumptionData, scenario);
  await setCache(env.CACHE, cacheKey, data, CACHE_TTL.SIMULATION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/collapse ───────────────────────────────────

async function handleCollapse(url: URL, env: Env): Promise<Response> {
  const scenario = parseScenario(url);
  const cacheKey = scenarioCacheKey("api:collapse", scenario);

  const cached = await getFromCache<unknown>(env.CACHE, cacheKey);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }

  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const [apiRegions, electricityData] = await Promise.all([
    getAllRegions(env.DB),
    getLatestElectricityDemand(env.DB),
  ]);

  const data = calcRegionCollapse(reservesData, consumptionData, apiRegions, electricityData, scenario);
  await setCache(env.CACHE, cacheKey, data, CACHE_TTL.SIMULATION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/simulation ─────────────────────────────────

async function handleSimulation(url: URL, env: Env): Promise<Response> {
  const scenario = parseScenario(url);
  const maxDays = Math.min(Math.max(Number(url.searchParams.get("maxDays") ?? "365"), 1), 730);
  const cacheKey = scenarioCacheKey("api:simulation", scenario, String(maxDays));

  const cached = await getFromCache<unknown>(env.CACHE, cacheKey);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }

  const data = runFlowSimulation(scenario, maxDays);
  await setCache(env.CACHE, cacheKey, data, CACHE_TTL.SIMULATION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/food-collapse ──────────────────────────────

async function handleFoodCollapse(url: URL, env: Env): Promise<Response> {
  const scenario = parseScenario(url);
  const region = url.searchParams.get("region") ?? "";
  const cacheKey = scenarioCacheKey("api:food-collapse", scenario, region);

  const cached = await getFromCache<unknown>(env.CACHE, cacheKey);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }

  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const data = calcFoodDepletion(reservesData, consumptionData, null, scenario);
  await setCache(env.CACHE, cacheKey, data, CACHE_TTL.SIMULATION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/tankers ────────────────────────────────────

async function handleTankers(env: Env): Promise<Response> {
  const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.TANKERS);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }

  const data = calcTankerArrivals();
  await setCache(env.CACHE, CACHE_KEYS.TANKERS, data, CACHE_TTL.SIMULATION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/family-survival ────────────────────────────

async function handleFamilySurvival(request?: Request): Promise<Response> {
  if (!request || request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "POST only" }, 405);
  }

  let inputs: FamilyInputs;
  try {
    inputs = await request.json() as FamilyInputs;
  } catch {
    return jsonResponse({ error: "invalid_body", message: "JSON body required" }, 400);
  }

  // バリデーション: 全フィールドの型・範囲チェック
  const v = [
    { key: "members", val: inputs.members, min: 1, max: 50 },
    { key: "waterLiters", val: inputs.waterLiters, min: 0, max: 10000 },
    { key: "foodDays", val: inputs.foodDays, min: 0, max: 365 },
    { key: "gasCanisterCount", val: inputs.gasCanisterCount, min: 0, max: 1000 },
    { key: "batteryWh", val: inputs.batteryWh, min: 0, max: 100000 },
    { key: "cashYen", val: inputs.cashYen, min: 0, max: 100000000 },
  ];
  for (const { key, val, min, max } of v) {
    if (typeof val !== "number" || !Number.isFinite(val) || val < min || val > max) {
      return jsonResponse({ error: "invalid_input", message: `${key} must be a number between ${min} and ${max}` }, 400);
    }
  }

  const data = calcFamilySurvival(inputs);
  return jsonResponse({ data });
}
