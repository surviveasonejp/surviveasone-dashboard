import type { RegionCollapse } from "../../shared/types";
import { useApiData } from "./useApiData";
import fallbackData from "../data/fallback-collapse.json";

export function useCollapseOrder(scenarioId: string = "realistic"): RegionCollapse[] {
  const { data } = useApiData<RegionCollapse[]>(
    `/api/collapse?scenario=${scenarioId}`,
    fallbackData as RegionCollapse[],
  );

  return data ?? (fallbackData as RegionCollapse[]);
}
