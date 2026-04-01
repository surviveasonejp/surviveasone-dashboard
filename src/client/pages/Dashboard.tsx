import { type FC, useState, useEffect } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { RegionMap } from "../components/RegionMap";
import { RegionDetail } from "../components/RegionDetail";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { ScenarioSelector } from "../components/ScenarioSelector";
import type { ResourceCountdown, RegionCollapse } from "../../shared/types";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import { FALLBACK_COUNTDOWNS, SCENARIO_RANGES } from "../lib/fallbackCountdowns";
import { DataFreshness } from "../components/DataFreshness";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import { useUserRegion } from "../hooks/useUserRegion";
import { useApiData } from "../hooks/useApiData";
import type { ReservesRow } from "../hooks/useApiData";

export const Dashboard: FC = () => {
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const { data: countdownData } = useApiData<ResourceCountdown[]>(
    `/api/countdowns?scenario=${scenario}`,
    FALLBACK_COUNTDOWNS,
  );
  const countdowns = countdownData ?? FALLBACK_COUNTDOWNS;
  const { regions } = useCollapseOrder(scenario);
  const [selectedRegion, setSelectedRegion] = useState<RegionCollapse | null>(null);
  const { isFromApi } = useApiData<ReservesRow>("/api/reserves", null as unknown as ReservesRow);
  const userRegion = useUserRegion();

  useEffect(() => {
    if (userRegion.regionId && !selectedRegion && regions.length > 0) {
      const match = regions.find((r) => r.id === userRegion.regionId);
      if (match) setSelectedRegion(match);
    }
  }, [userRegion.regionId, regions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold font-mono">
            <span className="text-[#ef4444]">SURVIVE</span> AS ONE
          </h1>
          {isFromApi && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
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
        level="warning"
        message="ホルムズ海峡封鎖シナリオ — 公開データに基づく影響度分析"
      />

      <SimulationBanner />

      <DataFreshness />

      {/* 上段: 3つのカウントダウン */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {countdowns.map((cd, i) => (
          <CountdownTimer
            key={cd.label}
            label={cd.label}
            totalSeconds={cd.totalSeconds}
            compact
            range={SCENARIO_RANGES[i]}
            activeScenario={scenario}
          />
        ))}
      </div>

      {/* 下段: 地図 + 詳細 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#151c24] border border-[#1e2a36] rounded-lg p-4">
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

      {/* Xシェア */}
      <button
        className="w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/25 transition-colors"
        onClick={() => {
          let text: string;
          if (selectedRegion) {
            text = [
              `【${selectedRegion.name}の予測】ホルムズ封鎖シナリオ（現実）`,
              `電力崩壊 Day ${selectedRegion.powerCollapseDays} / 食料限界 Day ${selectedRegion.collapseDays}`,
              `脆弱性ランク: ${selectedRegion.vulnerabilityRank}`,
              "",
              "全国10エリアの地域別影響を公開データで可視化 →",
              "surviveasonejp.org/dashboard",
              "",
              "備蓄は、助けが届くまでの時間を稼ぐ手段。わが家に足りないものを確認 → surviveasonejp.org/family",
              "",
              "#ホルムズ海峡 #エネルギー安全保障",
            ].join("\n");
          } else {
            const oil = countdowns.find((c) => c.label === "石油備蓄");
            const lng = countdowns.find((c) => c.label === "LNG在庫");
            const power = countdowns.find((c) => c.label === "電力供給");
            text = [
              "ホルムズ封鎖シナリオ（現実シナリオ）:",
              `石油${oil ? Math.round(oil.totalDays) : "??"}日 / LNG${lng ? Math.round(lng.totalDays) : "??"}日 / 電力${power ? Math.round(power.totalDays) : "??"}日`,
              "",
              "全国10エリアの地域別影響を公開データで可視化 →",
              "surviveasonejp.org/dashboard",
              "",
              "備蓄は、助けが届くまでの時間を稼ぐ手段。わが家に足りないものを確認 → surviveasonejp.org/family",
              "",
              "#ホルムズ海峡 #エネルギー安全保障",
            ].join("\n");
          }
          window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        }}
      >
        X(Twitter)でシェア
      </button>
    </div>
  );
};
