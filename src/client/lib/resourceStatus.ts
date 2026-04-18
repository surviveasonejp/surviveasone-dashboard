/**
 * 品目別の現在ステータスと供給制約モードのパラメータ（2026-04-18 基準）
 *
 * 供給制約モード時に内訳バー等で表示する。
 * 出典は realEvents.json の記載イベント。新しい動向が記録されたら手動で更新。
 *
 * ステータス階梯:
 * - normal:     平常供給
 * - tight:      価格高騰・流通偏在（供給は継続）
 * - allotted:   数量制限・1回N個まで等の割当制
 * - restricted: 受注停止・メーカー制限等の構造的制約
 */

import type { ScenarioId } from "../../shared/scenarios";

export type ResourceStatus = "normal" | "tight" | "allotted" | "restricted";

export type ResourceKey = "水" | "食料" | "燃料" | "電力" | "医療・衛生";

export interface ResourceStatusEntry {
  status: ResourceStatus;
  note: string;
  /** ステータス変化の起点（YYYY-MM-DD） */
  since?: string;
  /** 出典 */
  source?: string;
}

export const STATUS_LABEL: Record<ResourceStatus, string> = {
  normal: "平常",
  tight: "価格上昇",
  allotted: "割当",
  restricted: "制限",
};

export const STATUS_COLOR: Record<ResourceStatus, { text: string; bg: string; border: string }> = {
  normal: { text: "#16a34a", bg: "#16a34a15", border: "#16a34a40" },
  tight: { text: "#2563eb", bg: "#2563eb15", border: "#2563eb40" },
  allotted: { text: "#d97706", bg: "#d9770615", border: "#d9770640" },
  restricted: { text: "#dc2626", bg: "#dc262615", border: "#dc262640" },
};

/**
 * シナリオ別の外部供給継続率（0-1）。
 * realistic は 2026-04 時点の実態、他は scenarios.ts の oilBlockadeRate/demandReductionRate から推定。
 */
export const SUPPLY_RATE_BY_SCENARIO: Record<ScenarioId, Record<ResourceKey, number>> = {
  optimistic: {
    水: 0.98,
    食料: 0.90,
    燃料: 0.75,
    電力: 0.95,
    "医療・衛生": 0.70,
  },
  realistic: {
    水: 0.95,
    食料: 0.80,
    燃料: 0.60,
    電力: 0.90,
    "医療・衛生": 0.50,
  },
  pessimistic: {
    水: 0.85,
    食料: 0.55,
    燃料: 0.30,
    電力: 0.70,
    "医療・衛生": 0.25,
  },
  ceasefire: {
    水: 0.97,
    食料: 0.92,
    燃料: 0.80,
    電力: 0.95,
    "医療・衛生": 0.75,
  },
};

/**
 * シナリオ別の品目別ステータス。
 * realistic は realEvents.json の実イベントに基づく。他は供給率から推定。
 */
export const STATUS_BY_SCENARIO: Record<ScenarioId, Record<ResourceKey, ResourceStatusEntry>> = {
  optimistic: {
    水: { status: "normal", note: "IEA協調・需要抑制政策奏功で平常維持" },
    食料: { status: "normal", note: "代替供給確保・物流平常" },
    燃料: { status: "tight", note: "価格上昇はあるが割当なし" },
    電力: { status: "normal", note: "LNG代替調達で安定" },
    "医療・衛生": { status: "tight", note: "一部品目で価格上昇" },
  },
  realistic: {
    水: {
      status: "normal",
      note: "水道供給は電力依存だが原則継続。ホルムズ直接影響なし",
    },
    食料: {
      status: "tight",
      note: "潤滑油起因の流通偏在と価格上昇。供給は継続",
      since: "2026-04-17",
      source: "潤滑油3割増出荷要請",
    },
    燃料: {
      status: "allotted",
      note: "一部ガソリンスタンドで1回20L制限。カセットボンベも需要増",
      since: "2026-03-23",
      source: "物流ネットワーク機能不全・補助金介入継続",
    },
    電力: {
      status: "normal",
      note: "石炭火力運用制限緩和・LNG依存6.3%で安定化",
    },
    "医療・衛生": {
      status: "restricted",
      note: "沢井製薬110品目供給制限・ニトリル手袋受注停止等",
      since: "2026-04-02",
      source: "メーカー→卸→小売の連鎖的受注制限",
    },
  },
  pessimistic: {
    水: { status: "tight", note: "電力制限に連動して水圧低下リスク" },
    食料: { status: "restricted", note: "配給制移行・主食購入制限" },
    燃料: { status: "restricted", note: "GS全国で数量割当・配給制" },
    電力: { status: "allotted", note: "計画停電・使用制限要請" },
    "医療・衛生": { status: "restricted", note: "構造的不足・優先配分制" },
  },
  ceasefire: {
    水: { status: "normal", note: "供給回復" },
    食料: { status: "normal", note: "契約再締結進行・流通正常化" },
    燃料: { status: "tight", note: "保険解除審査継続で価格残存" },
    電力: { status: "normal", note: "供給正常化" },
    "医療・衛生": { status: "tight", note: "パニック買い後の買い控えで在庫回復局面" },
  },
};

/**
 * シナリオ別の小売→実勢価格インフレ係数（補助金OFF時）
 * 2026-04 実測: ガソリン実勢215円/L vs 店頭167.5円/L (+28%) をベースに推定
 */
export const INFLATION_BY_SCENARIO: Record<ScenarioId, { water: number; food: number; gas: number; battery: number; medical: number; overall: number }> = {
  optimistic: { water: 1.05, food: 1.10, gas: 1.15, battery: 1.02, medical: 1.15, overall: 1.10 },
  realistic: { water: 1.10, food: 1.25, gas: 1.30, battery: 1.05, medical: 1.40, overall: 1.25 },
  pessimistic: { water: 1.25, food: 1.60, gas: 1.80, battery: 1.15, medical: 1.90, overall: 1.55 },
  ceasefire: { water: 1.05, food: 1.08, gas: 1.15, battery: 1.02, medical: 1.10, overall: 1.08 },
};

export const RESOURCE_STATUS_UPDATED_AT = "2026-04-18";
