import reserves from "../data/reserves.json";
import consumption from "../data/consumption.json";
import regionsData from "../data/regions.json";

export type AlertLevel = "critical" | "warning" | "caution" | "safe";

export interface ResourceCountdown {
  label: string;
  totalDays: number;
  totalSeconds: number;
  alertLevel: AlertLevel;
}

export interface RegionCollapse {
  id: string;
  name: string;
  collapseDays: number;
  oilDepletionDays: number;
  lngDepletionDays: number;
  powerCollapseDays: number;
  vulnerabilityRank: string;
  population: number;
  foodSelfSufficiency: number;
  note: string;
}

/** 封鎖時の石油実効残存日数 */
export function calcOilDays(): number {
  return reserves.oil.totalReserve_kL / (consumption.oil.dailyConsumption_kL * reserves.oil.hormuzDependencyRate);
}

/** 封鎖時のLNG実効残存日数 */
export function calcLngDays(): number {
  return reserves.lng.inventory_t / (consumption.lng.dailyConsumption_t * reserves.lng.hormuzDependencyRate);
}

/** 電力崩壊日数（LNGがボトルネック） */
export function calcPowerDays(): number {
  return calcLngDays() * reserves.electricity.thermalShareRate;
}

export function getAlertLevel(days: number): AlertLevel {
  if (days <= 30) return "critical";
  if (days <= 60) return "warning";
  if (days <= 90) return "caution";
  return "safe";
}

export function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case "critical": return "#ff1744";
    case "warning": return "#ff9100";
    case "caution": return "#ffea00";
    case "safe": return "#00e676";
  }
}

export function getAllCountdowns(): ResourceCountdown[] {
  const oilDays = calcOilDays();
  const lngDays = calcLngDays();
  const powerDays = calcPowerDays();

  return [
    {
      label: "石油備蓄",
      totalDays: oilDays,
      totalSeconds: oilDays * 86400,
      alertLevel: getAlertLevel(oilDays),
    },
    {
      label: "LNG在庫",
      totalDays: lngDays,
      totalSeconds: lngDays * 86400,
      alertLevel: getAlertLevel(lngDays),
    },
    {
      label: "電力供給",
      totalDays: powerDays,
      totalSeconds: powerDays * 86400,
      alertLevel: getAlertLevel(powerDays),
    },
  ];
}

/** エリア別崩壊日数を計算 */
export function calcRegionCollapse(): RegionCollapse[] {
  const totalOil = reserves.oil.totalReserve_kL;
  const totalLng = reserves.lng.inventory_t;
  const dailyOil = consumption.oil.dailyConsumption_kL;
  const dailyLng = consumption.lng.dailyConsumption_t;
  const oilHormuz = reserves.oil.hormuzDependencyRate;
  const lngHormuz = reserves.lng.hormuzDependencyRate;

  return regionsData.map((region) => {
    const oilDepletion = (totalOil * region.oilShare) / (dailyOil * region.powerDemandShare * oilHormuz)
      * (1 / region.winterFactor) * (1 / region.isolationRisk);

    const lngDepletion = (totalLng * region.lngShare) / (dailyLng * region.powerDemandShare * lngHormuz)
      * (1 / region.winterFactor) * (1 / region.isolationRisk);

    const powerCollapse = lngDepletion * reserves.electricity.thermalShareRate;

    const collapseDays = Math.min(oilDepletion, lngDepletion, powerCollapse);

    return {
      id: region.id,
      name: region.name,
      collapseDays,
      oilDepletionDays: oilDepletion,
      lngDepletionDays: lngDepletion,
      powerCollapseDays: powerCollapse,
      vulnerabilityRank: region.vulnerabilityRank,
      population: region.population,
      foodSelfSufficiency: region.foodSelfSufficiency,
      note: region.note,
    };
  }).sort((a, b) => a.collapseDays - b.collapseDays);
}
