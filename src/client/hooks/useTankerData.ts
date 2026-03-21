import { useMemo } from "react";
import { calcTankerArrivals, type TankerInfo } from "../lib/calculations";

export function useTankerData(): TankerInfo[] {
  return useMemo(() => calcTankerArrivals(), []);
}
