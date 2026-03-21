/**
 * D1/KV/R2 クォータガード（Cache APIベース）
 *
 * rate-limit.tsと同じ方式でCache APIのcoloレベル共有カウンターを使用。
 * インメモリカウンターでは isolate間で状態が共有されないため、
 * Cache APIで正確なクォータ追跡を実現する。
 *
 * - KV/D1: 日次カウンター（UTC 00:00リセット）
 * - R2: 月次カウンター（毎月1日リセット）
 */

import {
  KV_FREE,
  D1_FREE,
  R2_FREE,
  SAFETY,
  getDayKey,
  getSecondsUntilDailyReset,
  getSecondsUntilMonthlyReset,
} from "./free-tier";

// ─── Cache API ヘルパー ───────────────────────────────

const COUNTER_BASE = "https://internal.quota-guard.local";

interface DailyEntry {
  count: number;
  day: string;
}

interface MonthlyEntry {
  count: number;
  month: string;
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

async function getDailyCounter(key: string): Promise<DailyEntry> {
  const cache = await caches.open("quota-guard");
  const cached = await cache.match(new Request(`${COUNTER_BASE}/${key}`));
  if (!cached) return { count: 0, day: getDayKey() };
  const entry: DailyEntry = await cached.json();
  if (entry.day !== getDayKey()) return { count: 0, day: getDayKey() };
  return entry;
}

async function setDailyCounter(key: string, entry: DailyEntry): Promise<void> {
  const cache = await caches.open("quota-guard");
  await cache.put(
    new Request(`${COUNTER_BASE}/${key}`),
    new Response(JSON.stringify(entry), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${getSecondsUntilDailyReset()}`,
      },
    }),
  );
}

async function getMonthlyCounter(key: string): Promise<MonthlyEntry> {
  const cache = await caches.open("quota-guard");
  const cached = await cache.match(new Request(`${COUNTER_BASE}/${key}`));
  if (!cached) return { count: 0, month: getCurrentMonth() };
  const entry: MonthlyEntry = await cached.json();
  if (entry.month !== getCurrentMonth()) return { count: 0, month: getCurrentMonth() };
  return entry;
}

async function setMonthlyCounter(key: string, entry: MonthlyEntry): Promise<void> {
  const cache = await caches.open("quota-guard");
  await cache.put(
    new Request(`${COUNTER_BASE}/${key}`),
    new Response(JSON.stringify(entry), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${getSecondsUntilMonthlyReset()}`,
      },
    }),
  );
}

// ─── クォータチェック結果 ─────────────────────────────

type QuotaResult =
  | { allowed: true }
  | { allowed: false; service: string; retryAfter: number };

// ─── KV ガード ────────────────────────────────────────

export async function checkKvRead(): Promise<QuotaResult> {
  const entry = await getDailyCounter("kv-reads");
  const cutoff = Math.floor(KV_FREE.DAILY_READS * SAFETY.KV_CUTOFF_RATIO);
  if (entry.count >= cutoff) {
    return { allowed: false, service: "KV read", retryAfter: getSecondsUntilDailyReset() };
  }
  await setDailyCounter("kv-reads", { count: entry.count + 1, day: getDayKey() });
  return { allowed: true };
}

export async function checkKvWrite(): Promise<QuotaResult> {
  const entry = await getDailyCounter("kv-writes");
  const cutoff = Math.floor(KV_FREE.DAILY_WRITES * SAFETY.KV_CUTOFF_RATIO);
  if (entry.count >= cutoff) {
    return { allowed: false, service: "KV write", retryAfter: getSecondsUntilDailyReset() };
  }
  await setDailyCounter("kv-writes", { count: entry.count + 1, day: getDayKey() });
  return { allowed: true };
}

// ─── D1 ガード ────────────────────────────────────────

export async function checkD1Read(rowCount: number = 1): Promise<QuotaResult> {
  const entry = await getDailyCounter("d1-reads");
  const cutoff = Math.floor(D1_FREE.DAILY_ROWS_READ * SAFETY.D1_CUTOFF_RATIO);
  if (entry.count + rowCount > cutoff) {
    return { allowed: false, service: "D1 read", retryAfter: getSecondsUntilDailyReset() };
  }
  await setDailyCounter("d1-reads", { count: entry.count + rowCount, day: getDayKey() });
  return { allowed: true };
}

export async function checkD1Write(rowCount: number = 1): Promise<QuotaResult> {
  const entry = await getDailyCounter("d1-writes");
  const cutoff = Math.floor(D1_FREE.DAILY_ROWS_WRITTEN * SAFETY.D1_CUTOFF_RATIO);
  if (entry.count + rowCount > cutoff) {
    return { allowed: false, service: "D1 write", retryAfter: getSecondsUntilDailyReset() };
  }
  await setDailyCounter("d1-writes", { count: entry.count + rowCount, day: getDayKey() });
  return { allowed: true };
}

// ─── R2 ガード ────────────────────────────────────────

export async function checkR2ClassA(): Promise<QuotaResult> {
  const entry = await getMonthlyCounter("r2-class-a");
  const cutoff = Math.floor(R2_FREE.MONTHLY_CLASS_A_OPS * SAFETY.KV_CUTOFF_RATIO);
  if (entry.count >= cutoff) {
    return { allowed: false, service: "R2 Class A", retryAfter: getSecondsUntilMonthlyReset() };
  }
  await setMonthlyCounter("r2-class-a", { count: entry.count + 1, month: getCurrentMonth() });
  return { allowed: true };
}

export async function checkR2ClassB(): Promise<QuotaResult> {
  const entry = await getMonthlyCounter("r2-class-b");
  const cutoff = Math.floor(R2_FREE.MONTHLY_CLASS_B_OPS * SAFETY.KV_CUTOFF_RATIO);
  if (entry.count >= cutoff) {
    return { allowed: false, service: "R2 Class B", retryAfter: getSecondsUntilMonthlyReset() };
  }
  await setMonthlyCounter("r2-class-b", { count: entry.count + 1, month: getCurrentMonth() });
  return { allowed: true };
}

// ─── クォータ超過レスポンス ───────────────────────────

export function quotaExceededResponse(
  service: string,
  retryAfter: number,
): Response {
  return new Response(
    JSON.stringify({
      error: "quota_exceeded",
      message: `${service}の無料枠上限に達しました。`,
      retry_after_seconds: retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfter.toString(),
        "Cache-Control": "no-store",
      },
    },
  );
}

// ─── 現在のクォータ状態（/api/health 用）───────────────

export async function getQuotaStatus() {
  const [kvReads, kvWrites, d1Reads, d1Writes, r2ClassA, r2ClassB] =
    await Promise.all([
      getDailyCounter("kv-reads"),
      getDailyCounter("kv-writes"),
      getDailyCounter("d1-reads"),
      getDailyCounter("d1-writes"),
      getMonthlyCounter("r2-class-a"),
      getMonthlyCounter("r2-class-b"),
    ]);

  return {
    kv: {
      reads: { used: kvReads.count, limit: KV_FREE.DAILY_READS },
      writes: { used: kvWrites.count, limit: KV_FREE.DAILY_WRITES },
    },
    d1: {
      rows_read: { used: d1Reads.count, limit: D1_FREE.DAILY_ROWS_READ },
      rows_written: { used: d1Writes.count, limit: D1_FREE.DAILY_ROWS_WRITTEN },
    },
    r2: {
      class_a: { used: r2ClassA.count, limit: R2_FREE.MONTHLY_CLASS_A_OPS },
      class_b: { used: r2ClassB.count, limit: R2_FREE.MONTHLY_CLASS_B_OPS },
    },
  };
}
