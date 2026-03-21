import { type FC, useState } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { DataBadge } from "../components/DataBadge";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { FlowTimeline } from "../components/FlowTimeline";
import { getAllCountdowns, calcOilDays, calcLngDays, calcPowerDays } from "../lib/calculations";
import { type ScenarioId, DEFAULT_SCENARIO } from "../lib/scenarios";
import { DATA_SOURCES } from "../lib/dataSources";
import { useApiData } from "../hooks/useApiData";
import type { ReservesRow, ConsumptionRow } from "../hooks/useApiData";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";
import { formatNumber } from "../lib/formatters";

export const SurvivalClock: FC = () => {
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const countdowns = getAllCountdowns(scenario);
  const worstLevel = countdowns[0]?.alertLevel ?? "safe";
  const oilDays = calcOilDays(scenario);
  const lngDays = calcLngDays(scenario);
  const powerDays = calcPowerDays(scenario);

  const { data: apiReserves, isFromApi: reservesFromApi } = useApiData<ReservesRow>(
    "/api/reserves",
    null as unknown as ReservesRow,
  );
  const { data: apiConsumption, isFromApi: consumptionFromApi } = useApiData<ConsumptionRow>(
    "/api/consumption",
    null as unknown as ConsumptionRow,
  );

  // API or 静的JSONから表示値を取得
  const oilTotal = apiReserves?.oil_total_kL ?? staticReserves.oil.totalReserve_kL;
  const oilHormuz = apiReserves?.oil_hormuz_rate ?? staticReserves.oil.hormuzDependencyRate;
  const oilDailyKL = apiConsumption?.oil_daily_kL ?? staticConsumption.oil.dailyConsumption_kL;
  const lngInv = apiReserves?.lng_inventory_t ?? staticReserves.lng.inventory_t;
  const lngHormuz = apiReserves?.lng_hormuz_rate ?? staticReserves.lng.hormuzDependencyRate;
  const lngDaily = apiConsumption?.lng_daily_t ?? staticConsumption.lng.dailyConsumption_t;
  const thermalShare = apiReserves?.thermal_share ?? staticReserves.electricity.thermalShareRate;

  const isLive = reservesFromApi || consumptionFromApi;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">
              <span className="text-[#ff1744]">SURVIVAL</span> CLOCK
            </h1>
            {isLive && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30">
                LIVE
              </span>
            )}
          </div>
          <ScenarioSelector selected={scenario} onChange={setScenario} />
        </div>
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

      <FlowTimeline scenarioId={scenario} />

      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 text-xs text-neutral-500 font-mono space-y-2">
        <p className="text-neutral-400 font-bold">
          計算根拠{isLive ? "（D1 データベース）" : "（静的データ）"}:
        </p>
        <div className="flex items-center gap-2">
          <p>石油: {formatNumber(oilTotal)}kL ÷ ({formatNumber(oilDailyKL)}kL/日 × {Math.round(oilHormuz * 100)}%) ≈ {oilDays.toFixed(1)}日</p>
          {DATA_SOURCES.oilReserve && <DataBadge confidence={DATA_SOURCES.oilReserve.confidence} />}
        </div>
        <div className="flex items-center gap-2">
          <p>LNG: {formatNumber(lngInv)}t ÷ ({formatNumber(lngDaily)}t/日 × {(lngHormuz * 100).toFixed(1)}%) ≈ {lngDays.toFixed(1)}日</p>
          {DATA_SOURCES.lngInventory && <DataBadge confidence={DATA_SOURCES.lngInventory.confidence} />}
        </div>
        <div className="flex items-center gap-2">
          <p>電力: LNG枯渇 × 火力依存率{Math.round(thermalShare * 100)}% ≈ {powerDays.toFixed(1)}日</p>
          {DATA_SOURCES.thermalShare && <DataBadge confidence={DATA_SOURCES.thermalShare.confidence} />}
        </div>
      </div>
    </div>
  );
};
