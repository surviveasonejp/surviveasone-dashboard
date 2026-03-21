import { useMemo } from "react";
import { calcFoodDepletion, type FoodProduct } from "../lib/calculations";

export function useFoodDepletion(): FoodProduct[] {
  return useMemo(() => calcFoodDepletion(), []);
}
