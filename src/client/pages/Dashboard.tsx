import { type FC, useState } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { RegionMap } from "../components/RegionMap";
import { RegionDetail } from "../components/RegionDetail";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { ScenarioSelector } from "../components/ScenarioSelector";
import type { ResourceCountdown, RegionCollapse } from "../../shared/types";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import { useApiData } from "../hooks/useApiData";
import type { ReservesRow } from "../hooks/useApiData";

export const Dashboard: FC = () => {
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const FALLBACK: ResourceCountdown[] = [
    { label: "石油備蓄", totalDays: 168.8, totalSeconds: 168.8 * 86400, alertLevel: "safe" },
    { label: "LNG在庫", totalDays: 750.4, totalSeconds: 750.4 * 86400, alertLevel: "safe" },
    { label: "電力供給", totalDays: 487.8, totalSeconds: 487.8 * 86400, alertLevel: "safe" },
  ];
  const { data: countdownData } = useApiData<ResourceCountdown[]>(
    `/api/countdowns?scenario=${scenario}`,
    FALLBACK,
  );
  const countdowns = countdownData ?? FALLBACK;
  const regions = useCollapseOrder(scenario);
  const [selectedRegion, setSelectedRegion] = useState<RegionCollapse | null>(null);
  const { isFromApi } = useApiData<ReservesRow>("/api/reserves", null as unknown as ReservesRow);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold font-mono">
            <span className="text-[#ff1744]">SURVIVE</span> AS ONE
          </h1>
          {isFromApi && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ScenarioSelector selected={scenario} onChange={setScenario} />
          <span className="text-xs font-mono text-neutral-500 tracking-wider hidden sm:inline">
            INTEGRATED DASHBOARD
          </span>
        </div>
      </div>

      <AlertBanner
        level="critical"
        message="ホルムズ海峡封鎖 — 全システム監視中"
      />

      <SimulationBanner />

      {/* 上段: 3つのカウントダウン */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {countdowns.map((cd) => (
          <CountdownTimer
            key={cd.label}
            label={cd.label}
            totalSeconds={cd.totalSeconds}
            compact
          />
        ))}
      </div>

      {/* 下段: 地図 + 詳細 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#141414] border border-[#2a2a2a] rounded-lg p-4">
          <div className="text-xs font-mono text-neutral-500 tracking-wider mb-2">
            COLLAPSE MAP — 全国10エリア崩壊順
          </div>
          <RegionMap
            regions={regions}
            onSelectRegion={setSelectedRegion}
            selectedId={selectedRegion?.id ?? null}
          />
        </div>
        <div>
          <RegionDetail region={selectedRegion} />
        </div>
      </div>
    </div>
  );
};
