import { type FC, useState } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { RegionMap } from "../components/RegionMap";
import { RegionDetail } from "../components/RegionDetail";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { getAllCountdowns, type RegionCollapse } from "../lib/calculations";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import { useApiData } from "../hooks/useApiData";
import type { ReservesRow } from "../hooks/useApiData";

export const Dashboard: FC = () => {
  const countdowns = getAllCountdowns();
  const regions = useCollapseOrder();
  const [selectedRegion, setSelectedRegion] = useState<RegionCollapse | null>(null);
  const { isFromApi } = useApiData<ReservesRow>("/api/reserves", null as unknown as ReservesRow);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ff1744]">SURVIVE</span> AS ONE
        </h1>
        <div className="flex items-center gap-2">
          {isFromApi && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30">
              LIVE
            </span>
          )}
          <span className="text-xs font-mono text-neutral-500 tracking-wider">
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
