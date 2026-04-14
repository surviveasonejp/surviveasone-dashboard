import { type FC, useState } from "react";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { DataBadge } from "../components/DataBadge";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { FlowTimeline } from "../components/FlowTimeline";
import { EconomicCascade } from "../components/EconomicCascade";
import { BlockadeContext } from "../components/BlockadeContext";
import type { ResourceCountdown, FlowSimulationResult } from "../../shared/types";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import { FALLBACK_COUNTDOWNS, SCENARIO_RANGES } from "../lib/fallbackCountdowns";
import { DATA_SOURCES } from "../lib/dataSources";
import { DataFreshness } from "../components/DataFreshness";
import { UpdateLog } from "../components/UpdateLog";
import { useApiData } from "../hooks/useApiData";
import type { ReservesRow, ConsumptionRow } from "../hooks/useApiData";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";
import { formatNumber } from "../lib/formatters";

export const SurvivalClock: FC = () => {
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);

  // サーバー側で計算済みのカウントダウンを取得
  const { data: countdowns, isFromApi: countdownsFromApi } = useApiData<ResourceCountdown[]>(
    `/api/countdowns?scenario=${scenario}`,
    FALLBACK_COUNTDOWNS,
  );
  const displayCountdowns = countdowns ?? FALLBACK_COUNTDOWNS;
  const worstLevel = displayCountdowns[0]?.alertLevel ?? "safe";

  // フローシミュレーション結果（経済カスケード用）
  const EMPTY_SIM: FlowSimulationResult = { timeline: [], oilDepletionDay: 365, lngDepletionDay: 365, powerCollapseDay: 365, thresholds: [] };
  const { data: simResult } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenario}`,
    EMPTY_SIM,
  );

  // WTI原油価格（EIA日次取得）
  const { data: oilPriceData } = useApiData<{ wti_usd: number; date: string }>(
    "/api/oil-price",
    null as unknown as { wti_usd: number; date: string },
  );

  // 計算根拠の表示用データ（生データ）
  const { data: apiReserves, isFromApi: reservesFromApi } = useApiData<ReservesRow>(
    "/api/reserves",
    null as unknown as ReservesRow,
  );
  const { data: apiConsumption, isFromApi: consumptionFromApi } = useApiData<ConsumptionRow>(
    "/api/consumption",
    null as unknown as ConsumptionRow,
  );

  const oilTotal = apiReserves?.oil_total_kL ?? staticReserves.oil.totalReserve_kL;
  const oilHormuz = apiReserves?.oil_hormuz_rate ?? staticReserves.oil.hormuzDependencyRate;
  const oilDailyKL = apiConsumption?.oil_daily_kL ?? staticConsumption.oil.dailyConsumption_kL;
  const lngInv = apiReserves?.lng_inventory_t ?? staticReserves.lng.inventory_t;
  const lngHormuz = apiReserves?.lng_hormuz_rate ?? staticReserves.lng.hormuzDependencyRate;
  const lngDaily = apiConsumption?.lng_daily_t ?? staticConsumption.lng.dailyConsumption_t;
  const thermalShare = apiReserves?.thermal_share ?? staticReserves.electricity.thermalShareRate;

  const isLive = countdownsFromApi || reservesFromApi || consumptionFromApi;

  // 個別日数（計算根拠表示用）
  const oilDays = displayCountdowns[0]?.totalDays ?? 0;
  const lngDays = displayCountdowns[1]?.totalDays ?? 0;
  const powerDays = displayCountdowns[2]?.totalDays ?? 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">
              <span className="text-[#ef4444]">SURVIVAL</span> CLOCK
            </h1>
            {isLive && (
              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
                LIVE
              </span>
            )}
          </div>
          <ScenarioSelector selected={scenario} onChange={setScenario} />
        </div>
        <p className="text-neutral-500 text-sm">
          ホルムズ海峡リスクシナリオにおける日本のエネルギー残存日数をリアルタイムでカウントダウン
        </p>
      </div>

      <AlertBanner
        level={worstLevel}
        message="供給危機カウントダウン — 全リソースが減少中"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {displayCountdowns.map((cd, i) => (
          <CountdownTimer
            key={cd.label}
            label={cd.label}
            totalSeconds={cd.totalSeconds}
            range={SCENARIO_RANGES[i]}
            activeScenario={scenario}
          />
        ))}
      </div>

      {/* LNG供給余力モデル説明 */}
      <div className="bg-panel border border-[#2563eb]/20 rounded-lg p-4 space-y-2">
        <p className="font-mono text-xs font-bold text-accent">LNG供給余力について</p>
        <p className="text-xs text-text-muted leading-relaxed">
          日本のLNG輸入のホルムズ海峡依存は<span className="font-mono font-bold text-text">{(lngHormuz * 100).toFixed(1)}%</span>（カタール・UAE）のみ。
          豪州39.7%・マレーシア14.8%・ロシア8.9%等の非ホルムズルートは封鎖下でも継続供給します。
          表示値は在庫（約{Math.round(lngInv / 10000)}万t、物理貯蔵量 <span className="font-mono font-bold text-text">約{Math.round(lngInv / lngDaily)}日分</span>）が毎日の{(lngHormuz * 100).toFixed(1)}%不足分を補填できる日数です。
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          ※ LNGの実際のリスクは供給量よりも価格高騰・保険料急騰・船舶退避による非ホルムズルートへの波及です。封鎖下でも電力用LNG供給は当面維持されますが、コスト上昇は電気代に転嫁されます。
        </p>
      </div>

      <SimulationBanner />
      <BlockadeContext />

      <FlowTimeline scenarioId={scenario} />

      {simResult && simResult.timeline.length > 0 && (
        <EconomicCascade simulation={simResult} wtiPriceUsd={oilPriceData?.wti_usd} />
      )}

      <div className="bg-panel border border-border rounded-lg p-4 text-xs text-neutral-500 font-mono space-y-2">
        <p className="text-neutral-400 font-bold">
          計算根拠{isLive ? "（D1 データベース）" : "（静的データ）"}:
        </p>
        <div className="flex items-center gap-2">
          <p>石油: {formatNumber(oilTotal)}kL ÷ ({formatNumber(oilDailyKL)}kL/日 × {Math.round(oilHormuz * 100)}%) ≈ {oilDays.toFixed(1)}日</p>
          {DATA_SOURCES.oilReserve && <DataBadge confidence={DATA_SOURCES.oilReserve.confidence} />}
        </div>
        <p className="text-neutral-600 text-xs">出典: 経産省 石油備蓄推計量({staticReserves.meta.baselineDate}) / OWID energy-data</p>
        <div className="flex items-center gap-2">
          <p>LNG供給余力: 在庫{formatNumber(lngInv)}t ÷ ({formatNumber(lngDaily)}t/日 × ホルムズ依存{(lngHormuz * 100).toFixed(1)}%) ≈ {lngDays.toFixed(1)}日（非ホルムズ{Math.round((1 - lngHormuz) * 100)}%継続前提）</p>
          {DATA_SOURCES.lngInventory && <DataBadge confidence={DATA_SOURCES.lngInventory.confidence} />}
        </div>
        <p className="text-neutral-600 text-xs">物理貯蔵量: 在庫{formatNumber(lngInv)}t ÷ 日量{formatNumber(lngDaily)}t ≈ {Math.round(lngInv / lngDaily)}日（完全途絶時）</p>
        <p className="text-neutral-600 text-xs">出典: 経産省ガス事業統計 / JETRO貿易統計(2025年)</p>
        <div className="flex items-center gap-2">
          <p>電力: LNG枯渇 × 火力依存率{Math.round(thermalShare * 100)}% ≈ {powerDays.toFixed(1)}日</p>
          {DATA_SOURCES.thermalShare && <DataBadge confidence={DATA_SOURCES.thermalShare.confidence} />}
        </div>
        <p className="text-neutral-600 text-xs">出典: ISEP 電力調査統計(2024年暦年速報) / 原子力規制委員会</p>
        <div className="pt-2 border-t border-border mt-2">
          <DataFreshness />
        </div>
        <div className="pt-2 border-t border-border mt-2">
          <UpdateLog />
        </div>
      </div>

      {/* Xシェア */}
      <button
        className="w-full py-2.5 px-4 rounded-lg text-xs font-mono font-bold bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/25 transition-colors"
        onClick={() => {
          const blockadeStart = new Date("2026-03-01");
          const dayOffset = Math.floor((Date.now() - blockadeStart.getTime()) / 86400000);
          const oil = displayCountdowns.find((c) => c.label === "石油備蓄");
          const lng = displayCountdowns.find((c) => c.label === "LNG供給余力");
          const power = displayCountdowns.find((c) => c.label === "電力供給");
          const oilRange = SCENARIO_RANGES[0];
          const powerRange = SCENARIO_RANGES[2];
          const text = [
            `発生後${dayOffset}日のシミュレーション。`,
            "",
            `石油${oil ? Math.round(oil.totalDays) : "??"}日 / LNG${lng ? Math.round(lng.totalDays) : "??"}日 / 電力${power ? Math.round(power.totalDays) : "??"}日（現実シナリオ・備蓄放出込み）`,
            `3シナリオ: 石油 Day ${oilRange?.optimistic ?? "?"}〜${oilRange?.pessimistic ?? "?"}、電力 Day ${powerRange?.optimistic ?? "?"}〜${powerRange?.pessimistic ?? "?"}`,
            "",
            "シミュレーション詳細 → surviveasonejp.org/countdown",
            "",
            "備蓄は、助けが届くまでの時間を稼ぐ手段。わが家に足りないものを確認 → surviveasonejp.org/family",
            "",
            "#ホルムズ海峡 #エネルギー安全保障",
          ].join("\n");
          window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
        }}
      >
        X(Twitter)でシェア
      </button>
    </div>
  );
};
