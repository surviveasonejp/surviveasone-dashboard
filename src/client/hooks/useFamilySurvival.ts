import { useMemo } from "react";
import type { FamilyInputs, FamilySurvivalScore } from "../../shared/types";
import type { ScenarioId } from "../../shared/scenarios";
import { SUPPLY_RATE_BY_SCENARIO } from "../lib/resourceStatus";

/**
 * Family Meter の供給余力計算（クライアントオンリー）
 *
 * プライバシー保護: ユーザーの備蓄データ（世帯人数・水・食料・現金等）を
 * サーバーに送信しない。全計算をブラウザ内で完結させる。
 *
 * 定数出典: 内閣府「避難所における良好な生活環境の確保に向けた取組指針」(2016年)
 *
 * 2モード構成:
 * - disaster: 外部供給ゼロ前提（突発災害）。備蓄÷日次消費 = 枯渇日数
 * - constraint: 部分供給継続前提（ホルムズ型）。備蓄÷(1 − 外部供給率) = 延命日数
 *   外部供給率はシナリオ（optimistic/realistic/pessimistic/ceasefire）で変動
 */

// 出典: 内閣府防災ガイドライン + 岩谷産業公表値
const WATER_PER_PERSON_PER_DAY = 3; // L
const GAS_CANISTER_MINUTES = 60;
const GAS_USAGE_MINUTES_PER_PERSON = 30;
const POWER_WH_PER_PERSON_PER_DAY = 50; // 通常世帯: スマホ15Wh+LED30Wh+ラジオ5Wh
const POWER_WH_PER_PERSON_PER_DAY_MEDICAL = 500; // 医療機器世帯: 人工呼吸器300-400Wh+吸引器50Wh+照明等

// ソーラーパネルの日次発電量推定
// 出典: ISEP自然エネルギー白書 日本平均CF15% × 日照時間5時間/日（悲観的見積もり）
const SOLAR_HOURS_PER_DAY = 5; // 有効日照時間
const SOLAR_EFFICIENCY = 0.15; // 天候・角度・変換効率を考慮した総合効率

/** 上限日数（実質的に制約なしの状態を有限値で表現） */
const CONSTRAINT_MAX_DAYS = 180;

function constraintDays(stockDays: number, supplyRate: number): number {
  const netConsumption = 1 - supplyRate;
  if (netConsumption <= 0.01) return CONSTRAINT_MAX_DAYS;
  return Math.min(stockDays / netConsumption, CONSTRAINT_MAX_DAYS);
}

function getSurvivalRank(days: number): "S" | "A" | "B" | "C" | "D" | "F" {
  if (days >= 60) return "S";
  if (days >= 30) return "A";
  if (days >= 14) return "B";
  if (days >= 7) return "C";
  if (days >= 3) return "D";
  return "F";
}

export function useFamilySurvival(inputs: FamilyInputs, scenario: ScenarioId = "realistic"): FamilySurvivalScore {
  return useMemo(() => {
    const rates = SUPPLY_RATE_BY_SCENARIO[scenario];
    const m = Math.max(inputs.members, 1);
    const waterStockDays = inputs.waterLiters / (m * WATER_PER_PERSON_PER_DAY);
    const foodStockDays = inputs.foodDays;
    const energyStockDays = (inputs.gasCanisterCount * GAS_CANISTER_MINUTES) / (m * GAS_USAGE_MINUTES_PER_PERSON);
    const medicalStockDays = inputs.medicalSupplyDays;

    // 電力: 医療機器の有無で消費量が大きく変わる
    const powerPerPersonPerDay = inputs.hasMedicalDevice
      ? POWER_WH_PER_PERSON_PER_DAY_MEDICAL
      : POWER_WH_PER_PERSON_PER_DAY;
    const dailyPowerNeed = m * powerPerPersonPerDay;

    // ソーラーパネルによる日次充電量
    const dailySolarWh = inputs.solarWatts * SOLAR_HOURS_PER_DAY * SOLAR_EFFICIENCY;

    let powerStockDays: number;
    if (dailySolarWh >= dailyPowerNeed) {
      // ソーラーで日次需要を賄える → バッテリーは予備。実質90日上限（季節変動・故障リスク）
      powerStockDays = Math.min(90, inputs.batteryWh / dailyPowerNeed + 90);
    } else if (dailySolarWh > 0) {
      // ソーラーで一部賄える → バッテリーの消費速度が遅くなる
      const netDailyDrain = dailyPowerNeed - dailySolarWh;
      powerStockDays = inputs.batteryWh / netDailyDrain;
    } else {
      // ソーラーなし → バッテリーのみ
      powerStockDays = inputs.batteryWh / dailyPowerNeed;
    }

    // モード別の余力日数
    const isConstraint = inputs.mode === "constraint";
    const waterDays = isConstraint
      ? constraintDays(waterStockDays, rates["水"])
      : waterStockDays;
    const foodDays = isConstraint
      ? constraintDays(foodStockDays, rates["食料"])
      : foodStockDays;
    const energyDays = isConstraint
      ? constraintDays(energyStockDays, rates["燃料"])
      : energyStockDays;
    const powerDays = isConstraint
      ? constraintDays(powerStockDays, rates["電力"])
      : powerStockDays;
    const medicalDays = isConstraint
      ? constraintDays(medicalStockDays, rates["医療・衛生"])
      : medicalStockDays;

    const totalDays = Math.min(waterDays, foodDays, energyDays, powerDays, medicalDays);
    const bottleneck = [
      { days: waterDays, label: "水" },
      { days: foodDays, label: "食料" },
      { days: energyDays, label: "燃料" },
      { days: powerDays, label: "電力" },
      { days: medicalDays, label: "医療・衛生" },
    ].sort((a, b) => a.days - b.days)[0]?.label ?? "不明";

    return {
      totalDays,
      rank: getSurvivalRank(totalDays),
      waterDays,
      foodDays,
      energyDays,
      powerDays,
      medicalDays,
      bottleneck,
    };
  }, [
    inputs.members,
    inputs.waterLiters,
    inputs.foodDays,
    inputs.gasCanisterCount,
    inputs.batteryWh,
    inputs.solarWatts,
    inputs.hasMedicalDevice,
    inputs.medicalSupplyDays,
    inputs.mode,
    scenario,
  ]);
}
