/**
 * サーバーサイド計算ロジック
 *
 * D1データ優先、フォールバックとして静的JSONを使用。
 */

import type {
  AlertLevel,
  ResourceCountdown,
  RegionCollapse,
  TankerInfo,
  FoodProduct,
  FoodDepletionParams,
  FamilyInputs,
  FamilySurvivalScore,
  SurvivalRank,
} from "../../shared/types";
import { type ScenarioId, SCENARIOS } from "../../shared/scenarios";
import type { ReservesRow, ConsumptionRow, RegionRow, ElectricityDemandRow } from "../db";

// 静的JSON（D1フォールバック用）
import staticReserves from "../../client/data/reserves.json";
import staticConsumption from "../../client/data/consumption.json";
import staticRegionsData from "../../client/data/regions.json";
import staticTankerData from "../../client/data/tankers.json";
import staticFoodData from "../../client/data/foodSupply.json";

// ─── データ取得ヘルパー ─────────────────────────────────

interface ReservesData {
  oilTotalReserve_kL: number;
  oilHormuzRate: number;
  lngInventory_t: number;
  lngHormuzRate: number;
  thermalShareRate: number;
}

interface ConsumptionData {
  oilDailyConsumption_kL: number;
  lngDailyConsumption_t: number;
}

export function mapReservesRow(row: ReservesRow): ReservesData {
  return {
    oilTotalReserve_kL: row.oil_total_kL,
    oilHormuzRate: row.oil_hormuz_rate,
    lngInventory_t: row.lng_inventory_t,
    lngHormuzRate: row.lng_hormuz_rate,
    thermalShareRate: row.thermal_share,
  };
}

export function mapConsumptionRow(row: ConsumptionRow): ConsumptionData {
  return {
    oilDailyConsumption_kL: row.oil_daily_kL,
    lngDailyConsumption_t: row.lng_daily_t,
  };
}

function getStaticReserves(): ReservesData {
  return {
    oilTotalReserve_kL: staticReserves.oil.totalReserve_kL,
    oilHormuzRate: staticReserves.oil.hormuzDependencyRate,
    lngInventory_t: staticReserves.lng.inventory_t,
    lngHormuzRate: staticReserves.lng.hormuzDependencyRate,
    thermalShareRate: staticReserves.electricity.thermalShareRate,
  };
}

function getStaticConsumption(): ConsumptionData {
  return {
    oilDailyConsumption_kL: staticConsumption.oil.dailyConsumption_kL,
    lngDailyConsumption_t: staticConsumption.lng.dailyConsumption_t,
  };
}

// ─── 閾値判定 ────────────────────────────────────────────

function getAlertLevel(days: number): AlertLevel {
  if (days <= 30) return "critical";
  if (days <= 60) return "warning";
  if (days <= 90) return "caution";
  return "safe";
}

function getSurvivalRank(days: number): SurvivalRank {
  if (days >= 60) return "S";
  if (days >= 30) return "A";
  if (days >= 14) return "B";
  if (days >= 7) return "C";
  if (days >= 3) return "D";
  return "F";
}

// ─── カウントダウン ──────────────────────────────────────

function calcOilDays(r: ReservesData, c: ConsumptionData, scenarioId: ScenarioId): number {
  const s = SCENARIOS[scenarioId];
  const effectiveConsumption = c.oilDailyConsumption_kL
    * s.oilBlockadeRate * (1 - s.demandReductionRate);
  return effectiveConsumption > 0
    ? r.oilTotalReserve_kL / effectiveConsumption
    : Infinity;
}

function calcLngDays(r: ReservesData, c: ConsumptionData, scenarioId: ScenarioId): number {
  const s = SCENARIOS[scenarioId];
  const effectiveConsumption = c.lngDailyConsumption_t
    * s.lngBlockadeRate * (1 - s.demandReductionRate);
  return effectiveConsumption > 0
    ? r.lngInventory_t / effectiveConsumption
    : Infinity;
}

function calcPowerDays(r: ReservesData, c: ConsumptionData, scenarioId: ScenarioId): number {
  return calcLngDays(r, c, scenarioId) * r.thermalShareRate;
}

