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
  getLatestOilPrice,
  getLatestPowerOutages,
  getPowerOutagesByFuelType,
  getPowerOutageSummary,
} from "./db";
import {
  getFromCache,
  setCache,
  invalidateCache,
  CACHE_KEYS,
  CACHE_TTL,
  scenarioCacheKey,
} from "./kv-cache";
import { handleScheduled } from "./cron";
import { type ScenarioId, SCENARIOS } from "../shared/scenarios";
import type { FamilyInputs } from "../shared/types";
import openApiSpec from "../../public/openapi.json";
import {
  getAllCountdowns,
  calcTankerArrivals,
  TANKERS_DATA_UPDATED_AT,
  calcFoodDepletion,
  calcRegionCollapse,
  mapReservesRow,
  mapConsumptionRow,
} from "./simulation/calculations";
import { runFlowSimulation } from "./simulation/flowSimulation";
import staticReserves from "./data/reserves.json";
import staticRealEvents from "./data/realEvents.json";
import { getAisPositions, AIS_LAST_SUCCESS_KEY, type AisPosition } from "./ais-tracker";
import { handlePetrochemTree, handlePetrochemRisk } from "./petrochem";
import {
  fetchVtsArrivals,
  getCachedVtsArrivals,
  detectNewVtsTankers,
  type VtsRouteId,
} from "./mlit-vts-fetcher";
import {
  STATUS_BY_SCENARIO,
  RESOURCE_KEYS,
  RESOURCE_STATUS_UPDATED_AT,
} from "./resource-status";
import {
  fetchNagoyaArrivals,
  getCachedNagoyaArrivals,
  detectNewNagoyaTankers,
} from "./nagoya-port-fetcher";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
  ADMIN_TOKEN?: string;
  AISSTREAM_API_KEY?: string;
  EIA_API_KEY?: string;
}

// ─── セキュリティヘッダー ──────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'sha256-G4lm7I27uE0JjOWA3Rwp3wfXru5xF6qgfwc0GsE4q7E=' https://static.cloudflareinsights.com; script-src-attr 'unsafe-hashes' 'sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc='; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com",
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

/** タイミングセーフな文字列比較（タイミング攻撃防止）
 * 長さの早期リターンを排除し、長さ不一致もXORに含めて定数時間で処理 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  let result = bufA.length ^ bufB.length;
  for (let i = 0; i < maxLen; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
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
        "/food-collapse", "/petrochem", "/family", "/prepare", "/about", "/methodology", "/api-docs",
        "/for/parents", "/for/dialysis", "/for/elderly",
      ];
      const entries = pages.map((p) =>
        `  <url><loc>https://surviveasonejp.org${p}</loc><changefreq>${p === "" ? "daily" : "weekly"}</changefreq><priority>${p === "" ? "1.0" : p === "/dashboard" ? "0.9" : "0.7"}</priority></url>`,
      ).join("\n");
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`,
        { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" } },
      );
    }

    // ── /share/family: Family Meterへのリダイレクト（旧シェアURL互換） ──
    if (url.pathname === "/share/family") {
      return Response.redirect("https://surviveasonejp.org/family", 301);
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
          // セキュリティ: Authorizationを意図的に除外。/api/tankers/updateへのCSRF防止
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
          message: "リクエスト数の上限に達しました。しばらく時間をおいて再試行してください。",
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
    case "/api/oil-price":
      return handleOilPrice(env);
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
    case "/api/tankers/update":
      return handleTankerUpdate(request, env);
    case "/api/ais":
      return handleAis(env);
    case "/api/summary":
      return handleSummary(url, env);
    case "/api/simulate":
      return handleSimulate(url, env);
    case "/api/methodology":
      return handleMethodology();
    case "/api/validation":
      return handleValidation();
    case "/api/real-events":
      return handleRealEvents(url);
    case "/api/port-arrivals":
      return handlePortArrivals(url, env);
    case "/api/resource-status":
      return handleResourceStatus(url);
    case "/api/petrochemtree":
      return handlePetrochemTree(env);
    case "/api/petrochemtree/risk":
      return handlePetrochemRisk(url, env);
    case "/api/power-outages":
      return handlePowerOutages(url, env);
    case "/api/sources":
      return handleSources();
    case "/api/docs":
      return handleApiDocsHtml();
    case "/api/data":
      return handleDataHtml(env);
    case "/api/openapi.json":
      return new Response(JSON.stringify(openApiSpec, null, 2), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    case "/api":
      return jsonResponse({
        name: "Survive as One API",
        version: "0.3.0",
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
          "GET /api/tankers": "タンカー15隻の到着予測",
          "GET /api/electricity?area={id}": "電力需給実測データ（全10エリア）",
          "GET /api/oil-price": "WTI原油スポット価格（出典: EIA）",
          "GET /api/summary?scenario={id}": "プレーンテキスト概要（LLM・クローラー向け）",
          "GET /api/simulate?scenario={id}": "シミュレーション要約（枯渇日・主要イベント・備蓄データ）",
          "GET /api/methodology": "計算モデル・前提条件・係数・出典（構造化JSON）",
          "GET /api/validation": "シミュレーション予測と実データの比較検証",
          "GET /api/real-events": "封鎖後の実イベント一覧（?recentDays=60&category=industry でフィルタ）",
          "GET /api/port-arrivals": "VTS/港湾EDI入航予定タンカー（?port=uraga|akashi|kanmon|nagoya）+ tankers.json未登録便検出",
          "GET /api/resource-status": "品目別市場ステータス（?scenario=realistic）— 4段階 normal/tight/allotted/restricted",
          "GET /api/sources": "全データソースの出典マッピング（数値→出典URLの1対1対応）",
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
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 365);
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

// ─── /api/oil-price ───────────────────────────────────

/** WTI原油スポット価格（EIA日次取得）を返す */
async function handleOilPrice(env: Env): Promise<Response> {
  // KVキャッシュ確認
  const cached = await env.CACHE.get(CACHE_KEYS.OIL_PRICE, "text");
  if (cached) {
    try {
      const parsed: unknown = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        if (typeof p.wti_usd === "number" && typeof p.date === "string" && typeof p.updatedAt === "string") {
          return jsonResponse({
            wti_usd: p.wti_usd,
            date: p.date,
            updatedAt: p.updatedAt,
            source: "EIA RWTC WTI Spot Price",
            cache: "hit",
          });
        }
      }
    } catch {
      // KVキャッシュ破損時はD1フォールバックへ
    }
  }

  // D1フォールバック
  const row = await getLatestOilPrice(env.DB);
  if (!row) {
    return jsonResponse({ error: "not_found", message: "Oil price data not yet available" }, 404);
  }

  const payload = {
    wti_usd: row.wti_usd,
    date: row.date,
    updatedAt: row.updated_at,
    source: row.source,
    cache: "miss",
  };
  // KVに再キャッシュ
  await env.CACHE.put(
    CACHE_KEYS.OIL_PRICE,
    JSON.stringify({ wti_usd: row.wti_usd, date: row.date, updatedAt: row.updated_at }),
    { expirationTtl: CACHE_TTL.OIL_PRICE },
  );
  return jsonResponse(payload);
}

