/**
 * 品目別市場ステータス（サーバー側マスター）
 *
 * `src/client/lib/resourceStatus.ts` と同一の内容を worker 側で保持。
 * クライアント側が UI 用（STATUS_LABEL / STATUS_COLOR 等）を持つのに対し、
 * こちらはデータのみ保持し /api/resource-status で公開する。
 *
 * 更新時は両ファイルを必ず同期させる（将来 shared/ 移動を検討）。
 *
 * Phase 24: ops の market_status トリガーがこのAPIをポーリング→KV
 * スナップショットと比較し、ステータス遷移を自動検出・Discord通知。
 */

import type { ScenarioId } from "../shared/scenarios";

export type ResourceStatus = "normal" | "tight" | "allotted" | "restricted";

export type ResourceKey = "水" | "食料" | "燃料" | "電力" | "医療・衛生";

export interface ResourceStatusEntry {
  status: ResourceStatus;
  note: string;
  since?: string;
  source?: string;
}

export const RESOURCE_KEYS: ResourceKey[] = ["水", "食料", "燃料", "電力", "医療・衛生"];

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

export const RESOURCE_STATUS_UPDATED_AT = "2026-04-18";
