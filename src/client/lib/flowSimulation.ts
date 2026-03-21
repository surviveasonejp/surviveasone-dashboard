/**
 * フロー型シミュレーションエンジン
 *
 * ストック型（在庫÷消費）から離散時間ステップ型に移行。
 * 1日単位でストックの増減を追跡し、段階的崩壊閾値を判定する。
 *
 * dStock/dt = Inflow(t) - Consumption(t)
 * supply(t) = min(stock(t), processingCapacity)
 */

import reserves from "../data/reserves.json";
import consumption from "../data/consumption.json";
import tankerData from "../data/tankers.json";
import { type ScenarioId, SCENARIOS } from "./scenarios";

// ─── 型定義 ───────────────────────────────────────────

export interface FlowState {
  day: number;
  oilStock_kL: number;
  lngStock_t: number;
  oilSupply_kL: number;
  lngSupply_t: number;
}

export type ThresholdType = "price_spike" | "rationing" | "distribution" | "stop";

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

  // 初期在庫
  let oilStock = reserves.oil.totalReserve_kL;
  let lngStock = reserves.lng.inventory_t;
  const initialOil = oilStock;
  const initialLng = lngStock;

  // 日次消費（シナリオ調整済み）
  const baseDailyOil = consumption.oil.dailyConsumption_kL * (1 - s.demandReductionRate);
  const baseDailyLng = consumption.lng.dailyConsumption_t * (1 - s.demandReductionRate);

  // 封鎖による供給途絶分
  const oilCutRate = s.oilBlockadeRate;
  const lngCutRate = s.lngBlockadeRate;

  // タンカー到着イベント（封鎖前に出発済みの船のみ）
  const oilArrivals = buildArrivalSchedule("VLCC", oilCutRate);
  const lngArrivals = buildArrivalSchedule("LNG", lngCutRate);

  const timeline: FlowState[] = [];
  const thresholds: ThresholdEvent[] = [];
  let oilDepletionDay = maxDays;
  let lngDepletionDay = maxDays;
  let powerCollapseDay = maxDays;

  // 閾値追跡用
  const oilThresholdHit = new Set<number>();
  const lngThresholdHit = new Set<number>();

  // 配給による消費削減
  let oilRationFactor = 1.0;
  let lngRationFactor = 1.0;

  for (let day = 0; day < maxDays; day++) {
    // 1. タンカー到着（遅延付き）
    const oilArrival = oilArrivals.get(day - REFINING_DELAY_DAYS) ?? 0;
    const lngArrival = lngArrivals.get(day - LNG_REGAS_DELAY_DAYS) ?? 0;
    oilStock += oilArrival;
    lngStock += lngArrival;

    // 2. 消費（配給調整）
    const dailyOil = baseDailyOil * oilCutRate * oilRationFactor;
    const dailyLng = baseDailyLng * lngCutRate * lngRationFactor;
    oilStock = Math.max(0, oilStock - dailyOil);
    lngStock = Math.max(0, lngStock - dailyLng);

    // 3. 供給量（処理能力制約は全国合計で簡易適用）
    const oilSupply = Math.min(dailyOil, oilStock);
    const lngSupply = Math.min(dailyLng, lngStock);

    // 4. 記録
    timeline.push({
      day,
      oilStock_kL: Math.round(oilStock),
      lngStock_t: Math.round(lngStock),
      oilSupply_kL: Math.round(oilSupply),
      lngSupply_t: Math.round(lngSupply),
    });

    // 5. 段階的崩壊閾値チェック
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
        // 配給開始で消費削減
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

    // 6. 枯渇判定
    if (oilStock <= 0 && oilDepletionDay === maxDays) {
      oilDepletionDay = day;
    }
    if (lngStock <= 0 && lngDepletionDay === maxDays) {
      lngDepletionDay = day;
    }
  }

  // 電力崩壊 = LNG枯渇 × 火力依存率
  powerCollapseDay = Math.round(lngDepletionDay * reserves.electricity.thermalShareRate);

  // 電力閾値イベントも追加
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

  for (const vessel of tankerData.vessels) {
    if (vessel.type !== type) continue;

    const arrivalDay = Math.ceil(vessel.eta_days);
    // ホルムズ経由の船は封鎖率に応じて到着不確実
    const isHormuzRoute =
      vessel.departurePort === "Ras Tanura" ||
      vessel.departurePort === "Jubail" ||
      vessel.departurePort === "Kharg Island" ||
      vessel.departurePort === "Ras Laffan";

    // 封鎖率が高いほどホルムズ経由船の到着確率が下がる
    const arrivalProbability = isHormuzRoute ? Math.max(0, 1 - blockadeRate) : 0.95;

    const cargo = type === "VLCC"
      ? vessel.cargo_t * 0.159 * 1000 // トン → kL（原油密度概算）
      : vessel.cargo_t;

    const existing = schedule.get(arrivalDay) ?? 0;
    schedule.set(arrivalDay, existing + cargo * arrivalProbability);
  }

  return schedule;
}
