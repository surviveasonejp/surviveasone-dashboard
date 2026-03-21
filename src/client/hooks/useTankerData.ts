import type { TankerInfo } from "../../shared/types";
import { useApiData } from "./useApiData";
import staticTankerData from "../data/tankers.json";

const fallbackTankers: TankerInfo[] = [...staticTankerData.vessels]
  .sort((a, b) => a.eta_days - b.eta_days);

export function useTankerData(): TankerInfo[] {
  const { data } = useApiData<TankerInfo[]>("/api/tankers", fallbackTankers);
  return data ?? fallbackTankers;
}
