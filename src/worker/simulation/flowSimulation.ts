/**
 * フロー型シミュレーションエンジン（サーバーサイド）
 *
 * dStock/dt = Inflow(t) - Consumption(t) + SPR_Release(t)
 * supply(t) = min(stock(t), processingCapacity)
 *
 * Phase 5 拡張:
 * - #3 SPR放出メカニズム（リードタイム + 日次上限 + 民間制約）
 * - #4 封鎖解除曲線（blockadeRate を時間関数化）
 * - #5 需要破壊モデリング（在庫%に連動した動的需要削減）
 * - #10 歴史データ対比マーカー
 */

import type {
  FlowState,
  ThresholdType,
  ThresholdEvent,
  FlowSimulationResult,
} from "../../shared/types";
import { type ScenarioId, SCENARIOS } from "../../shared/scenarios";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";
import staticTankerData from "../data/tankers.json";

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

// ─── #3 SPR放出パラメータ ────────────────────────────

const SPR_NATIONAL_LEAD_TIME_DAYS = 14; // IEA協調→閣議了解のリードタイム
const SPR_NATIONAL_DAILY_MAX_KL = 300000; // 日次放出上限（全10基地合計）
const SPR_PRIVATE_USABLE_RATIO = 0.70; // 民間備蓄の実質利用可能割合
const SPR_PRIVATE_DAILY_MAX_KL = 200000; // 民間の日次放出上限

// ─── #4 封鎖解除曲線 ────────────────────────────────

interface BlockadeProfile {
  /** 初期遮断率（day 0） */
  initialRate: number;
  /** 解除開始日 */
  reliefStartDay: number;
  /** 完全解除日（この日に最終遮断率に達する） */
  reliefEndDay: number;
  /** 最終遮断率 */
  finalRate: number;
}

const BLOCKADE_PROFILES: Record<ScenarioId, BlockadeProfile> = {
  optimistic: {
    initialRate: 0.50,
    reliefStartDay: 7,   // 1週間で米軍介入開始
    reliefEndDay: 30,     // 1ヶ月で大幅解除
    finalRate: 0.10,      // 10%残留リスク
  },
  realistic: {
    initialRate: 0.94,
    reliefStartDay: 30,   // 1ヶ月は全面封鎖
    reliefEndDay: 120,    // 4ヶ月で段階的解除
    finalRate: 0.30,      // 30%残留（機雷等）
  },
  pessimistic: {
    initialRate: 1.0,
    reliefStartDay: 90,   // 3ヶ月間は全面封鎖
    reliefEndDay: 365,    // 1年かけて段階的解除
    finalRate: 0.60,      // 60%残留
  },
};

function getBlockadeRate(day: number, profile: BlockadeProfile): number {
  if (day < profile.reliefStartDay) return profile.initialRate;
  if (day >= profile.reliefEndDay) return profile.finalRate;
  // 線形補間で段階的に解除
  const t = (day - profile.reliefStartDay) / (profile.reliefEndDay - profile.reliefStartDay);
  return profile.initialRate + (profile.finalRate - profile.initialRate) * t;
}

// ─── #5 需要破壊モデリング ───────────────────────────

/**
 * 在庫残量(%)に応じた需要削減率を返す。
 * 在庫が減る = 価格高騰 → 産業が操業停止 → 需要が自然減少
 */
function getDemandDestructionFactor(stockPercent: number): number {
  if (stockPercent > 50) return 1.0;        // 通常
  if (stockPercent > 30) return 0.85;       // 産業用15%削減（価格2倍相当）
  if (stockPercent > 10) return 0.65;       // 産業用+商業用35%削減（価格3倍相当）
  return 0.45;                               // 生活必需のみ。55%削減
}

// ─── #10 歴史データ対比マーカー ──────────────────────

const HISTORICAL_MARKERS: Array<{ day: number; label: string }> = [
  { day: 14, label: "1973年石油危機: トイレットペーパー騒動発生" },
  { day: 60, label: "1973年石油危機: 消費量前年比7.3%減少に到達" },
  { day: 90, label: "2011年福島: 全原発停止完了" },
];

// ─── シミュレーション ────────────────────────────────

