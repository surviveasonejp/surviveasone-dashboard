/**
 * 品目別の現在ステータス（2026-04-18 基準）
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

export type ResourceStatus = "normal" | "tight" | "allotted" | "restricted";

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

/** ライトモード用のバッジ色（CSS変数対応は呼び出し側） */
export const STATUS_COLOR: Record<ResourceStatus, { text: string; bg: string; border: string }> = {
  normal: { text: "#16a34a", bg: "#16a34a15", border: "#16a34a40" },
  tight: { text: "#2563eb", bg: "#2563eb15", border: "#2563eb40" },
  allotted: { text: "#d97706", bg: "#d9770615", border: "#d9770640" },
  restricted: { text: "#dc2626", bg: "#dc262615", border: "#dc262640" },
};

/**
 * リソース別の現在ステータス。
 * FamilyMeter の breakdowns の label キーと一致させる。
 */
export const RESOURCE_STATUS: Record<string, ResourceStatusEntry> = {
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
};

export const RESOURCE_STATUS_UPDATED_AT = "2026-04-18";
