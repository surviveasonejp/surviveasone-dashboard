import { type FC, useState, useEffect } from "react";
import { RegionMap } from "../components/RegionMap";
import { RegionDetail } from "../components/RegionDetail";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { ScenarioSelector } from "../components/ScenarioSelector";
import type { RegionCollapse, ResourceCountdown } from "../../shared/types";
import { useScenarioParam } from "../hooks/useScenarioParam";
import { FALLBACK_COUNTDOWNS } from "../lib/fallbackCountdowns";
import { DataFreshness } from "../components/DataFreshness";
import { PolicyIntervention } from "../components/PolicyIntervention";
import { SituationActionPanel } from "../components/SituationActionPanel";
import { IndustryImpactMatrix } from "../components/IndustryImpactMatrix";
import { WorkImpactSelector } from "../components/WorkImpactSelector";
import { PrefectureSelector } from "../components/PrefectureSelector";
import { RecoveryTimelineSlider } from "../components/RecoveryTimelineSlider";
import { PhaseIndicator } from "../components/PhaseIndicator";
import { DecisionTriadPanel } from "../components/DecisionTriadPanel";
import { DemandAnomalyBadge } from "../components/DemandAnomalyBadge";
import { MyHypothesisPanel } from "../components/MyHypothesisPanel";
import { HouseholdSummaryCard } from "../components/HouseholdSummaryCard";
import { Badge } from "../components/Badge";
import { PageHero } from "../components/PageHero";
import { SectionHeading } from "../components/SectionHeading";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import { useUserRegion } from "../hooks/useUserRegion";
import { useApiData } from "../hooks/useApiData";
import type { ReservesRow } from "../hooks/useApiData";

export const Dashboard: FC = () => {
  const [scenario, setScenario] = useScenarioParam();
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
      <PageHero
        title={<span className="text-primary-soft">SAO</span>}
        right={<>
          {isFromApi && <Badge tone="success">LIVE</Badge>}
          <ScenarioSelector selected={scenario} onChange={setScenario} />
          <span className="text-xs font-mono text-neutral-500 tracking-wider hidden sm:inline">
            INTEGRATED DASHBOARD
          </span>
        </>}
      />

      <AlertBanner
        level="warning"
        message="ホルムズ海峡リスクシナリオ — 公開データに基づく影響度分析"
      />

      <SimulationBanner />

      <DataFreshness />

      {/* Phase 20-B: 事実 / 解釈 / 含意 の3カラムサマリー（旧 SUPPLY BUFFER + CountdownTimer×3 を統合） */}
      <DecisionTriadPanel scenario={scenario} />

      {/* Phase 22-D: 世帯供給余力サマリー（localStorage の FamilyMeter 入力を使用） */}
      <HouseholdSummaryCard scenario={scenario} />

      {/* Phase 21: 需要異常値シグナル（ブルウィップ効果の可視化） */}
      <DemandAnomalyBadge />

      {/* Phase 20-C: 「私の想定」— localStorage で個人の仮説を保存・比較 */}
      <MyHypothesisPanel scenarioRef={scenario} />

      {/* Phase 20-A: 長期化フェーズ区分 — 全体像を示してから「今確認すべき事項」へ繋ぐ */}
      <PhaseIndicator scenario={scenario} />

      {/* 今確認すべき事項 — シナリオの最初の閾値イベントから行動を提示 */}
      <SituationActionPanel scenario={scenario} />

      {/* 停戦・回復タイムライン（ceasefire時のみ表示） */}
      {scenario === "ceasefire" && <RecoveryTimelineSlider />}

      {/* 政策介入効果比較 */}
      <PolicyIntervention scenario={scenario} />

      {/* 産業別ダメージヒートマップ */}
      <IndustryImpactMatrix scenario={scenario} />

      {/* 業種別「あなたの仕事への影響」 */}
      <WorkImpactSelector scenario={scenario} />

      {/* 下段: 地図 + 詳細 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-panel border border-border rounded-lg p-4">
          <SectionHeading tracking="wider" className="mb-2">
            IMPACT MAP — 全国10エリア供給影響
          </SectionHeading>
          <RegionMap
            regions={regions}
            onSelectRegion={setSelectedRegion}
            selectedId={selectedRegion?.id ?? null}
          />
        </div>
        <div className="space-y-4">
          <RegionDetail region={selectedRegion} />
          <PrefectureSelector
            regions={regions}
            onSelectRegion={setSelectedRegion}
            selectedRegionId={selectedRegion?.id ?? null}
          />
        </div>
      </div>

      {/* Xシェア */}
      <button
        className="w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-x-brand/15 text-x-brand border border-x-brand/30 hover:bg-x-brand/25 transition-colors"
        onClick={() => {
          let text: string;
          if (selectedRegion) {
            text = [
              `【${selectedRegion.name}の予測】ホルムズリスクシナリオ（現実）`,
              `電力制約 Day ${selectedRegion.powerCollapseDays} / 食料影響 Day ${selectedRegion.collapseDays}`,
              `脆弱性ランク: ${selectedRegion.vulnerabilityRank}`,
              "",
              "全国10エリアの地域別影響を公開データで可視化 →",
              "surviveasonejp.org/dashboard",
              "",
              "備蓄は、突発災害でも供給制約（価格高騰・配給）でも、わが家の橋渡しになる。足りないものを確認 → surviveasonejp.org/family",
              "",
              "#ホルムズ海峡 #エネルギー安全保障",
            ].join("\n");
          } else {
            const oil = countdowns.find((c) => c.label === "石油備蓄");
            const lng = countdowns.find((c) => c.label === "LNG供給余力");
            const power = countdowns.find((c) => c.label === "電力供給");
            text = [
              "ホルムズリスクシナリオ（現実シナリオ）:",
              `石油${oil ? Math.round(oil.totalDays) : "??"}日 / LNG${lng ? Math.round(lng.totalDays) : "??"}日 / 電力${power ? Math.round(power.totalDays) : "??"}日`,
              "",
              "全国10エリアの地域別影響を公開データで可視化 →",
              "surviveasonejp.org/dashboard",
              "",
              "備蓄は、突発災害でも供給制約（価格高騰・配給）でも、わが家の橋渡しになる。足りないものを確認 → surviveasonejp.org/family",
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
