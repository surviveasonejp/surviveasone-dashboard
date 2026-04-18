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
  return calcDaysForRates(s.oilBlockadeRate, s.lngBlockadeRate, s.demandReductionRate);
}

/**
 * 任意の3パラメータから oil/lng/power 日数を算出（Phase 20-C: MyHypothesisPanel用）。
 * 標準シナリオと同じ静的計算式を使用するため比較に齟齬が出ない。
 */
export function calcDaysForRates(
  oilBlockadeRate: number,
  lngBlockadeRate: number,
  demandReductionRate: number,
): number[] {
  const oilEffective = staticConsumption.oil.dailyConsumption_kL
    * oilBlockadeRate * (1 - demandReductionRate);
  const oilDays = oilEffective > 0
    ? staticReserves.oil.totalReserve_kL / oilEffective
    : Infinity;
  const lngEffective = staticConsumption.lng.dailyConsumption_t
    * lngBlockadeRate * (1 - demandReductionRate);
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

// ─── Phase 20-B: 4シナリオ枯渇日数表（DecisionTriadPanel用） ─────

/** 1シナリオ分の oil/lng/power 日数 */
export interface ScenarioDays {
  id: ScenarioId;
  oil: number;
  lng: number;
  power: number;
}

/**
 * 4シナリオ全件の枯渇日数を返す（静的計算ベース）。
 *
 * SCENARIO_RANGES は3シナリオ固定構造のため、ceasefire 含む4シナリオ比較が必要な
 * 用途（DecisionTriadPanel）はこちらを使用する。
 */
export function calcAllScenarioDays(): ScenarioDays[] {
  return (["optimistic", "realistic", "pessimistic", "ceasefire"] as const).map((id) => {
    const days = calcDaysForScenario(id);
    return {
      id,
      oil: Math.round((days[0] ?? 0) * 10) / 10,
      lng: Math.round((days[1] ?? 0) * 10) / 10,
      power: Math.round((days[2] ?? 0) * 10) / 10,
    };
  });
}

export const ALL_SCENARIO_DAYS: ScenarioDays[] = calcAllScenarioDays();
