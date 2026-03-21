import { useMemo } from "react";
import { calcFoodDepletion, type FoodProduct, type FoodDepletionParams } from "../lib/calculations";

export function useFoodDepletion(params?: FoodDepletionParams): FoodProduct[] {
  return useMemo(
    () => calcFoodDepletion(params),
    [params?.oilDays, params?.powerDays],
  );
}
