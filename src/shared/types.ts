// ─── 共通型定義（クライアント・ワーカー共有） ──────────

export type AlertLevel = "critical" | "warning" | "caution" | "safe";
export type SurvivalRank = "S" | "A" | "B" | "C" | "D" | "F";
export type ThresholdType = "price_spike" | "rationing" | "distribution" | "stop" | "water_pressure" | "water_cutoff" | "water_sanitation" | "waste_collection" | "waste_incineration" | "logistics_limit" | "logistics_stop";

export interface ResourceCountdown {
  label: string;
  totalDays: number;
  totalSeconds: number;
  alertLevel: AlertLevel;
}

export interface RegionCollapse {
  id: string;
  name: string;
  collapseDays: number;
  oilDepletionDays: number;
  lngDepletionDays: number;
  powerCollapseDays: number;
  vulnerabilityRank: string;
  population: number;
  foodSelfSufficiency: number;
  note: string;
  /** 電力需給の実測データがあるか */
  hasLiveData: boolean;
  /** 連系線融通による延命日数（正=受電側で延命, 0=影響なし） */
  interconnectionBonusDays: number;
  /** 物流崩壊日数（トラック燃料枯渇による配送停止までの日数） */
  logisticsCollapseDays: number;
}

export interface TankerInfo {
  id: string;
  name: string;
  type: string;
  departure: string;
  departurePort: string;
  destination: string;
  destinationPort: string;
  distanceToJapan_nm: number;
  speed_knots: number;
  eta_days: number;
  cargo_t: number;
  cargoType: string;
  status: string;
  /** IMO番号（公開情報で確認済みの場合） */
  imo?: string;
  /** AISで位置追跡可能か（IMO確認済み＝AIS受信可能） */
  aisTracked?: boolean;
}

export interface FoodProduct {
  id: string;
  name: string;
  icon: string;
  collapseDays: number;
  shelfLifeDays: number;
  collapseReason: string;
  note: string;
  dieselFactor: number;
  napthaFactor: number;
  powerFactor: number;
}

export interface FoodDepletionParams {
  oilDays: number;
  powerDays: number;
}

/**
 * 供給余力確認モード
 * - disaster: 突発災害前提（地震・台風）。外部供給ゼロ・公的支援到達までの窓として計算
 * - constraint: 供給制約前提（ホルムズ型）。部分供給継続・価格高騰・配給下での延命日数
 */
export type SurvivalMode = "disaster" | "constraint";

export interface FamilyInputs {
  members: number;
  waterLiters: number;
  foodDays: number;
  gasCanisterCount: number;
  batteryWh: number;
  solarWatts: number;
  hasMedicalDevice: boolean;
  cashYen: number;
  /** 医療・衛生物資の備蓄日数（マスク・消毒薬・処方薬余剰・手袋等） */
  medicalSupplyDays: number;
  mode: SurvivalMode;
}

export interface FamilySurvivalScore {
  totalDays: number;
  rank: SurvivalRank;
  waterDays: number;
  foodDays: number;
  energyDays: number;
  powerDays: number;
  /** 医療・衛生物資の供給余力日数 */
  medicalDays: number;
  bottleneck: string;
}

// ─── フロー型シミュレーション ─────────────────────────

export interface FlowState {
  day: number;
  oilStock_kL: number;
  lngStock_t: number;
  oilSupply_kL: number;
  lngSupply_t: number;
  /** 物流稼働率 0-100%（石油在庫に連動した全国トラック物流の残存能力） */
  logisticsCapacity_pct: number;
}

export interface ThresholdEvent {
  day: number;
  type: ThresholdType;
  resource: "oil" | "lng" | "power" | "water" | "logistics";
  stockPercent: number;
  label: string;
}

export interface PolicyImpact {
  /** 枯渇/崩壊日数の延長（正=改善） */
  oilDaysGain: number;
  lngDaysGain: number;
  powerDaysGain: number;
}

export interface PolicyEffects {
  /** 政策ゼロ時（SPR無し・代替供給無し）のベースライン */
  baseline: { oilDay: number; lngDay: number; powerDay: number };
  /** SPR放出（国家備蓄14日後放出 + 代替供給）の効果 */
  sprRelease: PolicyImpact;
  /** 燃料消費制限-10% の効果 */
  demandCut10pct: PolicyImpact;
  /** 緊急節電-15% の効果 */
  emergencyPower15pct: PolicyImpact;
  /** LNGスポット緊急調達（非ホルムズ）の効果 */
  lngSpot: PolicyImpact;
}

export interface FlowSimulationResult {
  timeline: FlowState[];
  oilDepletionDay: number;
  lngDepletionDay: number;
  powerCollapseDay: number;
  thresholds: ThresholdEvent[];
  /** 政策発動時の改善効果（動的計算値） */
  policyEffects?: PolicyEffects;
  /** 長期化フェーズ区分（Phase 20-A） */
  phaseTimeline?: PhaseInfo[];
}

// ─── 長期化フェーズモデル（Phase 20-A） ────────────────

export type ScenarioPhase = "initial" | "rationing" | "structural" | "recovery";

export interface PhaseInfo {
  phase: ScenarioPhase;
  startDay: number;
  /** 終端日。null = 観測期間終了まで継続 */
  endDay: number | null;
  label: string;
  description: string;
}

// ─── 石化樹形図 ──────────────────────────────────────────

export type PetrochemCategory = "feedstock" | "refinery" | "cracker" | "monomer" | "polymer" | "product" | "end_use";

export interface PetrochemNode {
  id: string;
  label: string;
  category: PetrochemCategory;
  depth: number;
  parent_id: string | null;
  naptha_factor: number | null;
  description: string;
}

export interface PetrochemEdge {
  id: string;
  source_id: string;
  target_id: string;
  flow_label: string | null;
}

export interface PetrochemRiskNode extends PetrochemNode {
  riskLevel: number;    // 0.0〜1.0
  impactDay: number;    // 影響顕在化日数
  riskReason: string;
}

export interface PetrochemTreeResponse {
  nodes: PetrochemNode[];
  edges: PetrochemEdge[];
}

export interface PetrochemRiskResponse {
  nodes: PetrochemRiskNode[];
  scenario: string;
  day: number;
}