// ─── /api/power-outages ───────────────────────────────

/**
 * HJKS 発電機停止情報（出典: 日本卸電力取引所）
 * ?fuel=lng|nuclear|coal|oil でフィルタ可能
 * ?summary=true でサマリのみ返す
 */
async function handlePowerOutages(url: URL, env: Env): Promise<Response> {
  const summaryOnly = url.searchParams.get("summary") === "true";
  const fuel = url.searchParams.get("fuel") ?? "";

  // KVキャッシュ確認（サマリのみ）
  if (summaryOnly) {
    const cached = await env.CACHE.get("hjks:summary", "text");
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached);
        return jsonResponse({ data: parsed, cache: "hit" });
      } catch {
        // KVキャッシュ破損時はD1フォールバックへ
      }
    }
    const summary = await getPowerOutageSummary(env.DB);
    if (!summary) {
      return jsonResponse({ error: "no_data", message: "発電機停止情報はまだ取得されていません（毎週月曜更新）" }, 404);
    }
    return jsonResponse({
      data: summary,
      source: "HJKS（日本卸電力取引所 発電情報公開システム）",
      note: "認可出力100万kW以上のユニットが対象。毎週月曜更新。",
      cache: "miss",
    });
  }

  // 全件または燃料種フィルタ
  const rows = fuel
    ? await getPowerOutagesByFuelType(env.DB, fuel)
    : await getLatestPowerOutages(env.DB);

  if (rows.length === 0) {
    return jsonResponse({ error: "no_data", message: "発電機停止情報はまだ取得されていません（毎週月曜更新）" }, 404);
  }

  return jsonResponse({
    data: rows,
    total: rows.length,
    source: "HJKS（日本卸電力取引所 発電情報公開システム）",
    note: "認可出力100万kW以上のユニットが対象。毎週月曜更新。",
    fetchedAt: rows[0]?.fetched_at ?? null,
  });
}

// ─── /api/electricity ─────────────────────────────────

const VALID_AREAS = new Set(["hokkaido", "tohoku", "tokyo", "chubu", "hokuriku", "kansai", "chugoku", "shikoku", "kyushu", "okinawa"]);

