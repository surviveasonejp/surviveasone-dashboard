// ─── 共通型定義（クライアント・ワーカー共有） ──────────

export type AlertLevel = "critical" | "warning" | "caution" | "safe";
export type SurvivalRank = "S" | "A" | "B" | "C" | "D" | "F";
export type ThresholdType = "price_spike" | "rationing" | "distribution" | "stop";

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
}

export interface TankerInfo {
  id: string;
  name: string;
  type: string;
  departure: string;
  destination: string;
  distanceToJapan_nm: number;
  speed_knots: number;
  eta_days: number;
  cargo_t: number;
  cargoType: string;
  status: string;
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

export interface FamilyInputs {
  members: number;
  waterLiters: number;
  foodDays: number;
  gasCanisterCount: number;
  batteryWh: number;
  cashYen: number;
}

export interface FamilySurvivalScore {
  totalDays: number;
  rank: SurvivalRank;
  waterDays: number;
  foodDays: number;
  energyDays: number;
  powerDays: number;
  bottleneck: string;
}

// ─── フロー型シミュレーション ─────────────────────────

export interface FlowState {
  day: number;
  oilStock_kL: number;
  lngStock_t: number;
  oilSupply_kL: number;
  lngSupply_t: number;
}

export interface ThresholdEvent {
  day: number;
  type: ThresholdType;
  resource: "oil" | "lng" | "power";
  stockPercent: number;
  label: string;
}

export interface FlowSimulationResult {
  timeline: FlowState[];
  oilDepletionDay: number;
  lngDepletionDay: number;
  powerCollapseDay: number;
  thresholds: ThresholdEvent[];
}
