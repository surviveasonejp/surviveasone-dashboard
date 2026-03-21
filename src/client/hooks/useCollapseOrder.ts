import { useMemo } from "react";
import { calcRegionCollapse, type RegionCollapse } from "../lib/calculations";
import { useApiData, type RegionRow, type ElectricityDemandRow } from "./useApiData";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";

/** D1のRegionRow + 電力実測データからRegionCollapseを計算 */
function calcFromApiRegions(
  apiRegions: RegionRow[],
  electricityMap: Map<string, ElectricityDemandRow>,
): RegionCollapse[] {
  const totalOil = staticReserves.oil.totalReserve_kL;
  const totalLng = staticReserves.lng.inventory_t;
  const dailyOil = staticConsumption.oil.dailyConsumption_kL;
  const dailyLng = staticConsumption.lng.dailyConsumption_t;
  const oilHormuz = staticReserves.oil.hormuzDependencyRate;
  const lngHormuz = staticReserves.lng.hormuzDependencyRate;
  const defaultThermalShare = staticReserves.electricity.thermalShareRate;

  return apiRegions
    .map((region) => {
      const oilDepletion =
        (totalOil * region.oil_share) /
        (dailyOil * region.power_demand_share * oilHormuz) /
        region.winter_factor /
        region.isolation_risk;

      const lngDepletion =
        (totalLng * region.lng_share) /
        (dailyLng * region.power_demand_share * lngHormuz) /
        region.winter_factor /
        region.isolation_risk;

      // 電力実測データがあればエリア別火力依存率を使用
      const liveData = electricityMap.get(region.id);
      let thermalShare = defaultThermalShare;
      if (liveData?.thermal_mw && liveData.peak_demand_mw > 0) {
        thermalShare = liveData.thermal_mw / liveData.peak_demand_mw;
      }

      const powerCollapse = lngDepletion * thermalShare;
      const collapseDays = Math.min(oilDepletion, lngDepletion, powerCollapse);

      return {
        id: region.id,
        name: region.name,
        collapseDays,
        oilDepletionDays: oilDepletion,
        lngDepletionDays: lngDepletion,
        powerCollapseDays: powerCollapse,
        vulnerabilityRank: region.vulnerability_rank,
        population: region.population,
        foodSelfSufficiency: region.food_self_sufficiency,
        note: region.note,
        hasLiveData: electricityMap.has(region.id),
      };
    })
    .sort((a, b) => a.collapseDays - b.collapseDays);
}

export function useCollapseOrder(): RegionCollapse[] {
  const { data: apiRegions } = useApiData<RegionRow[]>(
    "/api/regions",
    null as unknown as RegionRow[],
  );
  const { data: electricityData } = useApiData<ElectricityDemandRow[]>(
    "/api/electricity",
    null as unknown as ElectricityDemandRow[],
  );

  const electricityMap = useMemo(() => {
    const map = new Map<string, ElectricityDemandRow>();
    if (Array.isArray(electricityData)) {
      for (const row of electricityData) {
        map.set(row.area_id, row);
      }
    }
    return map;
  }, [electricityData]);

  return useMemo(() => {
    if (Array.isArray(apiRegions) && apiRegions.length > 0) {
      return calcFromApiRegions(apiRegions, electricityMap);
    }
    return calcRegionCollapse();
  }, [apiRegions, electricityMap]);
}
