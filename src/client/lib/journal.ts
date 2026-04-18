/**
 * journal.ts — 「私の想定」と意思決定ログの型・定数（Phase 20-C）
 *
 * クライアント側 localStorage に保存する。サーバー連携は無し。
 * 設計者本人のダッシュボード用途を主目的とする。
 */

import { type ScenarioId } from "../../shared/scenarios";

export const STORAGE_KEYS = {
  hypothesis: "sao:hypothesis:v1",
  decisionLog: "sao:decision_log:v1",
} as const;

/** 「私の想定」— 標準シナリオと同じ3パラメータをユーザー指定で持つ */
export interface UserHypothesis {
  oilBlockadeRate: number;     // 0〜1
  lngBlockadeRate: number;     // 0〜1
  demandReductionRate: number; // -0.2〜0.3 想定（負=パニック増、正=節約）
  label: string;               // 自由記述（例: "停戦失敗・長期化を想定"）
  updatedAt: string;           // ISO 8601
}

export const DEFAULT_HYPOTHESIS: UserHypothesis = {
  oilBlockadeRate: 0.94,
  lngBlockadeRate: 0.063,
  demandReductionRate: 0.05,
  label: "（未設定）",
  updatedAt: "",
};

/** 意思決定ログエントリ */
export interface DecisionLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  title: string;
  rationale: string;
  /** 判断時の仮説スナップショット（自動記録） */
  hypothesis: {
    oilBlockadeRate: number;
    lngBlockadeRate: number;
    demandReductionRate: number;
    label: string;
  };
  /** 参照していた標準シナリオ（任意） */
  scenarioRef?: ScenarioId | "custom";
}

/** UUID生成（crypto.randomUUID() ラッパー、フォールバック付き） */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** ISO 8601 タイムスタンプ */
export function nowIso(): string {
  return new Date().toISOString();
}
