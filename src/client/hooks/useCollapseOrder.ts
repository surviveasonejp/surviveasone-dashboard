import { useMemo } from "react";
import { calcRegionCollapse, type RegionCollapse } from "../lib/calculations";

export function useCollapseOrder(): RegionCollapse[] {
  return useMemo(() => calcRegionCollapse(), []);
}
