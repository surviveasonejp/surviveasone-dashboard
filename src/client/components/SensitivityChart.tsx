/**
 * 感度分析チャート（トルネードチャート）
 *
 * 主要パラメータを±20%変動させたときのシミュレーション結果への影響を可視化。
 * 「どのパラメータが結果に最も影響するか」を一目で判断できる。
 *
 * 対象パラメータ:
 * 1. 石油遮断率 (oilBlockadeRate)
 * 2. 需要削減率 (demandReductionRate)
 * 3. 石油備蓄量 (totalReserve_kL)
 * 4. 日次消費量 (dailyConsumption_kL)
 * 5. 火力依存率 (thermalShareRate)
 * 6. LNG遮断率 (lngBlockadeRate)
 */

import { type FC, useMemo } from "react";
import staticReserves from "../../worker/data/reserves.json";
import staticConsumption from "../../worker/data/consumption.json";
import { SCENARIOS, type ScenarioId } from "../../shared/scenarios";

interface SensitivityChartProps {
  scenarioId: ScenarioId;
}

interface SensitivityResult {
  param: string;
  label: string;
  baseDays: number;
  lowDays: number;   // パラメータ-20%時の日数
  highDays: number;  // パラメータ+20%時の日数
  impact: number;    // |highDays - lowDays| = 感度（日数）
}

/** 簡易カウントダウン計算（flowSimulationを使わず直接計算） */
function calcOilDays(
  totalKL: number,
  dailyKL: number,
  blockadeRate: number,
  demandReduction: number,
): number {
  const effective = dailyKL * blockadeRate * (1 - demandReduction);
  return effective > 0 ? totalKL / effective : 9999;
}

function calcPowerDays(
  lngT: number,
  dailyLngT: number,
  lngBlockade: number,
  demandReduction: number,
  thermalShare: number,
): number {
  const lngEffective = dailyLngT * lngBlockade * (1 - demandReduction);
  const lngDays = lngEffective > 0 ? lngT / lngEffective : 9999;
  return lngDays * thermalShare;
}

function runSensitivity(scenarioId: ScenarioId): SensitivityResult[] {
  const s = SCENARIOS[scenarioId];
  const r = staticReserves;
  const c = staticConsumption;

  const baseOilDays = calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL, s.oilBlockadeRate, s.demandReductionRate);
  const basePowerDays = calcPowerDays(r.lng.inventory_t, c.lng.dailyConsumption_t, s.lngBlockadeRate, s.demandReductionRate, r.electricity.thermalShareRate);

  const VARIATION = 0.2; // ±20%

  const params: Array<{
    key: string;
    label: string;
    calcLow: () => number;
    calcHigh: () => number;
    base: number;
  }> = [
    {
      key: "oilBlockadeRate",
      label: "石油遮断率",
      base: baseOilDays,
      calcLow: () => calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL, s.oilBlockadeRate * (1 - VARIATION), s.demandReductionRate),
      calcHigh: () => calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL, Math.min(s.oilBlockadeRate * (1 + VARIATION), 1.0), s.demandReductionRate),
    },
    {
      key: "demandReduction",
      label: "需要削減率",
      base: baseOilDays,
      calcLow: () => calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL, s.oilBlockadeRate, s.demandReductionRate * (1 - VARIATION)),
      calcHigh: () => calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL, s.oilBlockadeRate, Math.min(s.demandReductionRate * (1 + VARIATION), 0.5)),
    },
    {
      key: "totalReserve",
      label: "石油備蓄量",
      base: baseOilDays,
      calcLow: () => calcOilDays(r.oil.totalReserve_kL * (1 - VARIATION), c.oil.dailyConsumption_kL, s.oilBlockadeRate, s.demandReductionRate),
      calcHigh: () => calcOilDays(r.oil.totalReserve_kL * (1 + VARIATION), c.oil.dailyConsumption_kL, s.oilBlockadeRate, s.demandReductionRate),
    },
    {
      key: "dailyConsumption",
      label: "日次消費量",
      base: baseOilDays,
      calcLow: () => calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL * (1 - VARIATION), s.oilBlockadeRate, s.demandReductionRate),
      calcHigh: () => calcOilDays(r.oil.totalReserve_kL, c.oil.dailyConsumption_kL * (1 + VARIATION), s.oilBlockadeRate, s.demandReductionRate),
    },
    {
      key: "thermalShare",
      label: "火力依存率",
      base: basePowerDays,
      calcLow: () => calcPowerDays(r.lng.inventory_t, c.lng.dailyConsumption_t, s.lngBlockadeRate, s.demandReductionRate, r.electricity.thermalShareRate * (1 - VARIATION)),
      calcHigh: () => calcPowerDays(r.lng.inventory_t, c.lng.dailyConsumption_t, s.lngBlockadeRate, s.demandReductionRate, r.electricity.thermalShareRate * (1 + VARIATION)),
    },
    {
      key: "lngBlockade",
      label: "LNG遮断率",
      base: basePowerDays,
      calcLow: () => calcPowerDays(r.lng.inventory_t, c.lng.dailyConsumption_t, s.lngBlockadeRate * (1 - VARIATION), s.demandReductionRate, r.electricity.thermalShareRate),
      calcHigh: () => calcPowerDays(r.lng.inventory_t, c.lng.dailyConsumption_t, Math.min(s.lngBlockadeRate * (1 + VARIATION), 1.0), s.demandReductionRate, r.electricity.thermalShareRate),
    },
  ];

  return params
    .map((p) => {
      const lowDays = p.calcLow();
      const highDays = p.calcHigh();
      return {
        param: p.key,
        label: p.label,
        baseDays: Math.round(p.base * 10) / 10,
        lowDays: Math.round(lowDays * 10) / 10,
        highDays: Math.round(highDays * 10) / 10,
        impact: Math.round(Math.abs(highDays - lowDays) * 10) / 10,
      };
    })
    .sort((a, b) => b.impact - a.impact); // 影響度順
}

