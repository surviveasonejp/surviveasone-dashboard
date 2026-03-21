/**
 * Cache APIベースの分散レートリミッター
 *
 * Workers isolateはエッジごとに独立するため、インメモリカウンターでは
 * グローバルなリクエスト数を追跡できない。
 * Cache APIはcoloレベル（データセンター単位）で共有されるため、
 * isolateを跨いだカウントが可能。
 *
 * 制限: Cache APIはcoloレベルなので、東京・大阪間では共有されない。
 * → 安全マージンを大きく取ることで対処（70%で制限開始）。
 */

import {
  WORKERS_FREE,
  SAFETY,
  getDayKey,
  getSecondsUntilDailyReset,
} from "./free-tier";

// Cache APIで使う仮想URLのベース
const COUNTER_BASE = "https://internal.rate-limit.local";

interface CounterEntry {
  count: number;
  day: string;
}

/**
 * Cache APIを使ってカウンターを読み書きする。
 * キーはURLパス、値はResponseのbodyにJSONで格納。
 */
async function getCounter(cache: Cache, key: string): Promise<CounterEntry> {
  const url = `${COUNTER_BASE}/${key}`;
  const cached = await cache.match(new Request(url));
  if (!cached) {
    return { count: 0, day: getDayKey() };
  }
  const entry: CounterEntry = await cached.json();
  // 日付が変わっていたらリセット
  if (entry.day !== getDayKey()) {
    return { count: 0, day: getDayKey() };
  }
  return entry;
}

async function setCounter(
  cache: Cache,
  key: string,
  entry: CounterEntry,
): Promise<void> {
  const url = `${COUNTER_BASE}/${key}`;
  const ttl = getSecondsUntilDailyReset();
  const response = new Response(JSON.stringify(entry), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `max-age=${ttl}`,
    },
  });
  await cache.put(new Request(url), response);
}

// ─── グローバル日次リクエスト制限 ──────────────────────

export type GlobalLimitResult =
  | { allowed: true; count: number; limit: number }
  | { allowed: false; count: number; limit: number; retryAfter: number };

export async function checkGlobalDailyLimit(): Promise<GlobalLimitResult> {
  const cache = await caches.open("rate-limit:global");
  const entry = await getCounter(cache, "daily-requests");
  const newCount = entry.count + 1;
  const limit = WORKERS_FREE.DAILY_REQUESTS;

  const updated: CounterEntry = { count: newCount, day: getDayKey() };
  await setCounter(cache, "daily-requests", updated);

  const cutoff = Math.floor(limit * SAFETY.API_CUTOFF_RATIO);
  if (newCount > cutoff) {
    return {
      allowed: false,
      count: newCount,
      limit,
      retryAfter: getSecondsUntilDailyReset(),
    };
  }

  return { allowed: true, count: newCount, limit };
}

export function getGlobalUsageLevel(count: number): "ok" | "warning" | "critical" {
  const ratio = count / WORKERS_FREE.DAILY_REQUESTS;
  if (ratio >= SAFETY.API_CUTOFF_RATIO) return "critical";
  if (ratio >= SAFETY.API_THROTTLE_RATIO) return "warning";
  return "ok";
}

// ─── Per-IP レート制限 ─────────────────────────────────

export type IpLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; reason: string };

export async function checkIpRateLimit(ip: string): Promise<IpLimitResult> {
  const cache = await caches.open("rate-limit:ip");
  const ipKey = await hashIp(ip);

  // 1分間レート
  const minuteEntry = await getMinuteCounter(cache, ipKey);
  if (minuteEntry.count >= SAFETY.PER_IP_PER_MINUTE) {
    return {
      allowed: false,
      retryAfter: 60,
      reason: "per_minute_limit",
    };
  }
  await setMinuteCounter(cache, ipKey, {
    count: minuteEntry.count + 1,
    minute: getCurrentMinuteKey(),
  });

  // 日次レート
  const dailyEntry = await getCounter(cache, `daily:${ipKey}`);
  if (dailyEntry.count >= SAFETY.PER_IP_DAILY_API) {
    return {
      allowed: false,
      retryAfter: getSecondsUntilDailyReset(),
      reason: "per_day_limit",
    };
  }
  await setCounter(cache, `daily:${ipKey}`, {
    count: dailyEntry.count + 1,
    day: getDayKey(),
  });

  return { allowed: true };
}

// 分単位のカウンター
interface MinuteCounterEntry {
  count: number;
  minute: string;
}

function getCurrentMinuteKey(): string {
  return new Date().toISOString().slice(0, 16); // "2026-03-20T12:34"
}

async function getMinuteCounter(
  cache: Cache,
  ipKey: string,
): Promise<MinuteCounterEntry> {
  const url = `${COUNTER_BASE}/minute:${ipKey}`;
  const cached = await cache.match(new Request(url));
  if (!cached) {
    return { count: 0, minute: getCurrentMinuteKey() };
  }
  const entry: MinuteCounterEntry = await cached.json();
  if (entry.minute !== getCurrentMinuteKey()) {
    return { count: 0, minute: getCurrentMinuteKey() };
  }
  return entry;
}

async function setMinuteCounter(
  cache: Cache,
  ipKey: string,
  entry: MinuteCounterEntry,
): Promise<void> {
  const url = `${COUNTER_BASE}/minute:${ipKey}`;
  const response = new Response(JSON.stringify(entry), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "max-age=60",
    },
  });
  await cache.put(new Request(url), response);
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + getDayKey()); // 日替わりソルト
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── レスポンスヘッダー ────────────────────────────────

export function rateLimitHeaders(count: number): Record<string, string> {
  const limit = WORKERS_FREE.DAILY_REQUESTS;
  const remaining = Math.max(0, limit - count);
  return {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": (
      Math.floor(Date.now() / 1000) + getSecondsUntilDailyReset()
    ).toString(),
  };
}
