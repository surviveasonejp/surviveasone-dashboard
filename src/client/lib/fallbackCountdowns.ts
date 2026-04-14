/**
 * reserves.json / consumption.json から算出するフォールバック用カウントダウン値。
 *
 * 以前は Landing/Dashboard/SurvivalClock に 168.8/750.4/487.8 とハードコードされていたが、
 * データ更新時にページ間で齟齬が発生するため、ここに一元化する。
 * API応答が得られた場合はAPIの値が優先される（これはあくまでフォールバック）。
 */

import type { ResourceCountdown } from "../../shared/types";
import type { ScenarioId } from "../../shared/scenarios";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";
import { SCENARIOS, DEFAULT_SCENARIO } from "../../shared/scenarios";

function calcFallback(): ResourceCountdown[] {
  const s = SCENARIOS[DEFAULT_SCENARIO];
  const oilEffective = staticConsumption.oil.dailyConsumption_kL
    * s.oilBlockadeRate * (1 - s.demandReductionRate);
  const oilDays = oilEffective > 0
    ? staticReserves.oil.totalReserve_kL / oilEffective
    : Infinity;

  const lngEffective = staticConsumption.lng.dailyConsumption_t
    * s.lngBlockadeRate * (1 - s.demandReductionRate);
  const lngDays = lngEffective > 0
    ? staticReserves.lng.inventory_t / lngEffective
    : Infinity;

  const powerDays = lngDays * staticReserves.electricity.thermalShareRate;

  return [
    { label: "石油備蓄", totalDays: Math.round(oilDays * 10) / 10, totalSeconds: oilDays * 86400, alertLevel: oilDays <= 30 ? "critical" : oilDays <= 60 ? "warning" : oilDays <= 90 ? "caution" : "safe" },
    { label: "LNG供給余力", totalDays: Math.round(lngDays * 10) / 10, totalSeconds: lngDays * 86400, alertLevel: lngDays <= 30 ? "critical" : lngDays <= 60 ? "warning" : lngDays <= 90 ? "caution" : "safe" },
    { label: "電力供給", totalDays: Math.round(powerDays * 10) / 10, totalSeconds: powerDays * 86400, alertLevel: powerDays <= 30 ? "critical" : powerDays <= 60 ? "warning" : powerDays <= 90 ? "caution" : "safe" },
  ];
}

/** reserves.json から算出した備蓄概要テキスト */
export function getReservesSummaryText(): string {
  const r = staticReserves.oil;
  return `石油備蓄${r.totalReserveDays}日分(経産省${staticReserves.meta.baselineDate}時点)`;
}

/** reserves.json の基準日 */
export function getReservesBaselineDate(): string {
  return staticReserves.meta.baselineDate;
}

/** reserves.json の最終更新日 */
export function getReservesUpdatedAt(): string {
  return staticReserves.meta.updatedAt;
}

export const FALLBACK_COUNTDOWNS: ResourceCountdown[] = calcFallback();

/** 3シナリオ分の日数レンジ（index 0=石油, 1=LNG, 2=電力） */
export interface ScenarioRange {
  optimistic: number;
  realistic: number;
  pessimistic: number;
}

function calcDaysForScenario(scenarioId: ScenarioId): number[] {
  const s = SCENARIOS[scenarioId];
  const oilEffective = staticConsumption.oil.dailyConsumption_kL
    * s.oilBlockadeRate * (1 - s.demandReductionRate);
  const oilDays = oilEffective > 0
    ? staticReserves.oil.totalReserve_kL / oilEffective
    : Infinity;
  const lngEffective = staticConsumption.lng.dailyConsumption_t
    * s.lngBlockadeRate * (1 - s.demandReductionRate);
  const lngDays = lngEffective > 0
    ? staticReserves.lng.inventory_t / lngEffective
    : Infinity;
  const powerDays = lngDays * staticReserves.electricity.thermalShareRate;
  return [oilDays, lngDays, powerDays];
}

/** リソース別の3シナリオレンジを算出（静的データベース） */
export function calcScenarioRanges(): ScenarioRange[] {
  const opt = calcDaysForScenario("optimistic");
  const real = calcDaysForScenario("realistic");
  const pess = calcDaysForScenario("pessimistic");
  return [0, 1, 2].map((i) => ({
    optimistic: Math.round((opt[i] ?? 0) * 10) / 10,
    realistic: Math.round((real[i] ?? 0) * 10) / 10,
    pessimistic: Math.round((pess[i] ?? 0) * 10) / 10,
  }));
}

export const SCENARIO_RANGES: ScenarioRange[] = calcScenarioRanges();
