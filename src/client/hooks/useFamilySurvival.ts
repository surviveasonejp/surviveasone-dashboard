import { useState, useEffect, useRef } from "react";
import type { FamilyInputs, FamilySurvivalScore } from "../../shared/types";

const DEFAULT_SCORE: FamilySurvivalScore = {
  totalDays: 0,
  rank: "F",
  waterDays: 0,
  foodDays: 0,
  energyDays: 0,
  powerDays: 0,
  bottleneck: "不明",
};

export function useFamilySurvival(inputs: FamilyInputs): FamilySurvivalScore {
  const [score, setScore] = useState<FamilySurvivalScore>(DEFAULT_SCORE);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/family-survival", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inputs),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const json = await res.json();
        setScore(json.data ?? json);
      } catch {
        // フォールバック: クライアント側で簡易計算
        const m = Math.max(inputs.members, 1);
        const waterDays = inputs.waterLiters / (m * 3);
        const foodDays = inputs.foodDays;
        const energyDays = (inputs.gasCanisterCount * 60) / (m * 30);
        const powerDays = inputs.batteryWh / (m * 50);
        const totalDays = Math.min(waterDays, foodDays, energyDays, powerDays);
        setScore({
          totalDays,
          rank: totalDays >= 60 ? "S" : totalDays >= 30 ? "A" : totalDays >= 14 ? "B" : totalDays >= 7 ? "C" : totalDays >= 3 ? "D" : "F",
          waterDays,
          foodDays,
          energyDays,
          powerDays,
          bottleneck: [
            { days: waterDays, label: "水" },
            { days: foodDays, label: "食料" },
            { days: energyDays, label: "燃料" },
            { days: powerDays, label: "電力" },
          ].sort((a, b) => a.days - b.days)[0]?.label ?? "不明",
        });
      }
    }, 300);

    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [inputs.members, inputs.waterLiters, inputs.foodDays, inputs.gasCanisterCount, inputs.batteryWh, inputs.cashYen]);

  return score;
}