export function getAllCountdowns(
  reservesData: ReservesData | null,
  consumptionData: ConsumptionData | null,
  scenarioId: ScenarioId = "realistic",
): ResourceCountdown[] {
  const r = reservesData ?? getStaticReserves();
  const c = consumptionData ?? getStaticConsumption();

  const oilDays = calcOilDays(r, c, scenarioId);
  const lngDays = calcLngDays(r, c, scenarioId);
  const powerDays = calcPowerDays(r, c, scenarioId);

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

export function calcTankerArrivals(): TankerInfo[] {
  return [...staticTankerData.vessels]
    .sort((a, b) => a.eta_days - b.eta_days);
}

// ─── 食品崩壊 ──────────────────────────────────────────

export function calcFoodDepletion(
  reservesData: ReservesData | null,
  consumptionData: ConsumptionData | null,
  params: FoodDepletionParams | null,
  scenarioId: ScenarioId = "realistic",
): FoodProduct[] {
  const r = reservesData ?? getStaticReserves();
  const c = consumptionData ?? getStaticConsumption();

  const oilDays = params?.oilDays ?? calcOilDays(r, c, scenarioId);
  const powerDays = params?.powerDays ?? calcPowerDays(r, c, scenarioId);

  return staticFoodData.products.map((product) => {
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

const WATER_PER_PERSON_PER_DAY = 3;
const GAS_CANISTER_MINUTES = 60;
const GAS_USAGE_MINUTES_PER_PERSON = 30;
const POWER_WH_PER_PERSON_PER_DAY = 50;

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

// ─── エリア別崩壊 ──────────────────────────────────────

export function calcRegionCollapse(
  reservesData: ReservesData | null,
  consumptionData: ConsumptionData | null,
  apiRegions: RegionRow[] | null,
  electricityData: ElectricityDemandRow[] | null,
  scenarioId: ScenarioId = "realistic",
): RegionCollapse[] {
  const r = reservesData ?? getStaticReserves();
  const c = consumptionData ?? getStaticConsumption();
  const s = SCENARIOS[scenarioId];
  const dailyOil = c.oilDailyConsumption_kL * (1 - s.demandReductionRate);
  const dailyLng = c.lngDailyConsumption_t * (1 - s.demandReductionRate);

  // 電力実測データマップ
  const electricityMap = new Map<string, ElectricityDemandRow>();
  if (electricityData) {
    for (const row of electricityData) {
      electricityMap.set(row.area_id, row);
    }
  }

  // D1リージョンデータがある場合
  if (apiRegions && apiRegions.length > 0) {
    return apiRegions
      .map((region) => {
        const oilDepletion =
          (r.oilTotalReserve_kL * region.oil_share) /
          (dailyOil * region.power_demand_share * s.oilBlockadeRate) /
          region.winter_factor /
          region.isolation_risk;

        const lngDepletion =
          (r.lngInventory_t * region.lng_share) /
          (dailyLng * region.power_demand_share * s.lngBlockadeRate) /
          region.winter_factor /
          region.isolation_risk;

        const liveData = electricityMap.get(region.id);
        let thermalShare = r.thermalShareRate;
        if (liveData?.thermal_mw && liveData.peak_demand_mw > 0) {
          thermalShare = liveData.thermal_mw / liveData.peak_demand_mw;
        }

        const powerCollapse = lngDepletion * thermalShare;
        const collapseDays = Math.min(oilDepletion, lngDepletion, powerCollapse);

        return {
          id: region.id,
          name: region.name,
          collapseDays,
          oilDepletionDays: oilDepletion,
          lngDepletionDays: lngDepletion,
          powerCollapseDays: powerCollapse,
          vulnerabilityRank: region.vulnerability_rank,
          population: region.population,
          foodSelfSufficiency: region.food_self_sufficiency,
          note: region.note,
          hasLiveData: electricityMap.has(region.id),
        };
      })
      .sort((a, b) => a.collapseDays - b.collapseDays);
  }

  // フォールバック: 静的JSONからの計算
  return staticRegionsData
    .map((region) => {
      const oilDemand_kL = dailyOil * region.powerDemandShare * s.oilBlockadeRate;
      const refineryCapacity_kL = region.refineryCapacity_bpd > 0
        ? region.refineryCapacity_bpd * 0.159
        : 0;
      const effectiveOilConsumption = refineryCapacity_kL > 0
        ? Math.min(oilDemand_kL, refineryCapacity_kL)
        : oilDemand_kL;

      const oilDepletion = (r.oilTotalReserve_kL * region.oilShare) / effectiveOilConsumption
        * (1 / region.winterFactor) * (1 / region.isolationRisk);

      const lngDemand_t = dailyLng * region.powerDemandShare * s.lngBlockadeRate;
      const lngCapacity_t = region.lngRegasification_tpd > 0
        ? region.lngRegasification_tpd
        : 0;
      const effectiveLngConsumption = lngCapacity_t > 0
        ? Math.min(lngDemand_t, lngCapacity_t)
        : lngDemand_t;

      const lngDepletion = (r.lngInventory_t * region.lngShare) / effectiveLngConsumption
        * (1 / region.winterFactor) * (1 / region.isolationRisk);

      const powerCollapse = lngDepletion * r.thermalShareRate;
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
    })
    .sort((a, b) => a.collapseDays - b.collapseDays);
}
