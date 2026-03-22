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

// 静的JSON（D1フォールバック用）— worker/data/ の実データを使用
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";
import staticRegionsData from "../data/regions.json";
import staticTankerData from "../data/tankers.json";
import staticFoodData from "../data/foodSupply.json";
import staticInterconnections from "../data/interconnections.json";

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
  const NATIONAL_PEAK_MW_D1 = 160000;
  const NUCLEAR_UTILIZATION_D1 = 0.80;
  // 静的データから原子力容量を参照（D1にまだカラムがないため）
  const nuclearMap = new Map<string, number>();
  for (const sr of staticRegionsData) {
    nuclearMap.set(sr.id, sr.nuclearCapacity_MW ?? 0);
  }

  if (apiRegions && apiRegions.length > 0) {
    const results = apiRegions
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

        // 原子力補正
        const regionDemand_MW = region.power_demand_share * NATIONAL_PEAK_MW_D1;
        const nuclearOutput_MW = (nuclearMap.get(region.id) ?? 0) * NUCLEAR_UTILIZATION_D1;
        const nuclearCoverage = regionDemand_MW > 0
          ? Math.min(nuclearOutput_MW / regionDemand_MW, 0.7)
          : 0;
        thermalShare = thermalShare * (1 - nuclearCoverage);

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
          interconnectionBonusDays: 0,
        };
      });
    return applyInterconnectionBonus(results);
  }

  // フォールバック: 静的JSONからの計算
  const NATIONAL_PEAK_MW = 160000; // 全国ピーク需要 約1.6億kW
  const NUCLEAR_UTILIZATION = 0.80; // 原発設備利用率

  const results = staticRegionsData
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

      // 原子力による火力依存率の地域別補正
      // 原発がある地域は火力依存が下がり、LNG枯渇後も原子力分だけ電力が残る
      const regionDemand_MW = region.powerDemandShare * NATIONAL_PEAK_MW;
      const nuclearOutput_MW = (region.nuclearCapacity_MW ?? 0) * NUCLEAR_UTILIZATION;
      const nuclearCoverageRate = regionDemand_MW > 0
        ? Math.min(nuclearOutput_MW / regionDemand_MW, 0.7) // 最大70%まで（送電損失・需給バランス考慮）
        : 0;
      // #6 再エネバッファ: 太陽光+風力+水力の設備容量 × 平均設備利用率
      const SOLAR_CF = 0.15;  // 太陽光設備利用率
      const WIND_CF = 0.22;   // 風力設備利用率
      const HYDRO_CF = 0.35;  // 水力設備利用率
      const renewableOutput_MW =
        (region.solarCapacity_MW ?? 0) * SOLAR_CF +
        (region.windCapacity_MW ?? 0) * WIND_CF +
        (region.hydroCapacity_MW ?? 0) * HYDRO_CF;
      const renewableCoverageRate = regionDemand_MW > 0
        ? Math.min(renewableOutput_MW / regionDemand_MW, 0.4) // 最大40%（蓄電なしの限界）
        : 0;

      const regionalThermalShare = r.thermalShareRate * (1 - nuclearCoverageRate - renewableCoverageRate);

      const powerCollapse = lngDepletion * Math.max(0, regionalThermalShare);
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
        interconnectionBonusDays: 0,
      };
    });
  return applyInterconnectionBonus(results);
}

// ─── 連系線融通による崩壊日の延命計算 ─────────────────

/**
 * 隣接エリアの電力崩壊日に差がある場合、連系線を通じて
 * 余剰エリアから不足エリアへ電力を融通し、崩壊日を延命する。
 *
 * モデル:
 * - 余剰電力 = (供給側の崩壊日 - 受電側の崩壊日) × 連系線容量 × 稼働率 × (1-損失率)
 * - 延命日数 = 余剰電力量 / 受電側の日次需要
 * - 上限: 供給側の崩壊日を超えない（共倒れ防止）
 */
function applyInterconnectionBonus(regions: RegionCollapse[]): RegionCollapse[] {
  const regionMap = new Map(regions.map((r) => [r.id, { ...r }]));
  const UTILIZATION_RATE = 0.7; // 危機時の連系線稼働率

  // 各地域の日次電力需要（正規化用、kW換算の目安）
  const demandMap = new Map<string, number>();
  for (const r of staticRegionsData) {
    // powerDemandShare × 全国ピーク需要(約1.6億kW)で概算kW値
    demandMap.set(r.id, r.powerDemandShare * 160_000_000);
  }

  // ベースの電力崩壊日を保存（融通前）
  const basePowerDays = new Map<string, number>();
  for (const r of regionMap.values()) {
    basePowerDays.set(r.id, r.powerCollapseDays);
  }

  // 反復計算で多段融通を安定化（A→B→C チェーン）
  for (let iteration = 0; iteration < 3; iteration++) {
    for (const line of staticInterconnections.lines) {
      const fromRegion = regionMap.get(line.from);
      const toRegion = regionMap.get(line.to);
      if (!fromRegion || !toRegion) continue;

      // 崩壊日が遅い方が供給側
      const fromIsSupplier = fromRegion.powerCollapseDays >= toRegion.powerCollapseDays;
      const supplier = fromIsSupplier ? fromRegion : toRegion;
      const receiver = fromIsSupplier ? toRegion : fromRegion;

      const daysDiff = supplier.powerCollapseDays - receiver.powerCollapseDays;
      if (daysDiff <= 1) continue; // 1日未満の差は無視

      // 方向に応じた連系線容量を選択（非対称対応）
      // supplier→receiver方向の容量を使う
      let directedCapacity_kW: number;
      if (fromIsSupplier) {
        // from(supplier)→to(receiver): capacity_kW（from→to方向）
        directedCapacity_kW = line.capacity_kW;
      } else {
        // to(supplier)→from(receiver): capacityReverse_kW（to→from方向）
        directedCapacity_kW = line.capacityReverse_kW;
      }

      const transferCapacity_kW = directedCapacity_kW * UTILIZATION_RATE * (1 - line.lossRate);
      const receiverDemand_kW = demandMap.get(receiver.id) ?? 1;

      // 連系線容量が受電側需要の何%を賄えるか
      const coverageRatio = transferCapacity_kW / receiverDemand_kW;

      // 延命日数 = 差分日数 × カバー率（供給側が余裕のある期間だけ融通可能）
      // 上限: 差分の50%（供給側も自エリアの需要があるため共倒れ防止）
      const bonusDays = Math.min(
        daysDiff * Math.min(coverageRatio, 0.5),
        daysDiff * 0.5,
      );

      if (bonusDays > 0.1 && bonusDays > receiver.interconnectionBonusDays) {
        receiver.interconnectionBonusDays = Math.round(bonusDays * 10) / 10;
      }
    }
  }

  // 融通効果を崩壊日に反映
  for (const region of regionMap.values()) {
    if (region.interconnectionBonusDays > 0) {
      const base = basePowerDays.get(region.id) ?? region.powerCollapseDays;
      region.powerCollapseDays = base + region.interconnectionBonusDays;
      region.collapseDays = Math.min(
        region.oilDepletionDays,
        region.lngDepletionDays,
        region.powerCollapseDays,
      );
    }
  }

  return [...regionMap.values()].sort((a, b) => a.collapseDays - b.collapseDays);
}
