/**
 * フロー型シミュレーションエンジン（サーバーサイド）
 *
 * dStock/dt = Inflow(t) - Consumption(t)
 * supply(t) = min(stock(t), processingCapacity)
 */

import type {
  FlowState,
  ThresholdType,
  ThresholdEvent,
  FlowSimulationResult,
} from "../../shared/types";
import { type ScenarioId, SCENARIOS } from "../../shared/scenarios";
import staticReserves from "../../client/data/reserves.json";
import staticConsumption from "../../client/data/consumption.json";
import staticTankerData from "../../client/data/tankers.json";

// ─── 閾値定義 ─────────────────────────────────────────

const THRESHOLDS: Array<{ percent: number; type: ThresholdType; label: string }> = [
  { percent: 50, type: "price_spike", label: "価格暴騰" },
  { percent: 30, type: "rationing", label: "供給制限" },
  { percent: 10, type: "distribution", label: "配給制" },
  { percent: 0, type: "stop", label: "完全停止" },
];

// ─── 遅延パラメータ ──────────────────────────────────

const REFINING_DELAY_DAYS = 5;
const LNG_REGAS_DELAY_DAYS = 2;

// ─── シミュレーション ────────────────────────────────

export function runFlowSimulation(
  scenarioId: ScenarioId = "realistic",
  maxDays: number = 365,
): FlowSimulationResult {
  const s = SCENARIOS[scenarioId];

  let oilStock = staticReserves.oil.totalReserve_kL;
  let lngStock = staticReserves.lng.inventory_t;
  const initialOil = oilStock;
  const initialLng = lngStock;

  const baseDailyOil = staticConsumption.oil.dailyConsumption_kL * (1 - s.demandReductionRate);
  const baseDailyLng = staticConsumption.lng.dailyConsumption_t * (1 - s.demandReductionRate);

  const oilCutRate = s.oilBlockadeRate;
  const lngCutRate = s.lngBlockadeRate;

  const oilArrivals = buildArrivalSchedule("VLCC", oilCutRate);
  const lngArrivals = buildArrivalSchedule("LNG", lngCutRate);

  const timeline: FlowState[] = [];
  const thresholds: ThresholdEvent[] = [];
  let oilDepletionDay = maxDays;
  let lngDepletionDay = maxDays;
  let powerCollapseDay = maxDays;

  const oilThresholdHit = new Set<number>();
  const lngThresholdHit = new Set<number>();

  let oilRationFactor = 1.0;
  let lngRationFactor = 1.0;

  for (let day = 0; day < maxDays; day++) {
    const oilArrival = oilArrivals.get(day - REFINING_DELAY_DAYS) ?? 0;
    const lngArrival = lngArrivals.get(day - LNG_REGAS_DELAY_DAYS) ?? 0;
    oilStock += oilArrival;
    lngStock += lngArrival;

    const dailyOil = baseDailyOil * oilCutRate * oilRationFactor;
    const dailyLng = baseDailyLng * lngCutRate * lngRationFactor;
    oilStock = Math.max(0, oilStock - dailyOil);
    lngStock = Math.max(0, lngStock - dailyLng);

    const oilSupply = Math.min(dailyOil, oilStock);
    const lngSupply = Math.min(dailyLng, lngStock);

    timeline.push({
      day,
      oilStock_kL: Math.round(oilStock),
      lngStock_t: Math.round(lngStock),
      oilSupply_kL: Math.round(oilSupply),
      lngSupply_t: Math.round(lngSupply),
    });

    const oilPercent = (oilStock / initialOil) * 100;
    const lngPercent = (lngStock / initialLng) * 100;

    for (const th of THRESHOLDS) {
      if (oilPercent <= th.percent && !oilThresholdHit.has(th.percent)) {
        oilThresholdHit.add(th.percent);
        thresholds.push({
          day,
          type: th.type,
          resource: "oil",
          stockPercent: Math.round(oilPercent * 10) / 10,
          label: `石油 ${th.label}`,
        });
        if (th.type === "rationing") oilRationFactor = 0.7;
        if (th.type === "distribution") oilRationFactor = 0.4;
      }
      if (lngPercent <= th.percent && !lngThresholdHit.has(th.percent)) {
        lngThresholdHit.add(th.percent);
        thresholds.push({
          day,
          type: th.type,
          resource: "lng",
          stockPercent: Math.round(lngPercent * 10) / 10,
          label: `LNG ${th.label}`,
        });
        if (th.type === "rationing") lngRationFactor = 0.7;
        if (th.type === "distribution") lngRationFactor = 0.4;
      }
    }

    if (oilStock <= 0 && oilDepletionDay === maxDays) {
      oilDepletionDay = day;
    }
    if (lngStock <= 0 && lngDepletionDay === maxDays) {
      lngDepletionDay = day;
    }
  }

  powerCollapseDay = Math.round(lngDepletionDay * staticReserves.electricity.thermalShareRate);

  if (powerCollapseDay < maxDays) {
    thresholds.push({
      day: powerCollapseDay,
      type: "stop",
      resource: "power",
      stockPercent: 0,
      label: "電力 完全停止",
    });
  }

  thresholds.sort((a, b) => a.day - b.day);

  return { timeline, oilDepletionDay, lngDepletionDay, powerCollapseDay, thresholds };
}

// ─── タンカー到着スケジュール ─────────────────────────

function buildArrivalSchedule(
  type: "VLCC" | "LNG",
  blockadeRate: number,
): Map<number, number> {
  const schedule = new Map<number, number>();

  for (const vessel of staticTankerData.vessels) {
    if (vessel.type !== type) continue;

    const arrivalDay = Math.ceil(vessel.eta_days);
    const isHormuzRoute =
      vessel.departurePort === "Ras Tanura" ||
      vessel.departurePort === "Jubail" ||
      vessel.departurePort === "Kharg Island" ||
      vessel.departurePort === "Ras Laffan";

    const arrivalProbability = isHormuzRoute ? Math.max(0, 1 - blockadeRate) : 0.95;

    const cargo = type === "VLCC"
      ? vessel.cargo_t * 0.159 * 1000
      : vessel.cargo_t;

    const existing = schedule.get(arrivalDay) ?? 0;
    schedule.set(arrivalDay, existing + cargo * arrivalProbability);
  }

  return schedule;
}
