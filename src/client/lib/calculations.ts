import reserves from "../data/reserves.json";
import consumption from "../data/consumption.json";
import regionsData from "../data/regions.json";
import tankerData from "../data/tankers.json";
import foodData from "../data/foodSupply.json";

export type AlertLevel = "critical" | "warning" | "caution" | "safe";

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

/** 封鎖時の石油実効残存日数 */
export function calcOilDays(): number {
  return reserves.oil.totalReserve_kL / (consumption.oil.dailyConsumption_kL * reserves.oil.hormuzDependencyRate);
}

/** 封鎖時のLNG実効残存日数 */
export function calcLngDays(): number {
  return reserves.lng.inventory_t / (consumption.lng.dailyConsumption_t * reserves.lng.hormuzDependencyRate);
}

/** 電力崩壊日数（LNGがボトルネック） */
export function calcPowerDays(): number {
  return calcLngDays() * reserves.electricity.thermalShareRate;
}

export function getAlertLevel(days: number): AlertLevel {
  if (days <= 30) return "critical";
  if (days <= 60) return "warning";
  if (days <= 90) return "caution";
  return "safe";
}

export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case "critical": return "#ff1744";
    case "warning": return "#ff9100";
    case "caution": return "#ffea00";
    case "safe": return "#00e676";
  }
}

export function getAllCountdowns(): ResourceCountdown[] {
  const oilDays = calcOilDays();
  const lngDays = calcLngDays();
  const powerDays = calcPowerDays();

  return [
    {
      label: "石油備蓄",
      totalDays: oilDays,
      totalSeconds: oilDays * 86400,
      alertLevel: getAlertLevel(oilDays),
    },
    {
      label: "LNG在庫",
      totalDays: lngDays,
      totalSeconds: lngDays * 86400,
      alertLevel: getAlertLevel(lngDays),
    },
    {
      label: "電力供給",
      totalDays: powerDays,
      totalSeconds: powerDays * 86400,
      alertLevel: getAlertLevel(powerDays),
    },
  ];
}

// ─── タンカー ──────────────────────────────────────────

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

export function calcTankerArrivals(): TankerInfo[] {
  return [...tankerData.vessels]
    .sort((a, b) => a.eta_days - b.eta_days);
}

export function getLastTankerEta(): number {
  const vessels = calcTankerArrivals();
  return vessels[vessels.length - 1]?.eta_days ?? 0;
}

// ─── 食品崩壊 ──────────────────────────────────────────

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

export function calcFoodDepletion(params?: FoodDepletionParams): FoodProduct[] {
  const oilDays = params?.oilDays ?? calcOilDays();
  const powerDays = params?.powerDays ?? calcPowerDays();

  return foodData.products.map((product) => {
    // factor = 依存度(0-1)。高いほど依存 = (1-factor)が小さい = 早く崩壊
    // collapse = resourceDays × (1 - factor)
    const dieselCollapse = product.dieselFactor > 0
      ? oilDays * (1 - product.dieselFactor)
      : Infinity;
    const napthaCollapse = product.napthaFactor > 0
      ? oilDays * (1 - product.napthaFactor)
      : Infinity;
    const powerCollapse = product.powerFactor > 0
      ? powerDays * (1 - product.powerFactor)
      : Infinity;

    const supplyChainCollapse = Math.min(dieselCollapse, napthaCollapse, powerCollapse);
    // 供給途絶後も棚の在庫（賞味期限）分だけ延命
    const collapseDays = supplyChainCollapse + product.shelfLifeDays;

    return {
      id: product.id,
      name: product.name,
      icon: product.icon,
      collapseDays,
      shelfLifeDays: product.shelfLifeDays,
      collapseReason: product.collapseReason,
      note: product.note,
      dieselFactor: product.dieselFactor,
      napthaFactor: product.napthaFactor,
      powerFactor: product.powerFactor,
    };
  }).sort((a, b) => a.collapseDays - b.collapseDays);
}

// ─── 家庭サバイバル ────────────────────────────────────

export interface FamilyInputs {
  members: number;
  waterLiters: number;
  foodDays: number;
  gasCanisterCount: number;
  batteryWh: number;
  cashYen: number;
}

