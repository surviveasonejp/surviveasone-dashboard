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

export interface FamilyInputs {
  members: number;
  waterLiters: number;
  foodDays: number;
  gasCanisterCount: number;
  batteryWh: number;
  solarWatts: number;
  hasMedicalDevice: boolean;
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

export interface FlowSimulationResult {
  timeline: FlowState[];
  oilDepletionDay: number;
  lngDepletionDay: number;
  powerCollapseDay: number;
  thresholds: ThresholdEvent[];
}