async function handleElectricity(url: URL, env: Env): Promise<Response> {
  const areaId = url.searchParams.get("area");

  if (areaId) {
    if (!VALID_AREAS.has(areaId)) {
      return jsonResponse({ error: "invalid_area", message: `Valid areas: ${[...VALID_AREAS].join(", ")}` }, 400);
    }
    const limit = Math.min(Number(url.searchParams.get("limit")) || 30, 365);
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
  // Phase 20-A: maxDays 未指定時はシナリオ別デフォルト（pessimistic は 730日）を採用
  const rawMaxDays = url.searchParams.get("maxDays");
  const maxDays = rawMaxDays !== null
    ? Math.min(Math.max(Number(rawMaxDays) || 365, 1), 730)
    : undefined;
  const cacheKey = scenarioCacheKey("api:simulation", scenario, String(maxDays ?? "default"));

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
  if (region && !VALID_AREAS.has(region)) {
    return jsonResponse({ error: "invalid_region", message: `Valid regions: ${[...VALID_AREAS].join(", ")}` }, 400);
  }
  const cacheKey = scenarioCacheKey("api:food-collapse", scenario, region);

  const cached = await getFromCache<unknown>(env.CACHE, cacheKey);
  if (cached) {
    return jsonResponse({ data: cached.data, cache: "hit" });
  }

  const { reservesData, consumptionData } = await getReservesAndConsumption(env);
  const data = calcFoodDepletion(reservesData, consumptionData, null, scenario, region || undefined);
  await setCache(env.CACHE, cacheKey, data, CACHE_TTL.SIMULATION);
  return jsonResponse({ data, cache: "miss" });
}

// ─── /api/tankers ────────────────────────────────────

const TANKER_OVERRIDES_KEY = "tanker_overrides";

interface TankerOverride {
  id: string;
  eta_days?: number;
  status?: string;
  note?: string;
  updatedAt: string;
}

async function handleTankers(env: Env): Promise<Response> {
  // AIS最終成功取得タイムスタンプ（cache hit/miss 両方で付与）
  const lastAisFetch = await env.CACHE.get(AIS_LAST_SUCCESS_KEY);
  const meta = { updatedAt: TANKERS_DATA_UPDATED_AT, lastAisFetch: lastAisFetch ?? undefined };

  const cached = await getFromCache<unknown>(env.CACHE, CACHE_KEYS.TANKERS);
  if (cached) {
    return jsonResponse({ data: cached.data, meta, cache: "hit" });
  }

  const baseTankers = calcTankerArrivals();

  // KVからオーバーライド情報を取得してマージ
  const overrides = await env.CACHE.get<TankerOverride[]>(TANKER_OVERRIDES_KEY, "json");
  if (overrides && overrides.length > 0) {
    const overrideMap = new Map<string, TankerOverride>(overrides.map((o: TankerOverride) => [o.id, o]));
    for (const tanker of baseTankers) {
      const ov = overrideMap.get(tanker.id);
      if (ov) {
        if (ov.eta_days != null) tanker.eta_days = ov.eta_days;
        if (ov.status) tanker.status = ov.status;
      }
    }
    // ETAで再ソート
    baseTankers.sort((a, b) => a.eta_days - b.eta_days);
  }

  // AIS位置データをマージ
  const aisPositions = await getAisPositions(env.CACHE);
  const aisCount = Object.keys(aisPositions).length;

  await setCache(env.CACHE, CACHE_KEYS.TANKERS, baseTankers, CACHE_TTL.SIMULATION);
  return jsonResponse({
    data: baseTankers,
    meta,
    cache: "miss",
    overrides: overrides?.length ?? 0,
    ais: aisCount > 0 ? { count: aisCount, positions: aisPositions } : undefined,
  });
}

// ─── /api/tankers/update ─────────────────────────────
// 管理者トークンで認証されたPOSTリクエストでタンカー情報を更新。
// KVにオーバーライド情報を保存し、次回のGET /api/tankersで反映される。

async function handleTankerUpdate(request: Request | undefined, env: Env): Promise<Response> {
  if (!request || request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "POST required" }, 405);
  }

  // 管理者トークン認証（タイミングセーフ比較）
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!env.ADMIN_TOKEN || !token || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return jsonResponse({ error: "unauthorized", message: "Valid ADMIN_TOKEN required" }, 401);
  }

  let body: { id: string; eta_days?: number; status?: string; note?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonResponse({ error: "invalid_json", message: "Request body must be valid JSON" }, 400);
  }

  if (!body.id) {
    return jsonResponse({ error: "invalid_input", message: "id is required" }, 400);
  }

  // ETAバリデーション
  if (body.eta_days != null && (body.eta_days < 0 || body.eta_days > 365)) {
    return jsonResponse({ error: "invalid_input", message: "eta_days must be 0-365" }, 400);
  }
  if (body.status != null && body.status.length > 100) {
    return jsonResponse({ error: "invalid_input", message: "status max 100 chars" }, 400);
  }
  if (body.note != null && body.note.length > 500) {
    return jsonResponse({ error: "invalid_input", message: "note max 500 chars" }, 400);
  }

  // 既存オーバーライドを取得して追加/更新
  const existing: TankerOverride[] = await env.CACHE.get<TankerOverride[]>(TANKER_OVERRIDES_KEY, "json") ?? [];
  const idx = existing.findIndex((o: TankerOverride) => o.id === body.id);
  const override: TankerOverride = {
    id: body.id,
    eta_days: body.eta_days,
    status: body.status,
    note: body.note,
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  if (idx >= 0) {
    existing[idx] = override;
  } else {
    existing.push(override);
  }

  await env.CACHE.put(TANKER_OVERRIDES_KEY, JSON.stringify(existing), {
    expirationTtl: 86400 * 30, // 30日保持
  });

  // タンカーキャッシュを無効化
  await invalidateCache(env.CACHE, [CACHE_KEYS.TANKERS]);

  return jsonResponse({ success: true, override, totalOverrides: existing.length });
}

// ─── /api/ais ────────────────────────────────────────

async function handleAis(env: Env): Promise<Response> {
  const positions = await getAisPositions(env.CACHE);
  const count = Object.keys(positions).length;
  return jsonResponse({
    data: positions,
    count,
    note: count === 0
      ? "AIS位置データなし。日次Cronで取得後に反映されます。"
      : `${count}隻のAIS位置データ（日次更新）`,
  });
}

// ─── /api/summary ────────────────────────────────────
// プレーンテキストで現在の備蓄状況とシミュレーション結果を返す。
// LLM・クローラー・研究者が直接引用可能な形式。

