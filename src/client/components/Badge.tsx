import { type FC, type ReactNode } from "react";

/**
 * Phase 18-A-3 (1): 共通バッジコンポーネント。
 *
 * 既存の `text-xs font-mono px-1.5 py-0.5 rounded bg-XXX/15 text-XXX border border-XXX/30`
 * 系の LIVE / AIS / AUTO / IN PROGRESS / HTTP メソッドなどを統一する。
 *
 * 重要: Tailwind v4 JIT の検出漏れを避けるため、クラス文字列は完全形で定義する。
 * 動的に `bg-${tone}-soft/15` のような構成はしない。
 */

export type BadgeTone =
  | "success"
  | "warning"
  | "primary"
  | "info"
  | "teal"
  | "neutral"
  | "x-brand";

export type BadgeSize = "xs" | "sm";

interface BadgeProps {
  tone: BadgeTone;
  /** デフォルト: "xs" */
  size?: BadgeSize;
  /** デフォルト: true（border 付き） */
  outlined?: boolean;
  /** 追加クラス（text-[8px] 等のサイズ微調整・shrink-0・margin 等） */
  className?: string;
  children: ReactNode;
}

/** outlined=true の時の完全クラス文字列（bg/text/border すべて含む） */
const TONE_OUTLINED: Record<BadgeTone, string> = {
  success: "bg-success-soft/15 text-success-soft border border-success-soft/30",
  warning: "bg-warning-soft/15 text-warning-soft border border-warning-soft/30",
  primary: "bg-primary-soft/15 text-primary-soft border border-primary-soft/30",
  info: "bg-info/15 text-info border border-info/30",
  teal: "bg-teal/15 text-teal border border-teal/30",
  neutral: "bg-neutral-500/15 text-neutral-500 border border-neutral-500/30",
  "x-brand": "bg-x-brand/15 text-x-brand border border-x-brand/30",
};

/** outlined=false の時の完全クラス文字列（border なし） */
const TONE_FILLED: Record<BadgeTone, string> = {
  success: "bg-success-soft/15 text-success-soft",
  warning: "bg-warning-soft/15 text-warning-soft",
  primary: "bg-primary-soft/15 text-primary-soft",
  info: "bg-info/15 text-info",
  teal: "bg-teal/15 text-teal",
  neutral: "bg-neutral-500/15 text-neutral-500",
  "x-brand": "bg-x-brand/15 text-x-brand",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: "text-xs font-mono px-1.5 py-0.5 rounded",
  sm: "text-sm font-mono px-2 py-0.5 rounded",
};

export const Badge: FC<BadgeProps> = ({
  tone,
  size = "xs",
  outlined = true,
  className,
  children,
}) => {
  const toneClass = outlined ? TONE_OUTLINED[tone] : TONE_FILLED[tone];
  const sizeClass = SIZE_CLASSES[size];
  const merged = [sizeClass, toneClass, className].filter(Boolean).join(" ");
  return <span className={merged}>{children}</span>;
};
