/**
 * Cloudflare 無料枠の制限値定義
 * https://developers.cloudflare.com/workers/platform/pricing/
 *
 * 全制限値をここに集約し、コード全体で参照する。
 * 各サービスの日次/月次リセットタイミングも記載。
 */

// ─── Workers ───────────────────────────────────────────
// リセット: 毎日 UTC 00:00
export const WORKERS_FREE = {
  /** 日次リクエスト上限（静的アセットは対象外） */
  DAILY_REQUESTS: 100_000,
  /** 1リクエストあたりのCPU時間上限 (ms) */
  CPU_MS_PER_REQUEST: 10,
  /** 1リクエストあたりの外部サブリクエスト上限 */
  SUBREQUESTS_EXTERNAL: 50,
  /** 1リクエストあたりのCFサービス向けサブリクエスト上限 */
  SUBREQUESTS_CF: 1_000,
} as const;

// ─── Workers KV ────────────────────────────────────────
// リセット: 毎日 UTC 00:00
export const KV_FREE = {
  DAILY_READS: 100_000,
  DAILY_WRITES: 1_000,
  DAILY_LISTS: 1_000,
  DAILY_DELETES: 1_000,
  MAX_STORAGE_BYTES: 1 * 1024 * 1024 * 1024, // 1 GB
} as const;

// ─── D1 ────────────────────────────────────────────────
// リセット: 毎日 UTC 00:00
export const D1_FREE = {
  DAILY_ROWS_READ: 5_000_000,
  DAILY_ROWS_WRITTEN: 100_000,
  MAX_STORAGE_BYTES: 5 * 1024 * 1024 * 1024, // 5 GB
  MAX_DB_SIZE_BYTES: 10 * 1024 * 1024 * 1024, // 10 GB per DB
} as const;

// ─── R2 ────────────────────────────────────────────────
// リセット: 毎月
export const R2_FREE = {
  MONTHLY_CLASS_A_OPS: 1_000_000, // PUT, POST, LIST等
  MONTHLY_CLASS_B_OPS: 10_000_000, // GET, HEAD等
  MAX_STORAGE_BYTES: 10 * 1024 * 1024 * 1024, // 10 GB
} as const;

// ─── Cron Triggers ─────────────────────────────────────
export const CRON_FREE = {
  MAX_TRIGGERS: 5,
} as const;

// ─── 安全マージン ──────────────────────────────────────
// 無料枠を「絶対に」超えないための安全閾値
export const SAFETY = {
  /** API制限開始: 日次上限の70%（保守的） */
  API_THROTTLE_RATIO: 0.7,
  /** API完全停止: 日次上限の85% */
  API_CUTOFF_RATIO: 0.85,

  /** KV操作警告: 日次上限の70% */
  KV_WARN_RATIO: 0.7,
  /** KV操作停止: 日次上限の85% */
  KV_CUTOFF_RATIO: 0.85,

  /** D1操作警告: 日次上限の70% */
  D1_WARN_RATIO: 0.7,
  /** D1操作停止: 日次上限の85% */
  D1_CUTOFF_RATIO: 0.85,

  /** Per-IP: 1 IPあたりの日次API上限 */
  PER_IP_DAILY_API: 1_000,
  /** Per-IP: 1分あたりのAPI上限 */
  PER_IP_PER_MINUTE: 30,
} as const;

// ─── ヘルパー ──────────────────────────────────────────

/** UTC日のキー（日次リセット用） */
export function getDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** UTC日リセットまでの秒数 */
export function getSecondsUntilDailyReset(): number {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCDate(reset.getUTCDate() + 1);
  reset.setUTCHours(0, 0, 0, 0);
  return Math.ceil((reset.getTime() - now.getTime()) / 1000);
}

/** UTC月リセットまでの秒数 */
export function getSecondsUntilMonthlyReset(): number {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.ceil((reset.getTime() - now.getTime()) / 1000);
}