export type SurvivalRank = "S" | "A" | "B" | "C" | "D" | "F";

export interface FamilySurvivalScore {
  totalDays: number;
  rank: SurvivalRank;
  waterDays: number;
  foodDays: number;
  energyDays: number;
  powerDays: number;
  bottleneck: string;
}

const WATER_PER_PERSON_PER_DAY = 3; // リットル
const GAS_CANISTER_MINUTES = 60; // 1本あたり
const GAS_USAGE_MINUTES_PER_PERSON = 30; // 調理用 1人/日
const POWER_WH_PER_PERSON_PER_DAY = 50; // 最低限

export function calcFamilySurvival(inputs: FamilyInputs): FamilySurvivalScore {
  const { members, waterLiters, foodDays, gasCanisterCount, batteryWh } = inputs;
  const m = Math.max(members, 1);

  const waterDays = waterLiters / (m * WATER_PER_PERSON_PER_DAY);
  const energyDays = (gasCanisterCount * GAS_CANISTER_MINUTES) / (m * GAS_USAGE_MINUTES_PER_PERSON);
  const powerDays = batteryWh / (m * POWER_WH_PER_PERSON_PER_DAY);

  const totalDays = Math.min(waterDays, foodDays, energyDays, powerDays);

  const limits = [
    { days: waterDays, label: "水" },
    { days: foodDays, label: "食料" },
    { days: energyDays, label: "燃料" },
    { days: powerDays, label: "電力" },
  ];
  const bottleneck = limits.sort((a, b) => a.days - b.days)[0]?.label ?? "不明";

  return {
    totalDays,
    rank: getSurvivalRank(totalDays),
    waterDays,
    foodDays,
    energyDays,
    powerDays,
    bottleneck,
  };
}

export function getSurvivalRank(days: number): SurvivalRank {
  if (days >= 60) return "S";
  if (days >= 30) return "A";
  if (days >= 14) return "B";
  if (days >= 7) return "C";
  if (days >= 3) return "D";
  return "F";
}

export function getSurvivalRankColor(rank: SurvivalRank): string {
  switch (rank) {
    case "S": return "#00e676";
    case "A": return "#66ffa6";
    case "B": return "#ffea00";
    case "C": return "#ff9100";
    case "D": return "#ff5252";
    case "F": return "#ff1744";
  }
}

export function getSurvivalRankLabel(rank: SurvivalRank): string {
  switch (rank) {
    case "S": return "十分な備え";
    case "A": return "良好";
    case "B": return "最低限";
    case "C": return "要準備";
    case "D": return "危機的";
    case "F": return "生存困難";
  }
}

/** エリア別崩壊日数を計算 */
export function calcRegionCollapse(): RegionCollapse[] {
  const totalOil = reserves.oil.totalReserve_kL;
  const totalLng = reserves.lng.inventory_t;
  const dailyOil = consumption.oil.dailyConsumption_kL;
  const dailyLng = consumption.lng.dailyConsumption_t;
  const oilHormuz = reserves.oil.hormuzDependencyRate;
  const lngHormuz = reserves.lng.hormuzDependencyRate;

  return regionsData.map((region) => {
    const oilDepletion = (totalOil * region.oilShare) / (dailyOil * region.powerDemandShare * oilHormuz)
      * (1 / region.winterFactor) * (1 / region.isolationRisk);

    const lngDepletion = (totalLng * region.lngShare) / (dailyLng * region.powerDemandShare * lngHormuz)
      * (1 / region.winterFactor) * (1 / region.isolationRisk);

    const powerCollapse = lngDepletion * reserves.electricity.thermalShareRate;

    const collapseDays = Math.min(oilDepletion, lngDepletion, powerCollapse);

    return {
      id: region.id,
      name: region.name,
      collapseDays,
      oilDepletionDays: oilDepletion,
      lngDepletionDays: lngDepletion,
      powerCollapseDays: powerCollapse,
      vulnerabilityRank: region.vulnerabilityRank,
      population: region.population,
      foodSelfSufficiency: region.foodSelfSufficiency,
      note: region.note,
      hasLiveData: false,
    };
  }).sort((a, b) => a.collapseDays - b.collapseDays);
}
