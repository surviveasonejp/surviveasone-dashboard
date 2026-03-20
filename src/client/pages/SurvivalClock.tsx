import { type FC } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { DataBadge } from "../components/DataBadge";
import { getAllCountdowns } from "../lib/calculations";
import { DATA_SOURCES } from "../lib/dataSources";

export const SurvivalClock: FC = () => {
  const countdowns = getAllCountdowns();
  const worstLevel = countdowns[0]?.alertLevel ?? "safe";

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
          <p>石油: 77,070,000kL ÷ (469,000kL/日 × 91%) ≈ 180.6日</p>
          <DataBadge confidence={DATA_SOURCES.oilReserve.confidence} />
        </div>
        <div className="flex items-center gap-2">
          <p>LNG: 2,300,000t ÷ (173,000t/日 × 22%) ≈ 60.4日</p>
          <DataBadge confidence={DATA_SOURCES.lngInventory.confidence} />
        </div>
        <div className="flex items-center gap-2">
          <p>電力: LNG枯渇 × 火力依存率83% ≈ 50.2日</p>
          <DataBadge confidence={DATA_SOURCES.thermalShare.confidence} />
        </div>
      </div>
    </div>
  );
};
