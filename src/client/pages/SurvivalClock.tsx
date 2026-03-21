import { type FC } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { DataBadge } from "../components/DataBadge";
import { getAllCountdowns, calcOilDays, calcLngDays, calcPowerDays } from "../lib/calculations";
import { DATA_SOURCES } from "../lib/dataSources";
import reserves from "../data/reserves.json";
import consumption from "../data/consumption.json";
import { formatNumber } from "../lib/formatters";

export const SurvivalClock: FC = () => {
  const countdowns = getAllCountdowns();
  const worstLevel = countdowns[0]?.alertLevel ?? "safe";
  const oilDays = calcOilDays();
  const lngDays = calcLngDays();
  const powerDays = calcPowerDays();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ff1744]">SURVIVAL</span> CLOCK
        </h1>
        <p className="text-neutral-500 text-sm">
          ホルムズ海峡封鎖時の日本のエネルギー残存日数をリアルタイムでカウントダウン
        </p>
      </div>

      <AlertBanner
        level={worstLevel}
        message="封鎖開始からのカウントダウン — 全リソースが減少中"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {countdowns.map((cd) => (
          <CountdownTimer
            key={cd.label}
            label={cd.label}
            totalSeconds={cd.totalSeconds}
          />
        ))}
      </div>

      <SimulationBanner />

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 text-xs text-neutral-500 font-mono space-y-2">
        <p className="text-neutral-400 font-bold">計算根拠:</p>
        <div className="flex items-center gap-2">
          <p>石油: {formatNumber(reserves.oil.totalReserve_kL)}kL ÷ ({formatNumber(consumption.oil.dailyConsumption_kL)}kL/日 × {Math.round(reserves.oil.hormuzDependencyRate * 100)}%) ≈ {oilDays.toFixed(1)}日</p>
          {DATA_SOURCES.oilReserve && <DataBadge confidence={DATA_SOURCES.oilReserve.confidence} />}
        </div>
        <div className="flex items-center gap-2">
          <p>LNG: {formatNumber(reserves.lng.inventory_t)}t ÷ ({formatNumber(consumption.lng.dailyConsumption_t)}t/日 × {(reserves.lng.hormuzDependencyRate * 100).toFixed(1)}%) ≈ {lngDays.toFixed(1)}日</p>
          {DATA_SOURCES.lngInventory && <DataBadge confidence={DATA_SOURCES.lngInventory.confidence} />}
        </div>
        <div className="flex items-center gap-2">
          <p>電力: LNG枯渇 × 火力依存率{Math.round(reserves.electricity.thermalShareRate * 100)}% ≈ {powerDays.toFixed(1)}日</p>
          {DATA_SOURCES.thermalShare && <DataBadge confidence={DATA_SOURCES.thermalShare.confidence} />}
        </div>
      </div>
    </div>
  );
};
