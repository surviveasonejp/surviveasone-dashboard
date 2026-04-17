import { createElement, type FC, type ReactNode } from "react";

/**
 * Phase 18-A-3 (2): 共通セクション見出しコンポーネント。
 *
 * セクション先頭の「モノスペース + tracking + semantic color」見出しを統一する。
 *
 * 例（置換前）:
 *   <div className="font-mono text-xs tracking-widest text-success-soft">SUPPLY BUFFER</div>
 *   <h2 className="font-mono text-sm tracking-wider text-neutral-400">なぜホルムズ海峡か</h2>
 *
 * 例（置換後）:
 *   <SectionHeading tone="success" tracking="widest">SUPPLY BUFFER</SectionHeading>
 *   <SectionHeading as="h2" tone="neutral-muted" size="sm">なぜホルムズ海峡か</SectionHeading>
 *
 * 重要: Tailwind v4 JIT の検出漏れを避けるため、クラス文字列は完全形で map に保持する。
 * 動的に `text-${tone}` のような構成はしない。
 *
 * レンダリング要素は `as` で切替可能（デフォルト div）。既存の <h2>/<h3> のセマンティクスを
 * 保持したまま置換できるように、as="h2" / as="h3" を指定する。
 */

export type SectionHeadingTone =
  | "success"
  | "warning"
  | "primary"
  | "info"
  | "teal"
  | "neutral"
  | "neutral-muted"
  | "text-muted";

export type SectionHeadingSize = "xs" | "sm";
export type SectionHeadingTracking = "wider" | "widest";
export type SectionHeadingAlign = "left" | "center";
export type SectionHeadingAs = "div" | "h2" | "h3" | "h4";

interface SectionHeadingProps {
  /** レンダリングする要素。デフォルト: "div" */
  as?: SectionHeadingAs;
  /** デフォルト: "neutral" */
  tone?: SectionHeadingTone;
  /** デフォルト: "xs" */
  size?: SectionHeadingSize;
  /** デフォルト: "widest" */
  tracking?: SectionHeadingTracking;
  /** デフォルト: "left" */
  align?: SectionHeadingAlign;
  /** mb-2 / mb-4 等の動的調整用 */
  className?: string;
  children: ReactNode;
}

const TONE_CLASSES: Record<SectionHeadingTone, string> = {
  success: "text-success-soft",
  warning: "text-warning-soft",
  primary: "text-primary-soft",
  info: "text-info",
  teal: "text-teal",
  neutral: "text-neutral-500",
  "neutral-muted": "text-neutral-400",
  "text-muted": "text-text-muted",
};

const SIZE_CLASSES: Record<SectionHeadingSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
};

const TRACKING_CLASSES: Record<SectionHeadingTracking, string> = {
  wider: "tracking-wider",
  widest: "tracking-widest",
};

const ALIGN_CLASSES: Record<SectionHeadingAlign, string> = {
  left: "",
  center: "text-center",
};

export const SectionHeading: FC<SectionHeadingProps> = ({
  as = "div",
  tone = "neutral",
  size = "xs",
  tracking = "widest",
  align = "left",
  className,
  children,
}) => {
  const merged = [
    "font-mono",
    SIZE_CLASSES[size],
    TRACKING_CLASSES[tracking],
    TONE_CLASSES[tone],
    ALIGN_CLASSES[align],
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return createElement(as, { className: merged }, children);
};
