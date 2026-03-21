import type { FoodProduct } from "../../shared/types";
import { useApiData } from "./useApiData";

const EMPTY_FOOD: FoodProduct[] = [];

export function useFoodDepletion(scenarioId: string = "realistic", regionId?: string): FoodProduct[] {
  const params = new URLSearchParams({ scenario: scenarioId });
  if (regionId) params.set("region", regionId);

  const { data } = useApiData<FoodProduct[]>(
    `/api/food-collapse?${params.toString()}`,
    EMPTY_FOOD,
  );

  return data ?? EMPTY_FOOD;
}
