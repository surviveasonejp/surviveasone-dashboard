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
import staticReserves from "./data/reserves.json";

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
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
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

function jsonResponse(data: unknown, status: number = 200, cors: boolean = false): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS, POST";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── メインハンドラー ──────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const isDev = isDevRequest(request);

    // ── ドメイン判定 ──
    const isApiDomain = url.hostname === "surviveasonejp.net" || url.hostname === "www.surviveasonejp.net";
    const isApiPath = url.pathname === "/api" || url.pathname.startsWith("/api/");

    // ── www リダイレクト → apex ──
    if (url.hostname.startsWith("www.")) {
      const apex = url.hostname.replace("www.", "");
      return Response.redirect(`https://${apex}${url.pathname}${url.search}`, 301);
    }

    // ── .net ドメイン: API専用 ──
    if (isApiDomain && !isApiPath) {
      return Response.redirect(`https://surviveasonejp.org${url.pathname}${url.search}`, 301);
    }

    // ── well-known / robots.txt / sitemap.xml（動的生成） ──
    if (url.pathname === "/.well-known/ai-plugin.json") {
      return jsonResponse({
        schema_version: "v1",
        name_for_human: "Survive as One Japan",
        name_for_model: "survive_as_one_japan",
        description_for_human: "日本のホルムズ海峡封鎖シナリオにおけるエネルギー備蓄シミュレーション。石油・LNG・電力の崩壊タイムラインを可視化。",
        description_for_model: "Simulates Japan's energy reserve depletion under Hormuz Strait blockade scenarios. Returns oil/LNG/power depletion timelines, regional collapse order, food supply chain impact, and tanker tracking data. Use /api/simulate for quick results or /api/summary for plain text overview.",
        auth: { type: "none" },
        api: {
          type: "openapi",
          url: "https://surviveasonejp.net/api/openapi.json",
        },
        logo_url: "https://surviveasonejp.org/icon-192.png",
        contact_email: "surviveasonejp@proton.me",
        legal_info_url: "https://surviveasonejp.org/about",
      });
    }
    if (url.pathname === "/robots.txt") {
      return new Response(
        `User-agent: *\nAllow: /\n\nSitemap: https://surviveasonejp.org/sitemap.xml\n`,
        { headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" } },
      );
    }
    if (url.pathname === "/sitemap.xml") {
      const pages = [
        "", "/dashboard", "/countdown", "/collapse-map", "/last-tanker",
        "/food-collapse", "/family", "/prepare", "/about", "/methodology", "/api-docs",
      ];
      const entries = pages.map((p) =>
        `  <url><loc>https://surviveasonejp.org${p}</loc><changefreq>${p === "" ? "daily" : "weekly"}</changefreq><priority>${p === "" ? "1.0" : p === "/dashboard" ? "0.9" : "0.7"}</priority></url>`,
      ).join("\n");
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`,
        { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" } },
      );
    }

    // ── 静的アセット: セキュリティヘッダー付与して返す ──
    if (!isApiPath) {
      const response = await env.ASSETS.fetch(request);
      const secured = addSecurityHeaders(response, isDev);
      // sw.js はブラウザが常に最新版をチェックするようno-cache
      if (url.pathname === "/sw.js") {
        secured.headers.set("Cache-Control", "no-cache");
      }
      return secured;
    }

    // ── 以下、APIリクエストのみ ──

    // Layer 1: Botブロック（.netドメインではプログラムアクセスを許可）
    if (!isApiDomain) {
      const ua = request.headers.get("User-Agent");
      if (isBlockedBot(ua)) {
        return blockedResponse();
      }
    }

    // Layer 2: メソッドフィルタ
    if (!isAllowedMethod(request.method)) {
      return methodNotAllowedResponse();
    }

    // OPTIONSプリフライト: CORS対応
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          Allow: "GET, HEAD, OPTIONS, POST",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
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

    // CORSヘッダー（.netドメイン or プリフライト後）
    if (isApiDomain) {
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST");
    }

    // レスポンスにレート制限ヘッダーを付与
    const headers = rateLimitHeaders(globalCheck.count);
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    // X-RateLimit ヘッダー（API消費者向け）
    response.headers.set("X-RateLimit-Limit-PerMinute", "30");
    response.headers.set("X-RateLimit-Limit-Daily-Global", "100000");

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
    case "/api/summary":
      return handleSummary(url, env);
    case "/api/simulate":
      return handleSimulate(url, env);
    case "/api/docs":
      return handleApiDocsHtml();
    case "/api/data":
      return handleDataHtml(env);
    case "/api/openapi.json":
      // OpenAPI仕様は静的ファイルとして配信
      return env.ASSETS.fetch(new Request("https://surviveasonejp.org/openapi.json"));
    case "/api":
      return jsonResponse({
        name: "Survive as One API",
        version: "0.2.0",
        docs: "https://surviveasonejp.org/api-docs",
        openapi: "https://surviveasonejp.net/api/openapi.json",
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
          "GET /api/summary?scenario={id}": "プレーンテキスト概要（LLM・クローラー向け）",
          "GET /api/simulate?scenario={id}": "シミュレーション要約（枯渇日・主要イベント・備蓄データ）",
          "GET /api/docs": "APIドキュメント（HTML）",
          "GET /api/data": "全データソース概要（HTML、研究者・クローラー向け）",
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

// ─── /api/summary ────────────────────────────────────
// プレーンテキストで現在の備蓄状況とシミュレーション結果を返す。
// LLM・クローラー・研究者が直接引用可能な形式。

async function handleSummary(url: URL, env: Env): Promise<Response> {
  const scenario = (url.searchParams.get("scenario") ?? "realistic") as ScenarioId;
  if (!SCENARIOS[scenario]) {
    return new Response("Invalid scenario. Use: optimistic, realistic, pessimistic", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const countdowns = getAllCountdowns(reservesData, consumptionData, scenario);
  const sim = runFlowSimulation(scenario);
  const s = SCENARIOS[scenario];

  const oil = countdowns[0];
  const lng = countdowns[1];
  const power = countdowns[2];

  const thresholdLines = sim.thresholds
    .filter((t) => t.stockPercent >= 0)
    .sort((a, b) => a.day - b.day)
    .map((t) => `  Day ${String(t.day).padStart(3)}: ${t.label}`)
    .join("\n");

  const text = `=== Survive as One Japan — エネルギー備蓄シミュレーション ===
シナリオ: ${s.label}（${s.description}）
データ基準日: ${staticReserves.meta.baselineDate}
生成日時: ${new Date().toISOString()}

--- 備蓄残存日数 ---
石油備蓄: ${oil?.totalDays.toFixed(1) ?? "N/A"}日
LNG在庫:  ${lng?.totalDays.toFixed(1) ?? "N/A"}日
電力供給:  ${power?.totalDays.toFixed(1) ?? "N/A"}日

--- 備蓄データ ---
石油総備蓄: ${staticReserves.oil.totalReserveDays}日分（${staticReserves.oil.totalReserve_kL.toLocaleString()} kL）
  国家備蓄: ${staticReserves.oil.nationalReserveDays}日（${staticReserves.oil.nationalReserve_kL.toLocaleString()} kL）
  民間備蓄: ${staticReserves.oil.privateReserveDays}日（${staticReserves.oil.privateReserve_kL.toLocaleString()} kL）
  産油国共同: ${staticReserves.oil.jointReserveDays}日（${staticReserves.oil.jointReserve_kL.toLocaleString()} kL）
LNG在庫: ${staticReserves.lng.inventory_t.toLocaleString()} t
中東石油依存率: ${(staticReserves.oil.hormuzDependencyRate * 100).toFixed(0)}%
火力発電比率: ${(staticReserves.electricity.thermalShareRate * 100).toFixed(0)}%

--- シナリオパラメータ ---
石油遮断率: ${(s.oilBlockadeRate * 100).toFixed(0)}%
LNG遮断率: ${(s.lngBlockadeRate * 100).toFixed(1)}%
需要変動: ${s.demandReductionRate > 0 ? "-" : "+"}${Math.abs(s.demandReductionRate * 100).toFixed(0)}%

--- フローシミュレーション結果 (${sim.timeline.length}日間) ---
石油枯渇日: Day ${sim.oilDepletionDay}
LNG枯渇日: Day ${sim.lngDepletionDay}
電力崩壊日: Day ${sim.powerCollapseDay}

--- イベントタイムライン ---
${thresholdLines}

--- 出典 ---
石油備蓄: 経産省 石油備蓄推計量（${staticReserves.meta.baselineDate}時点）
消費量: OWID energy-data
電力: ISEP 電力調査統計 2024年暦年速報
LNG依存率: JETRO 2025年実績

--- ライセンス ---
AGPL-3.0 | https://github.com/surviveasonejp/surviveasone-dashboard
API: https://surviveasonejp.net/api
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// ─── /api/simulate ───────────────────────────────────
// 軽量シミュレーション結果API。/api/simulation の要約版。
// タイムライン配列を省略し、枯渇日・主要イベント・備蓄概要のみ返す。

async function handleSimulate(url: URL, env: Env): Promise<Response> {
  const scenario = (url.searchParams.get("scenario") ?? "realistic") as ScenarioId;
  if (!SCENARIOS[scenario]) {
    return jsonResponse({ error: "invalid_scenario", message: "Use: optimistic, realistic, pessimistic" }, 400);
  }

  const sim = runFlowSimulation(scenario);
  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const countdowns = getAllCountdowns(reservesData, consumptionData, scenario);
  const s = SCENARIOS[scenario];

  const events = sim.thresholds
    .filter((t) => t.stockPercent >= 0)
    .sort((a, b) => a.day - b.day)
    .map((t) => ({ day: t.day, type: t.type, resource: t.resource, label: t.label }));

  return jsonResponse({
    scenario: {
      id: scenario,
      label: s.label,
      description: s.description,
      oilBlockadeRate: s.oilBlockadeRate,
      lngBlockadeRate: s.lngBlockadeRate,
      demandReductionRate: s.demandReductionRate,
    },
    result: {
      oilDepletionDay: sim.oilDepletionDay,
      lngDepletionDay: sim.lngDepletionDay,
      powerCollapseDay: sim.powerCollapseDay,
      oilCountdownDays: countdowns[0]?.totalDays ?? null,
      lngCountdownDays: countdowns[1]?.totalDays ?? null,
      powerCountdownDays: countdowns[2]?.totalDays ?? null,
    },
    events,
    reserves: {
      baselineDate: staticReserves.meta.baselineDate,
      oil: {
        totalDays: staticReserves.oil.totalReserveDays,
        totalKL: staticReserves.oil.totalReserve_kL,
        nationalDays: staticReserves.oil.nationalReserveDays,
        privateDays: staticReserves.oil.privateReserveDays,
        jointDays: staticReserves.oil.jointReserveDays,
        hormuzDependencyRate: staticReserves.oil.hormuzDependencyRate,
      },
      lng: {
        inventoryT: staticReserves.lng.inventory_t,
        hormuzDependencyRate: staticReserves.lng.hormuzDependencyRate,
      },
      electricity: {
        thermalShareRate: staticReserves.electricity.thermalShareRate,
      },
    },
    meta: {
      generatedAt: new Date().toISOString(),
      source: "https://github.com/surviveasonejp/surviveasone-dashboard",
      license: "AGPL-3.0",
    },
  });
}

// ─── /api/docs (HTML) ────────────────────────────────
// クローラー・LLMが読めるプレーンHTMLのAPIドキュメント。

function handleApiDocsHtml(): Response {
  const endpoints = [
    { method: "GET", path: "/api/reserves", desc: "石油・LNG備蓄データ", params: "?history=true で履歴取得" },
    { method: "GET", path: "/api/consumption", desc: "日次消費量データ（OWID energy-data）", params: "" },
    { method: "GET", path: "/api/countdowns", desc: "石油/LNG/電力の残存日数", params: "?scenario=realistic" },
    { method: "GET", path: "/api/simulate", desc: "シミュレーション要約（枯渇日・イベント・備蓄）", params: "?scenario=realistic" },
    { method: "GET", path: "/api/simulation", desc: "フロー型在庫シミュレーション（365日タイムライン）", params: "?scenario=realistic&maxDays=365" },
    { method: "GET", path: "/api/collapse", desc: "10エリア崩壊順序", params: "?scenario=realistic" },
    { method: "GET", path: "/api/food-collapse", desc: "食品カテゴリ別消失予測", params: "?scenario=realistic" },
    { method: "GET", path: "/api/tankers", desc: "タンカー12隻の到着予測", params: "" },
    { method: "GET", path: "/api/regions", desc: "10電力エリア別パラメータ", params: "" },
    { method: "GET", path: "/api/electricity", desc: "電力需給実測データ", params: "?area=tokyo" },
    { method: "POST", path: "/api/family-survival", desc: "家庭生存日数算出", params: "body: {members, waterLiters, foodDays, gasCanisterCount, batteryWh, cashYen}" },
    { method: "GET", path: "/api/summary", desc: "プレーンテキスト概要", params: "?scenario=realistic" },
    { method: "GET", path: "/api/data", desc: "全データ概要（HTML）", params: "" },
    { method: "GET", path: "/api/health", desc: "ヘルスチェック", params: "" },
  ];

  const rows = endpoints.map((e) =>
    `<tr><td><code>${e.method}</code></td><td><a href="https://surviveasonejp.net${e.path}">${e.path}</a></td><td>${e.desc}</td><td><code>${e.params}</code></td></tr>`,
  ).join("\n");

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Survive as One API Documentation</title>
<meta name="description" content="Survive as One Japan API - ホルムズ海峡封鎖シミュレーションデータAPI。14エンドポイント、認証不要、AGPL-3.0。">
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:2rem;background:#0f1419;color:#d4d4d4;line-height:1.6}
h1{color:#ef4444}h2{color:#f59e0b;margin-top:2rem}a{color:#3b82f6}
table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.5rem;border:1px solid #333;text-align:left;font-size:.85rem}
th{background:#1a2332;color:#999}code{background:#1a2332;padding:.1rem .3rem;border-radius:3px;font-size:.85rem}
pre{background:#1a2332;padding:1rem;border-radius:6px;overflow-x:auto}</style></head>
<body>
<h1>Survive as One API</h1>
<p>ホルムズ海峡封鎖時の日本のエネルギー備蓄シミュレーションデータを提供するREST API。</p>
<p>Base URL: <code>https://surviveasonejp.net</code> | 認証不要 | レート制限: 30req/min, 100K/day</p>

<h2>エンドポイント一覧</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Parameters</th></tr></thead>
<tbody>${rows}</tbody></table>

<h2>シナリオID</h2>
<table><thead><tr><th>ID</th><th>Label</th><th>石油遮断</th><th>LNG遮断</th><th>需要変動</th></tr></thead>
<tbody>
<tr><td>optimistic</td><td>楽観</td><td>50%</td><td>3%</td><td>-15%</td></tr>
<tr><td>realistic</td><td>現実</td><td>94%</td><td>6.3%</td><td>-5%</td></tr>
<tr><td>pessimistic</td><td>悲観</td><td>100%</td><td>15%</td><td>+10%</td></tr>
</tbody></table>

<h2>クイックスタート</h2>
<pre>curl https://surviveasonejp.net/api/simulate?scenario=realistic</pre>
<pre>curl https://surviveasonejp.net/api/summary?scenario=pessimistic</pre>

<h2>関連リンク</h2>
<ul>
<li><a href="https://surviveasonejp.net/api/openapi.json">OpenAPI 3.0 仕様</a></li>
<li><a href="https://surviveasonejp.net/.well-known/ai-plugin.json">AI Plugin Manifest</a></li>
<li><a href="https://surviveasonejp.org/methodology">計算モデル詳細</a></li>
<li><a href="https://github.com/surviveasonejp/surviveasone-dashboard">GitHub (AGPL-3.0)</a></li>
</ul>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

// ─── /api/data (HTML) ────────────────────────────────
// 全データソースの現在値をHTMLテーブルで表示。研究者・クローラー向け。

async function handleDataHtml(env: Env): Promise<Response> {
  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const countdowns = getAllCountdowns(reservesData, consumptionData, "realistic");
  const sim = runFlowSimulation("realistic");

  const r = staticReserves;
  const oilDays = countdowns[0]?.totalDays.toFixed(1) ?? "N/A";
  const lngDays = countdowns[1]?.totalDays.toFixed(1) ?? "N/A";
  const powerDays = countdowns[2]?.totalDays.toFixed(1) ?? "N/A";

  const events = sim.thresholds
    .filter((t) => t.stockPercent >= 0)
    .sort((a, b) => a.day - b.day)
    .map((t) => `<tr><td>${t.day}</td><td>${t.resource}</td><td>${t.label}</td></tr>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Survive as One Japan — データ概要</title>
<meta name="description" content="日本のエネルギー備蓄データ概要。石油備蓄${r.oil.totalReserveDays}日分、LNG在庫${(r.lng.inventory_t / 10000).toFixed(0)}万t。経産省・OWID・ISEP等の公開データに基づく。">
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:2rem;background:#0f1419;color:#d4d4d4;line-height:1.6}
h1{color:#ef4444}h2{color:#f59e0b;margin-top:2rem}a{color:#3b82f6}
table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.5rem;border:1px solid #333;text-align:left;font-size:.85rem}
th{background:#1a2332;color:#999}.num{text-align:right;font-family:monospace}
.warn{color:#f59e0b}.crit{color:#ef4444}.safe{color:#22c55e}</style></head>
<body>
<h1>Survive as One Japan — データ概要</h1>
<p>データ基準日: <strong>${r.meta.baselineDate}</strong> | 最終更新: ${r.meta.updatedAt} | 生成: ${new Date().toISOString().slice(0, 19)}Z</p>

<h2>石油備蓄</h2>
<table>
<tr><th>区分</th><th>日数</th><th>量 (kL)</th></tr>
<tr><td>国家備蓄</td><td class="num">${r.oil.nationalReserveDays}日</td><td class="num">${r.oil.nationalReserve_kL.toLocaleString()}</td></tr>
<tr><td>民間備蓄</td><td class="num">${r.oil.privateReserveDays}日</td><td class="num">${r.oil.privateReserve_kL.toLocaleString()}</td></tr>
<tr><td>産油国共同備蓄</td><td class="num">${r.oil.jointReserveDays}日</td><td class="num">${r.oil.jointReserve_kL.toLocaleString()}</td></tr>
<tr><td><strong>合計</strong></td><td class="num"><strong>${r.oil.totalReserveDays}日</strong></td><td class="num"><strong>${r.oil.totalReserve_kL.toLocaleString()}</strong></td></tr>
</table>
<p>中東依存率: ${(r.oil.hormuzDependencyRate * 100).toFixed(0)}% | 出典: 経産省 石油備蓄推計量</p>

<h2>LNG在庫</h2>
<table>
<tr><td>在庫量</td><td class="num">${r.lng.inventory_t.toLocaleString()} t</td></tr>
<tr><td>ホルムズ依存率</td><td class="num">${(r.lng.hormuzDependencyRate * 100).toFixed(1)}%</td></tr>
</table>

<h2>電力構成</h2>
<table>
<tr><td>火力発電比率</td><td class="num">${(r.electricity.thermalShareRate * 100).toFixed(0)}%</td><td>LNG29% + 石炭28% + 石油7%</td></tr>
<tr><td>原子力比率</td><td class="num">${(r.electricity.nuclearShareRate * 100).toFixed(1)}%</td><td>稼働14基</td></tr>
<tr><td>再エネ比率</td><td class="num">${(r.electricity.renewableShareRate * 100).toFixed(1)}%</td><td>太陽光11% + 水力8% + バイオ6% + 風力1%</td></tr>
</table>

<h2>シミュレーション結果（現実シナリオ: 遮断94%）</h2>
<table>
<tr><th>指標</th><th>残存日数</th><th>フロー枯渇日</th></tr>
<tr><td>石油備蓄</td><td class="num">${oilDays}日</td><td class="num">Day ${sim.oilDepletionDay}</td></tr>
<tr><td>LNG在庫</td><td class="num">${lngDays}日</td><td class="num">Day ${sim.lngDepletionDay}</td></tr>
<tr><td>電力供給</td><td class="num">${powerDays}日</td><td class="num">Day ${sim.powerCollapseDay}</td></tr>
</table>

<h2>イベントタイムライン（現実シナリオ）</h2>
<table><thead><tr><th>Day</th><th>Resource</th><th>Event</th></tr></thead>
<tbody>${events}</tbody></table>

<h2>データソース</h2>
<ul>
<li>経産省 石油備蓄推計量（${r.meta.baselineDate}時点）</li>
<li>OWID energy-data（石油・LNG消費量、Cron週次自動更新）</li>
<li>ISEP 電力調査統計 2024年暦年速報</li>
<li>JETRO / 財務省貿易統計 2025年実績</li>
<li>OCCTO 連系線運用容量 2025年度</li>
<li>原子力規制委員会 稼働原発一覧 2026年3月時点</li>
<li>10電力エリア需給実績CSV/JSON（Cron日次自動取得）</li>
<li>化学日報 2026年3月19日（石化産業減産報道）</li>
</ul>

<h2>API・引用</h2>
<p>JSON API: <a href="https://surviveasonejp.net/api">surviveasonejp.net/api</a> |
<a href="https://surviveasonejp.net/api/docs">APIドキュメント</a> |
<a href="https://surviveasonejp.net/api/simulate?scenario=realistic">シミュレーション結果(JSON)</a></p>
<p>引用: Survive as One Japan. (2026). Hormuz Strait blockade energy simulation for Japan. https://surviveasonejp.org</p>
<p>License: <a href="https://github.com/surviveasonejp/surviveasone-dashboard">AGPL-3.0</a></p>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
