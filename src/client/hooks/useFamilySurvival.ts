import { useMemo } from "react";
import { calcFamilySurvival, type FamilyInputs, type FamilySurvivalScore } from "../lib/calculations";

export function useFamilySurvival(inputs: FamilyInputs): FamilySurvivalScore {
  return useMemo(
    () => calcFamilySurvival(inputs),
    [inputs.members, inputs.waterLiters, inputs.foodDays, inputs.gasCanisterCount, inputs.batteryWh, inputs.cashYen],
  );
}
