import { useMemo } from "react";
import type { FamilyInputs, FamilySurvivalScore } from "../../shared/types";

/**
 * Family Meter の生存日数計算（クライアントオンリー）
 *
 * プライバシー保護: ユーザーの備蓄データ（世帯人数・水・食料・現金等）を
 * サーバーに送信しない。全計算をブラウザ内で完結させる。
 *
 * 定数出典: 内閣府「避難所における良好な生活環境の確保に向けた取組指針」(2016年)
 */

// 出典: 内閣府防災ガイドライン + 岩谷産業公表値
const WATER_PER_PERSON_PER_DAY = 3; // L
const GAS_CANISTER_MINUTES = 60;
const GAS_USAGE_MINUTES_PER_PERSON = 30;
const POWER_WH_PER_PERSON_PER_DAY = 50;

function getSurvivalRank(days: number): "S" | "A" | "B" | "C" | "D" | "F" {
  if (days >= 60) return "S";
  if (days >= 30) return "A";
  if (days >= 14) return "B";
  if (days >= 7) return "C";
  if (days >= 3) return "D";
  return "F";
}

export function useFamilySurvival(inputs: FamilyInputs): FamilySurvivalScore {
  return useMemo(() => {
    const m = Math.max(inputs.members, 1);
    const waterDays = inputs.waterLiters / (m * WATER_PER_PERSON_PER_DAY);
    const foodDays = inputs.foodDays;
    const energyDays = (inputs.gasCanisterCount * GAS_CANISTER_MINUTES) / (m * GAS_USAGE_MINUTES_PER_PERSON);
    const powerDays = inputs.batteryWh / (m * POWER_WH_PER_PERSON_PER_DAY);
    const totalDays = Math.min(waterDays, foodDays, energyDays, powerDays);
    const bottleneck = [
      { days: waterDays, label: "水" },
      { days: foodDays, label: "食料" },
      { days: energyDays, label: "燃料" },
      { days: powerDays, label: "電力" },
    ].sort((a, b) => a.days - b.days)[0]?.label ?? "不明";

    return {
      totalDays,
      rank: getSurvivalRank(totalDays),
      waterDays,
      foodDays,
      energyDays,
      powerDays,
      bottleneck,
    };
  }, [inputs.members, inputs.waterLiters, inputs.foodDays, inputs.gasCanisterCount, inputs.batteryWh]);
}