export function runFlowSimulation(
  scenarioId: ScenarioId = "realistic",
  maxDays: number = 365,
): FlowSimulationResult {
  const s = SCENARIOS[scenarioId];
  const blockadeProfile = BLOCKADE_PROFILES[scenarioId];

  // #3 SPR: 備蓄を種別ごとに分離管理
  let oilNationalStock = staticReserves.oil.nationalReserve_kL;
  let oilPrivateStock = staticReserves.oil.privateReserve_kL * SPR_PRIVATE_USABLE_RATIO;
  let oilJointStock = scenarioId === "pessimistic" ? 0 : staticReserves.oil.jointReserve_kL; // 悲観: 産油国拒否
  let oilCommercialStock = staticReserves.oil.privateReserve_kL * (1 - SPR_PRIVATE_USABLE_RATIO); // 操業用在庫

  let oilStock = oilPrivateStock + oilJointStock + oilCommercialStock; // 即時利用可能分
  let lngStock = staticReserves.lng.inventory_t;

  const totalOilReserve = staticReserves.oil.totalReserve_kL;
  const initialOil = totalOilReserve;
  const initialLng = lngStock;

  const baseDailyOil = staticConsumption.oil.dailyConsumption_kL * (1 - s.demandReductionRate);
  const baseDailyLng = staticConsumption.lng.dailyConsumption_t * (1 - s.demandReductionRate);

  const oilArrivals = buildArrivalSchedule("VLCC", blockadeProfile.initialRate);
  const lngArrivals = buildArrivalSchedule("LNG", blockadeProfile.initialRate);

  const timeline: FlowState[] = [];
  const thresholds: ThresholdEvent[] = [];
  let oilDepletionDay = maxDays;
  let lngDepletionDay = maxDays;
  let powerCollapseDay = maxDays;

  const oilThresholdHit = new Set<number>();
  const lngThresholdHit = new Set<number>();

  let oilRationFactor = 1.0;
  let lngRationFactor = 1.0;
  let nationalReleaseStarted = false;

  for (let day = 0; day < maxDays; day++) {
    // #4 封鎖解除曲線: 日ごとの遮断率
    const currentBlockadeRate = getBlockadeRate(day, blockadeProfile);

    // タンカー到着（遅延込み）
    const oilArrival = oilArrivals.get(day - REFINING_DELAY_DAYS) ?? 0;
    const lngArrival = lngArrivals.get(day - LNG_REGAS_DELAY_DAYS) ?? 0;
    oilStock += oilArrival;
    lngStock += lngArrival;

    // #3 SPR: 国家備蓄放出（リードタイム後）
    if (day >= SPR_NATIONAL_LEAD_TIME_DAYS && oilNationalStock > 0) {
      if (!nationalReleaseStarted) {
        nationalReleaseStarted = true;
        thresholds.push({
          day,
          type: "price_spike",
          resource: "oil",
          stockPercent: Math.round((oilStock / initialOil) * 1000) / 10,
          label: "国家備蓄 放出開始",
        });
      }
      const release = Math.min(SPR_NATIONAL_DAILY_MAX_KL, oilNationalStock);
      oilNationalStock -= release;
      oilStock += release;
    }

    // #5 需要破壊: 在庫残量に応じた動的需要削減
    const oilPercent = (oilStock / initialOil) * 100;
    const lngPercent = (lngStock / initialLng) * 100;
    const oilDemandDestruction = getDemandDestructionFactor(oilPercent);
    const lngDemandDestruction = getDemandDestructionFactor(lngPercent);

    const dailyOil = baseDailyOil * currentBlockadeRate * oilRationFactor * oilDemandDestruction;
    const dailyLng = baseDailyLng * currentBlockadeRate * lngRationFactor * lngDemandDestruction;
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

    // 閾値判定
    const oilPercentNow = (oilStock / initialOil) * 100;
    const lngPercentNow = (lngStock / initialLng) * 100;

    for (const th of THRESHOLDS) {
      if (oilPercentNow <= th.percent && !oilThresholdHit.has(th.percent)) {
        oilThresholdHit.add(th.percent);
        thresholds.push({
          day,
          type: th.type,
          resource: "oil",
          stockPercent: Math.round(oilPercentNow * 10) / 10,
          label: `石油 ${th.label}`,
        });
        if (th.type === "rationing") oilRationFactor = 0.7;
        if (th.type === "distribution") oilRationFactor = 0.4;
      }
      if (lngPercentNow <= th.percent && !lngThresholdHit.has(th.percent)) {
        lngThresholdHit.add(th.percent);
        thresholds.push({
          day,
          type: th.type,
          resource: "lng",
          stockPercent: Math.round(lngPercentNow * 10) / 10,
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

    // 水道崩壊カスケード
    thresholds.push({
      day: powerCollapseDay,
      type: "water_pressure",
      resource: "water",
      stockPercent: 50,
      label: "水道 水圧低下（高層階断水）",
    });
    thresholds.push({
      day: Math.min(powerCollapseDay + 1, maxDays),
      type: "water_cutoff",
      resource: "water",
      stockPercent: 10,
      label: "水道 広域断水（配水池枯渇）",
    });
    thresholds.push({
      day: Math.min(powerCollapseDay + 3, maxDays),
      type: "water_sanitation",
      resource: "water",
      stockPercent: 0,
      label: "下水処理停止（衛生崩壊）",
    });
  }

  // #10 歴史データ対比マーカー
  for (const marker of HISTORICAL_MARKERS) {
    if (marker.day < maxDays) {
      thresholds.push({
        day: marker.day,
        type: "price_spike",
        resource: "oil",
        stockPercent: -1, // マーカー識別用
        label: `【歴史】${marker.label}`,
      });
    }
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
