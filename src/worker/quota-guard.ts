/**
 * D1/KV/R2 クォータガード（Phase 2準備）
 *
 * 各サービスの操作を実行前にクォータチェックし、
 * 無料枠超過を未然に防止する。
 *
 * Phase 1では未使用だが、D1/KV/R2バインディング追加時に
 * 全操作をこのガード経由で実行する。
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

// ─── インメモリカウンター（coloレベル概算） ────────────
// Phase 2でKVに移行予定。暫定的にisolateメモリで追跡。

interface DailyCounter {
  day: string;
  count: number;
}

interface MonthlyCounter {
  month: string; // "2026-03"
  count: number;
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const counters = {
  kvReads: { day: "", count: 0 } as DailyCounter,
  kvWrites: { day: "", count: 0 } as DailyCounter,
  d1Reads: { day: "", count: 0 } as DailyCounter,
  d1Writes: { day: "", count: 0 } as DailyCounter,
  r2ClassA: { month: "", count: 0 } as MonthlyCounter,
  r2ClassB: { month: "", count: 0 } as MonthlyCounter,
};

function resetDailyIfNeeded(counter: DailyCounter): void {
  const today = getDayKey();
  if (counter.day !== today) {
    counter.day = today;
    counter.count = 0;
  }
}

function resetMonthlyIfNeeded(counter: MonthlyCounter): void {
  const month = getCurrentMonth();
  if (counter.month !== month) {
    counter.month = month;
    counter.count = 0;
  }
}

// ─── クォータチェック結果 ─────────────────────────────

type QuotaResult =
  | { allowed: true }
  | { allowed: false; service: string; retryAfter: number };

// ─── KV ガード ────────────────────────────────────────

export function checkKvRead(): QuotaResult {
  resetDailyIfNeeded(counters.kvReads);
  const cutoff = Math.floor(KV_FREE.DAILY_READS * SAFETY.KV_CUTOFF_RATIO);
  if (counters.kvReads.count >= cutoff) {
    return {
      allowed: false,
      service: "KV read",
      retryAfter: getSecondsUntilDailyReset(),
    };
  }
  counters.kvReads.count++;
  return { allowed: true };
}

export function checkKvWrite(): QuotaResult {
  resetDailyIfNeeded(counters.kvWrites);
  const cutoff = Math.floor(KV_FREE.DAILY_WRITES * SAFETY.KV_CUTOFF_RATIO);
  if (counters.kvWrites.count >= cutoff) {
    return {
      allowed: false,
      service: "KV write",
      retryAfter: getSecondsUntilDailyReset(),
    };
  }
  counters.kvWrites.count++;
  return { allowed: true };
}

// ─── D1 ガード ────────────────────────────────────────

export function checkD1Read(rowCount: number = 1): QuotaResult {
  resetDailyIfNeeded(counters.d1Reads);
  const cutoff = Math.floor(D1_FREE.DAILY_ROWS_READ * SAFETY.D1_CUTOFF_RATIO);
  if (counters.d1Reads.count + rowCount > cutoff) {
    return {
      allowed: false,
      service: "D1 read",
      retryAfter: getSecondsUntilDailyReset(),
    };
  }
  counters.d1Reads.count += rowCount;
  return { allowed: true };
}

export function checkD1Write(rowCount: number = 1): QuotaResult {
  resetDailyIfNeeded(counters.d1Writes);
  const cutoff = Math.floor(D1_FREE.DAILY_ROWS_WRITTEN * SAFETY.D1_CUTOFF_RATIO);
  if (counters.d1Writes.count + rowCount > cutoff) {
    return {
      allowed: false,
      service: "D1 write",
      retryAfter: getSecondsUntilDailyReset(),
    };
  }
  counters.d1Writes.count += rowCount;
  return { allowed: true };
}

// ─── R2 ガード ────────────────────────────────────────

export function checkR2ClassA(): QuotaResult {
  resetMonthlyIfNeeded(counters.r2ClassA);
  const cutoff = Math.floor(R2_FREE.MONTHLY_CLASS_A_OPS * SAFETY.KV_CUTOFF_RATIO);
  if (counters.r2ClassA.count >= cutoff) {
    return {
      allowed: false,
      service: "R2 Class A",
      retryAfter: getSecondsUntilMonthlyReset(),
    };
  }
  counters.r2ClassA.count++;
  return { allowed: true };
}

export function checkR2ClassB(): QuotaResult {
  resetMonthlyIfNeeded(counters.r2ClassB);
  const cutoff = Math.floor(R2_FREE.MONTHLY_CLASS_B_OPS * SAFETY.KV_CUTOFF_RATIO);
  if (counters.r2ClassB.count >= cutoff) {
    return {
      allowed: false,
      service: "R2 Class B",
      retryAfter: getSecondsUntilMonthlyReset(),
    };
  }
  counters.r2ClassB.count++;
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

export function getQuotaStatus() {
  resetDailyIfNeeded(counters.kvReads);
  resetDailyIfNeeded(counters.kvWrites);
  resetDailyIfNeeded(counters.d1Reads);
  resetDailyIfNeeded(counters.d1Writes);
  resetMonthlyIfNeeded(counters.r2ClassA);
  resetMonthlyIfNeeded(counters.r2ClassB);

  return {
    kv: {
      reads: { used: counters.kvReads.count, limit: KV_FREE.DAILY_READS },
      writes: { used: counters.kvWrites.count, limit: KV_FREE.DAILY_WRITES },
    },
    d1: {
      rows_read: { used: counters.d1Reads.count, limit: D1_FREE.DAILY_ROWS_READ },
      rows_written: { used: counters.d1Writes.count, limit: D1_FREE.DAILY_ROWS_WRITTEN },
    },
    r2: {
      class_a: { used: counters.r2ClassA.count, limit: R2_FREE.MONTHLY_CLASS_A_OPS },
      class_b: { used: counters.r2ClassB.count, limit: R2_FREE.MONTHLY_CLASS_B_OPS },
    },
  };
}