export const SensitivityChart: FC<SensitivityChartProps> = ({ scenarioId }) => {
  const results = useMemo(() => runSensitivity(scenarioId), [scenarioId]);
  const maxImpact = Math.max(...results.map((r) => r.impact), 1);

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
      <div className="text-xs font-mono text-neutral-500 tracking-wider">
        SENSITIVITY ANALYSIS — 各仮定が実際の値と20%ずれた場合の枯渇日数の変動幅
      </div>
      <p className="text-[10px] font-mono text-neutral-600 leading-relaxed">
        上位3つのパラメータがシミュレーション結果の大半を左右します。これらの仮定に不確実性が高い場合、実際の枯渇日数は大きく変動します。
      </p>

      <div className="space-y-2">
        {results.map((r, idx) => {
          const leftPct = Math.min(r.lowDays, r.highDays);
          const rightPct = Math.max(r.lowDays, r.highDays);
          const basePct = r.baseDays;
          // バーの範囲をmaxImpact基準で正規化
          const barLeft = ((basePct - leftPct) / maxImpact) * 50;
          const barRight = ((rightPct - basePct) / maxImpact) * 50;
          const isTopFactor = idx < 3;

          return (
            <div
              key={r.param}
              className={`flex items-center gap-2 rounded${isTopFactor ? " border-l-2 border-[#f59e0b] pl-1.5" : ""}`}
            >
              <div className="w-20 text-right text-[10px] font-mono text-neutral-400 shrink-0">
                {r.label}
              </div>
              <div className="flex-1 h-5 relative">
                {/* 中央線（基準値） */}
                <div className="absolute left-1/2 top-0 h-full w-px bg-neutral-600 opacity-40" />
                {/* 左バー（パラメータ変動で日数減少方向） */}
                <div
                  className="absolute top-0.5 h-4 rounded-l bg-[#ef4444] opacity-60"
                  style={{
                    right: "50%",
                    width: `${Math.min(barLeft, 50)}%`,
                  }}
                />
                {/* 右バー（パラメータ変動で日数増加方向） */}
                <div
                  className="absolute top-0.5 h-4 rounded-r bg-[#22c55e] opacity-60"
                  style={{
                    left: "50%",
                    width: `${Math.min(barRight, 50)}%`,
                  }}
                />
              </div>
              <div className="w-16 text-right text-[10px] font-mono shrink-0">
                <span className="text-neutral-300">±{Math.round(r.impact)}</span>
                <span className="text-neutral-600">日</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600">
        <span>← 日数短縮（悪化）</span>
        <span>基準値</span>
        <span>日数延長（改善）→</span>
      </div>
      <p className="text-[10px] font-mono text-neutral-700">
        各仮定を±20%変動させた場合の枯渇/崩壊日数への影響。影響度順にソート。強調表示（左黄線）は上位3因子。
      </p>
    </div>
  );
};