async function handleSummary(url: URL, env: Env): Promise<Response> {
  const scenario = parseScenario(url);

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

  const text = `=== SAO – Situation Awareness Observatory — エネルギー供給制約シミュレーション ===
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
  const scenario = parseScenario(url);

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
// ─── /api/methodology ────────────────────────────────
// 計算モデル・前提条件・係数・出典を構造化JSONで返す。
// 専門家・LLMがシミュレーションの根拠を一発で取得可能。

function handleMethodology(): Response {
  return jsonResponse({
    version: "0.3.0",
    models: [
      {
        id: "flow-inventory",
        title: "フロー型在庫モデル",
        equation: "dStock/dt = Inflow(t) - Consumption(t) + SPR_Release(t) + AlternativeSupply(t)",
        description: "365日間の日次在庫推移を離散時間ステップで計算",
        parameters: {
          oilDailyConsumption_kL: { value: 469000, unit: "kL/日", source: "OWID energy-data 2024" },
          lngDailyConsumption_t: { value: 178000, unit: "t/日", source: "財務省貿易統計 2025年" },
        },
      },
      {
        id: "spr-release",
        title: "SPR放出メカニズム",
        equation: "国家備蓄: delay=14日, max=300,000kL/日 / 民間: delay=0日, usable=70%",
        parameters: {
          nationalLeadTimeDays: { value: 14, source: "石油備蓄法 + IEA Emergency Response Mechanism + JOGMEC 2022年実績" },
          nationalDailyMax_kL: { value: 300000, source: "JOGMEC全10基地出荷能力推定" },
          privateUsableRatio: { value: 0.70, source: "石油連盟「石油備蓄制度のあり方」(2019)" },
        },
      },
      {
        id: "demand-destruction",
        title: "需要破壊モデル",
        equation: "demand(t) = baseDemand × blockadeRate(t) × rationFactor × destructionFactor(stockPercent)",
        parameters: {
          thresholds: [
            { stockPercent: ">50%", factor: 1.0, description: "通常" },
            { stockPercent: "30-50%", factor: 0.85, description: "産業15%削減（価格2倍相当）" },
            { stockPercent: "10-30%", factor: 0.65, description: "産業+商業35%削減（価格3倍相当）" },
            { stockPercent: "<10%", factor: 0.45, description: "生活必需のみ55%削減" },
          ],
          source: "Hamilton(2003) J.Econometrics + 1973年石油危機実績(経産省2018年エネルギー白書) + IEA Energy Supply Security(2014)",
        },
      },
      {
        id: "nuclear-correction",
        title: "原子力補正",
        equation: "thermalShare_regional = thermalShare_national × (1 - nuclearCoverage - renewableCoverage)",
        parameters: {
          nuclearUtilization: { value: 0.80, source: "原子力規制委員会 運転実績(2023-2024年度平均)" },
          nuclearCoverageMax: { value: 0.70, source: "OCCTO系統運用ルール（周波数調整用火力の最低保持）" },
          operatingReactors: { value: 15, source: "原子力規制委員会 2026年3月" },
        },
      },
      {
        id: "renewable-buffer",
        title: "再エネバッファ",
        equation: "renewableOutput = solar×CF15% + wind×CF22% + hydro×CF35%",
        parameters: {
          solarCF: { value: 0.15, source: "ISEP自然エネルギー白書 + IRENA Statistics 2024（日本実績14-17%）" },
          windCF: { value: 0.22, source: "ISEP（日本実績20-25%、陸上中心）" },
          hydroCF: { value: 0.35, source: "電力調査統計（日本実績30-40%、一般水力）" },
          renewableCoverageMax: { value: 0.40, source: "IEA Grid Integration of Variable Renewables 2023" },
        },
      },
      {
        id: "interconnection",
        title: "連系線融通",
        equation: "bonusDays = min(daysDiff × coverageRatio, daysDiff × 0.5)",
        parameters: {
          utilizationRate: { value: 0.70, source: "OCCTO広域機関ルール 緊急時運用規程（通常80-90%、危機時70%）" },
          lines: { value: 10, source: "OCCTO 2025年度運用容量" },
          iterations: { value: 3, description: "多段融通安定化のための反復回数" },
        },
      },
      {
        id: "water-cascade",
        title: "水道崩壊カスケード",
        equation: "電力停止 → +0日:水圧低下 → +1日:断水 → +3日:衛生崩壊",
        source: "厚労省「水道事業における耐震化の促進」+ 厚労省水道事業ガイドライン",
      },
      {
        id: "family-meter",
        title: "Family Meter",
        equation: "生存日数 = min(水÷3L人日, 食料日数, ガス÷30分人日, 電力÷50Wh人日)",
        parameters: {
          waterPerPersonPerDay_L: { value: 3, source: "内閣府「避難所における良好な生活環境の確保に向けた取組指針」(2016)" },
          gasCanisterMinutes: { value: 60, source: "岩谷産業公表値" },
          gasUsageMinutesPerPerson: { value: 30, source: "内閣府防災ガイドライン" },
          powerWhPerPersonPerDay: { value: 50, description: "スマホ15Wh+LED30Wh+ラジオ5Wh" },
        },
        note: "計算はクライアントブラウザ内で完結。サーバーへの送信なし",
      },
    ],
    scenarios: {
      optimistic: { oilBlockadeRate: 0.50, lngBlockadeRate: 0.03, demandReduction: 0.15, reliefStart: 7, reliefEnd: 30, finalRate: 0.10 },
      realistic: { oilBlockadeRate: 0.94, lngBlockadeRate: 0.063, demandReduction: 0.05, reliefStart: 30, reliefEnd: 120, finalRate: 0.30 },
      pessimistic: { oilBlockadeRate: 1.0, lngBlockadeRate: 0.15, demandReduction: -0.10, reliefStart: 90, reliefEnd: 365, finalRate: 0.60 },
    },
    limitations: [
      "石炭火力(28%)はホルムズ非依存。短期的直接影響は限定的だが価格波及は考慮",
      "再エネの季節変動（太陽光 夏:冬=2:1）は未反映",
      "蓄電池モデル（揚水発電含む）は未実装",
      "経済カスケードは価格弾力性の簡易モデル。為替・金利・GDP波及は未反映",
      "需要破壊モデルは1973年石油危機の近似であり、現代の経済構造との差異がある",
    ],
    license: "AGPL-3.0",
    source: "https://github.com/surviveasonejp/surviveasone-dashboard",
  }, 200, true);
}

// ─── /api/validation ─────────────────────────────────
// シミュレーション予測と実データの比較検証。

function handleValidation(): Response {
  const realEvents = staticRealEvents.events;
  const simulation = runFlowSimulation("realistic");

  // 実データとシミュレーションの照合
  const validations = realEvents
    .filter((e: { dayOffset: number }) => e.dayOffset <= 30) // 封鎖30日以内の実データ
    .map((event: { date: string; dayOffset: number; label: string; category: string; source: string; impact: string }) => {
      const simDay = simulation.timeline[event.dayOffset];
      const oilPercent = simDay ? (simDay.oilStock_kL / staticReserves.oil.totalReserve_kL) * 100 : null;
      return {
        date: event.date,
        dayOffset: event.dayOffset,
        realEvent: event.label,
        category: event.category,
        source: event.source,
        simulationState: simDay ? {
          oilStock_percent: Math.round(oilPercent! * 10) / 10,
          lngStock_t: simDay.lngStock_t,
        } : null,
      };
    });

  // 主要閾値イベントの予測vs実績
  const thresholdComparison = simulation.thresholds
    .filter((t) => t.day <= 60)
    .map((t) => ({
      day: t.day,
      type: t.type,
      resource: t.resource,
      predictedLabel: t.label,
      stockPercent: t.stockPercent,
    }));

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    scenario: "realistic",
    blockadeStartDate: "2026-03-01",
    dataAsOf: staticRealEvents.meta.updatedAt,
    realEventsCount: realEvents.length,
    validations,
    thresholdPredictions: thresholdComparison,
    summary: {
      oilDepletionDay: simulation.oilDepletionDay,
      lngDepletionDay: simulation.lngDepletionDay,
      powerCollapseDay: simulation.powerCollapseDay,
    },
    note: "validationsは実データとシミュレーション時点の在庫%を対比。thresholdPredictionsはモデルが予測する閾値イベント。実データの日付とシミュレーション閾値の日付のずれが精度指標となる",
  }, 200, true);
}

// ─── /api/real-events ────────────────────────────────
// realEvents.json の記録イベントを返却。?recentDays=N で直近フィルタ、
// ?category=X で種別（industry/government/international/medical）フィルタ。

function handleRealEvents(url: URL): Response {
  const recentDaysRaw = url.searchParams.get("recentDays");
  const category = url.searchParams.get("category");
  const recentDays = recentDaysRaw ? parseInt(recentDaysRaw, 10) : null;

  type RealEvent = {
    date: string;
    dayOffset: number;
    category: string;
    label: string;
    source: string;
    impact: string;
    scenario?: string;
    affectedPopulation?: {
      count: number;
      label: string;
      source: string;
    };
  };

  let events: RealEvent[] = staticRealEvents.events as RealEvent[];

  if (category) {
    events = events.filter((e) => e.category === category);
  }

  if (recentDays && recentDays > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - recentDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    events = events.filter((e) => e.date >= cutoffStr);
  }

  // 新しい順にソート
  events = events.slice().sort((a, b) => b.date.localeCompare(a.date));

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    dataAsOf: staticRealEvents.meta.updatedAt,
    blockadeStartDate: staticRealEvents.blockadeStartDate,
    count: events.length,
    filters: { recentDays, category },
    events,
  }, 200, true);
}

// ─── /api/port-arrivals ──────────────────────────────
// 公開VTS/港湾EDIから入航予定タンカーを取得し、tankers.json未登録便を検出
// ?port=uraga (東京湾・既定) | akashi (大阪湾) | kanmon (関門海峡) | nagoya (名古屋港)
// ?refresh=true でKVキャッシュを無視して強制フェッチ

const VTS_ROUTES: VtsRouteId[] = ["uraga", "akashi", "kanmon"];

async function handlePortArrivals(url: URL, env: Env): Promise<Response> {
  const port = url.searchParams.get("port") ?? "uraga";
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const registeredNames = calcTankerArrivals().map((v) => v.name);

  // MLIT VTS 3ルート
  if ((VTS_ROUTES as string[]).includes(port)) {
    const routeId = port as VtsRouteId;
    let data = forceRefresh ? null : await getCachedVtsArrivals(env, routeId);
    if (!data) {
      try {
        data = await fetchVtsArrivals(env, routeId);
      } catch (err) {
        return jsonResponse({
          error: "fetch_failed",
          port: routeId,
          message: err instanceof Error ? err.message : "unknown",
          fallback: await getCachedVtsArrivals(env, routeId),
        }, 503, false);
      }
    }
    const newTankers = detectNewVtsTankers(data.tankerArrivals, registeredNames);
    return jsonResponse({
      generatedAt: new Date().toISOString(),
      port: routeId,
      portName: data.routeLabel,
      dataSource: "国土交通省 海上保安庁 海上交通センター（VTS）",
      fetchedAt: data.fetchedAt,
      totalArrivals: data.totalArrivals,
      tankerArrivals: data.tankerArrivals,
      tankerArrivalsCount: data.tankerArrivals.length,
      newTankers,
      newTankersCount: newTankers.length,
      note: "油タンカー/ガスタンカー/ケミカルタンカーを抽出。船名はtankers.jsonと正規化比較し未登録便をnewTankersに列挙。IMO番号は含まれない",
    }, 200, true);
  }

  if (port === "nagoya") {
    let data = forceRefresh ? null : await getCachedNagoyaArrivals(env);
    if (!data) {
      try {
        data = await fetchNagoyaArrivals(env);
      } catch (err) {
        return jsonResponse({
          error: "fetch_failed",
          port,
          message: err instanceof Error ? err.message : "unknown",
          fallback: await getCachedNagoyaArrivals(env),
        }, 503, false);
      }
    }
    const newTankers = detectNewNagoyaTankers(data.tankerArrivals, registeredNames);
    return jsonResponse({
      generatedAt: new Date().toISOString(),
      port: "nagoya",
      portName: "名古屋港（伊勢湾）",
      dataSource: "名古屋港管理組合 入港予定船情報",
      fetchedAt: data.fetchedAt,
      totalArrivals: data.totalArrivals,
      tankerArrivals: data.tankerArrivals,
      tankerArrivalsCount: data.tankerArrivals.length,
      newTankers,
      newTankersCount: newTankers.length,
      note: "プロダクトオイルタンカー/油送船/LNG船/外航ケミカル船を抽出。コールサインは含まれるがIMOなし",
    }, 200, true);
  }

  return jsonResponse({
    error: "invalid_port",
    supported: [...VTS_ROUTES, "nagoya"],
    requested: port,
  }, 400, false);
}

// ─── /api/resource-status ────────────────────────────
// 品目別市場ステータス（4段階: normal/tight/allotted/restricted）をシナリオ別に返却
// Phase 24: ops 側が market_status トリガーでポーリング→KVスナップショット比較

function handleResourceStatus(url: URL): Response {
  const scenario = url.searchParams.get("scenario") ?? "realistic";
  const data = (STATUS_BY_SCENARIO as Record<string, unknown>)[scenario];
  if (!data) {
    return jsonResponse({
      error: "invalid_scenario",
      supported: Object.keys(STATUS_BY_SCENARIO),
      requested: scenario,
    }, 400, false);
  }

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    scenario,
    updatedAt: RESOURCE_STATUS_UPDATED_AT,
    resources: RESOURCE_KEYS,
    statuses: data,
    note: "4段階ステータス（normal/tight/allotted/restricted）。sinceは遷移起点日、sourceは根拠出典",
  }, 200, true);
}

// ─── /api/sources ────────────────────────────────────
// 全データソースの出典マッピング（数値→出典URLの1対1対応）

function handleSources(): Response {
  return jsonResponse({
    generatedAt: new Date().toISOString(),
    description: "全入力データの出典マッピング。各数値の根拠となる公開データソースのURL・文書名・基準日を記載",
    sources: [
      {
        category: "石油備蓄",
        items: [
          { key: "oil.totalReserve_kL", value: 71330000, unit: "kL", source: "経産省 石油備蓄推計量", url: "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl001/results.html", baselineDate: "2026-03-20", confidence: "verified" },
          { key: "oil.nationalReserve_kL", value: 43220000, unit: "kL", source: "経産省 石油備蓄推計量", baselineDate: "2026-03-20", confidence: "verified" },
          { key: "oil.privateReserve_kL", value: 26330000, unit: "kL", source: "経産省 石油備蓄推計量", baselineDate: "2026-03-20", confidence: "verified" },
          { key: "oil.hormuzDependencyRate", value: 0.94, source: "JETRO / 財務省貿易統計 2025年実績", url: "https://www.jetro.go.jp/", confidence: "verified" },
        ],
      },
      {
        category: "LNG",
        items: [
          { key: "lng.inventory_t", value: 4500000, unit: "t", source: "経産省ガス事業統計+電力調査統計(2025年平均)", note: "ガス事業用+発電用の合算推計。経産省公表の発電用のみ(約230万t)とは集計範囲が異なる", confidence: "estimated" },
          { key: "lng.hormuzDependencyRate", value: 0.063, source: "JETRO 2025年実績 カタール5.3%+UAE1.0%", confidence: "verified" },
          { key: "lng.dailyConsumption_t", value: 178000, unit: "t/日", source: "財務省貿易統計 2025年 LNG輸入量6,498万t÷365", confidence: "verified" },
        ],
      },
      {
        category: "電力構成",
        items: [
          { key: "electricity.thermalShareRate", value: 0.65, source: "ISEP 2024年暦年速報(電力調査統計ベース)", url: "https://www.isep.or.jp/archives/library/15158", note: "LNG29.1%+石炭28.2%+石油1.4%+他6.3%", confidence: "verified" },
          { key: "electricity.nuclearShareRate", value: 0.082, source: "ISEP 2024年暦年速報", confidence: "verified" },
          { key: "electricity.renewableShareRate", value: 0.267, source: "ISEP 2024年暦年速報", confidence: "verified" },
        ],
      },
      {
        category: "消費量",
        items: [
          { key: "oil.dailyConsumption_kL", value: 469000, unit: "kL/日", source: "OWID energy-data 2024", url: "https://github.com/owid/energy-data", confidence: "verified" },
        ],
      },
      {
        category: "連系線",
        items: [
          { key: "interconnections", value: "10本", source: "OCCTO 電力広域的運営推進機関 2025年度運用容量", url: "https://www.occto.or.jp/", confidence: "verified" },
        ],
      },
      {
        category: "原子力",
        items: [
          { key: "nuclearReactors", value: 15, unit: "基", source: "原子力規制委員会", url: "https://www.nra.go.jp/jimusho/unten_jokyo.html", note: "関西7+九州4+東京1(柏崎刈羽6号)+四国1+東北1+中国1(島根2号定検停止中)", confidence: "verified" },
        ],
      },
      {
        category: "食料",
        items: [
          { key: "foodSelfSufficiency", value: 0.38, source: "農水省 食料需給表 令和6年度概算", url: "https://www.maff.go.jp/j/zyukyu/zikyu_ritu/012.html", note: "カロリーベース総合38%", confidence: "verified" },
          { key: "governmentRiceReserve_t", value: 295000, unit: "t", source: "農水省 米穀需給基本指針 2025年8月時点", note: "適正水準100万tだが令和コメ騒動で大量放出", confidence: "verified" },
        ],
      },
      {
        category: "シミュレーション係数",
        items: [
          { key: "solarCF", value: 0.15, source: "ISEP自然エネルギー白書 + IRENA Statistics 2024", confidence: "estimated" },
          { key: "windCF", value: 0.22, source: "ISEP（日本実績20-25%）", confidence: "estimated" },
          { key: "hydroCF", value: 0.35, source: "電力調査統計（日本実績30-40%）", confidence: "estimated" },
          { key: "demandDestructionCoefficients", value: "0.85/0.65/0.45", source: "Hamilton(2003) + 1973年石油危機実績 + IEA Energy Supply Security(2014)", confidence: "estimated" },
          { key: "interconnectionUtilization", value: 0.70, source: "OCCTO緊急時運用規程", confidence: "estimated" },
        ],
      },
      {
        category: "サプライチェーン（物流・石化・冷蔵）",
        items: [
          { key: "truckDiesel_kL_per_day", value: 100000, unit: "kL/日", source: "国交省 自動車燃料消費量調査(月報)", url: "https://www.mlit.go.jp/k-toukei/nenryousyouhiryou.html", note: "営業用トラックの軽油消費量。e-Stat APIで月次取得可能", confidence: "verified" },
          { key: "napthaInventoryDays", value: 14, unit: "日", source: "資源エネルギー庁 石油統計 令和8年1月分（在庫138.6万kL÷日販9.95万kL）", url: "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html", note: "石油化学用原料ナフサの原料在庫日数。中東依存率73.6%（JPCA 2024年実績）。封鎖14日でエチレンセンター在庫限界。なお川下製品（PE/PP等ポリマー）は別途3.5ヶ月分（約105日）の在庫が確保されている（JPCA声明 2026-03-17）", confidence: "verified" },
          { key: "petrochemDownstreamBufferDays", value: 105, unit: "日", source: "石油化学工業協会(JPCA) 声明 2026-03-17", url: "https://www.jpca.or.jp/", note: "PE・PP等ポリマー製品（川下製品）の国内在庫。ナフサ原料14日分に対し、すでに製品化されたポリオレフィン等は3.5ヶ月分が確保済み。ナフサ供給途絶後もこの在庫が包装材等の消失を遅延させる", confidence: "verified" },
          { key: "ethyleneProduction", source: "JPCA 主要石油化学製品生産実績(月次)", url: "https://www.jpca.or.jp/statistics/monthly/mainpd.html", note: "エチレン・4樹脂(PE/PP/PS/PVC)の生産・出荷・在庫。包装材消失日の根拠", confidence: "verified" },
          { key: "frozenFoodInventoryDays", value: 10, unit: "日", source: "日本冷蔵倉庫協会 月次統計", url: "https://www.jarw.or.jp/know/statistics", note: "主要12都市の品目別入庫・出庫・在庫数量。停電72hで在庫全損", confidence: "verified" },
          { key: "coldStorageFishInventory", source: "農水省 冷蔵水産物在庫量調査", url: "https://www.maff.go.jp/j/tokei/kouhyou/suisan_ryutu/reizou_zaikoryou/", note: "水産物の冷蔵在庫量(月次)", confidence: "verified" },
        ],
      },
      {
        category: "ライフライン復旧想定",
        items: [
          { key: "powerRestorationDays", value: 6, unit: "日", source: "内閣府 首都直下地震被害想定", note: "電力復旧目標。東日本大震災実績: 1週間で95%解消", confidence: "verified" },
          { key: "waterRestorationDays", value: 30, unit: "日", source: "内閣府 首都直下地震被害想定", note: "上水道復旧目標。東日本大震災: 187市町村220万戸断水", confidence: "verified" },
          { key: "gasRestorationDays", value: 55, unit: "日", source: "内閣府 首都直下地震被害想定", note: "都市ガス復旧目標。東日本大震災: 48万戸供給停止→5/3復旧", confidence: "verified" },
        ],
      },
    ],
    confidenceLevels: {
      verified: "政府統計・公式発表に基づく実績値",
      estimated: "統計と推定の混合。出典を元に設定した推定値",
    },
    license: "AGPL-3.0",
  }, 200, true);
}

// クローラー・LLMが読めるプレーンHTMLのAPIドキュメント。

function handleApiDocsHtml(): Response {
  const endpoints = [
    { method: "GET", path: "/api/health", desc: "ヘルスチェック・バージョン情報", params: "" },
    { method: "GET", path: "/api/reserves", desc: "石油・LNG備蓄データ（国家/民間/産油国共同内訳）", params: "?history=true で履歴取得" },
    { method: "GET", path: "/api/consumption", desc: "日次消費量データ（OWID energy-data）", params: "" },
    { method: "GET", path: "/api/regions", desc: "全国10電力エリアパラメータ（原子力・再エネ・連系線）", params: "" },
    { method: "GET", path: "/api/electricity", desc: "電力需給実測データ（全10エリア、日次自動更新）", params: "?area=tokyo" },
    { method: "GET", path: "/api/oil-price", desc: "WTI原油スポット価格（EIA RWTC、日次自動更新）", params: "" },
    { method: "GET", path: "/api/countdowns", desc: "石油/LNG/電力の供給可能日数", params: "?scenario=realistic" },
    { method: "GET", path: "/api/collapse", desc: "全国10エリア供給影響順序", params: "?scenario=realistic" },
    { method: "GET", path: "/api/simulation", desc: "フロー型在庫シミュレーション（365日タイムライン）", params: "?scenario=realistic&maxDays=365" },
    { method: "GET", path: "/api/simulate", desc: "シミュレーション要約（制約到達日・イベント・備蓄）", params: "?scenario=realistic" },
    { method: "GET", path: "/api/food-collapse", desc: "食品カテゴリ別供給制約予測", params: "?scenario=realistic" },
    { method: "GET", path: "/api/tankers", desc: "タンカー21隻の到着予測（VLCC11+LNG9+Chemical1）", params: "" },
    { method: "GET", path: "/api/ais", desc: "AIS生データ（位置・速度・目的港・日本向け判定）", params: "" },
    { method: "GET", path: "/api/petrochemtree", desc: "石化サプライチェーン樹形図ノード・エッジデータ", params: "" },
    { method: "GET", path: "/api/petrochemtree/risk", desc: "石化樹形図シナリオ別リスクスコア・崩壊フラグ", params: "?scenario=realistic" },
    { method: "GET", path: "/api/methodology", desc: "16計算モデルのメタデータ・パラメータ・信頼度", params: "" },
    { method: "GET", path: "/api/validation", desc: "シミュレーション予測 vs 実際の照合結果", params: "" },
    { method: "GET", path: "/api/real-events", desc: "封鎖後の実イベント一覧（日付降順）", params: "?recentDays=60&category=industry" },
    { method: "GET", path: "/api/port-arrivals", desc: "VTS/港湾EDI入航予定タンカー + 未登録便検出", params: "?port=uraga|akashi|kanmon|nagoya&refresh=true" },
    { method: "GET", path: "/api/resource-status", desc: "品目別市場ステータス（4段階）シナリオ別", params: "?scenario=realistic" },
    { method: "GET", path: "/api/sources", desc: "全データソース一覧（更新頻度・自動/手動・信頼度）", params: "" },
    { method: "GET", path: "/api/summary", desc: "プレーンテキスト概要（LLM・クローラー向け）", params: "?scenario=realistic" },
    { method: "GET", path: "/api/data", desc: "全データ概要（HTML、研究者向け）", params: "" },
    { method: "GET", path: "/api/docs", desc: "APIドキュメント（このページ）", params: "" },
    { method: "GET", path: "/api/openapi.json", desc: "OpenAPI 3.0仕様", params: "" },
  ];

  const rows = endpoints.map((e) =>
    `<tr><td><code>${e.method}</code></td><td><a href="https://surviveasonejp.net${e.path}">${e.path}</a></td><td>${e.desc}</td><td><code>${e.params}</code></td></tr>`,
  ).join("\n");

  const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAO – Situation Awareness Observatory API Documentation</title>
<meta name="description" content="SAO – Situation Awareness Observatory API - ホルムズ海峡封鎖シミュレーションデータAPI。23エンドポイント、認証不要、AGPL-3.0。">
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:2rem;background:#0f1419;color:#d4d4d4;line-height:1.6}
h1{color:#ef4444}h2{color:#f59e0b;margin-top:2rem}a{color:#3b82f6}
table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:.5rem;border:1px solid #333;text-align:left;font-size:.85rem}
th{background:#1a2332;color:#999}code{background:#1a2332;padding:.1rem .3rem;border-radius:3px;font-size:.85rem}
pre{background:#1a2332;padding:1rem;border-radius:6px;overflow-x:auto}</style></head>
<body>
<h1>SAO – Situation Awareness Observatory API</h1>
<p>ホルムズ海峡封鎖シナリオ下での日本のエネルギー・食料・石化サプライチェーンの供給制約シミュレーションデータを提供するREST API。</p>
<p>Base URL: <code>https://surviveasonejp.net</code> | 認証不要 | レート制限: 30req/min, 100K/day</p>

<h2>エンドポイント一覧</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Parameters</th></tr></thead>
<tbody>${rows}</tbody></table>

<h2>シナリオID</h2>
<table><thead><tr><th>ID</th><th>Label</th><th>石油遮断</th><th>LNG遮断</th><th>需要変動</th></tr></thead>
<tbody>
<tr><td>optimistic</td><td>国際協調</td><td>50%</td><td>3%</td><td>-15%</td></tr>
<tr><td>realistic</td><td>標準対応</td><td>94%</td><td>6.3%</td><td>-5%</td></tr>
<tr><td>pessimistic</td><td>需要超過</td><td>100%</td><td>15%</td><td>+10%</td></tr>
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
<tr><td>火力発電比率</td><td class="num">${(r.electricity.thermalShareRate * 100).toFixed(0)}%</td><td>LNG29.1% + 石炭28.2% + 石油1.4% + 他6.3%</td></tr>
<tr><td>原子力比率</td><td class="num">${(r.electricity.nuclearShareRate * 100).toFixed(1)}%</td><td>稼働15基</td></tr>
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
