import { type FC, useState, useMemo, useEffect } from "react";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { BlockadeContext } from "../components/BlockadeContext";
import { LocationBar } from "../components/LocationBar";
import { useUserRegion } from "../hooks/useUserRegion";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { useFoodDepletion } from "../hooks/useFoodDepletion";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import { useApiData } from "../hooks/useApiData";
import type { RegionCollapse, FlowSimulationResult } from "../../shared/types";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatDepletionDate, formatNumber } from "../lib/formatters";

const EMPTY_SIM: FlowSimulationResult = {
  timeline: [],
  oilDepletionDay: 365,
  lngDepletionDay: 365,
  powerCollapseDay: 365,
  thresholds: [],
};

/** フローシミュレーションの閾値イベントから動的にサプライチェーン崩壊ステップを生成 */
function buildChainSteps(sim: FlowSimulationResult): Array<{ label: string; color: string; days: number }> {
  const findOilThresholdDay = (type: string): number | null => {
    const ev = sim.thresholds.find((t) => t.resource === "oil" && t.type === type);
    return ev ? ev.day : null;
  };

  const oilRationingDay = findOilThresholdDay("rationing");
  const oilDistributionDay = findOilThresholdDay("distribution");
  const oilPriceSpikeDay = findOilThresholdDay("price_spike");

  // タンカー最終到着 = oilStockがまだ増加している最後の日
  let lastInflowDay = 0;
  for (let i = 1; i < sim.timeline.length; i++) {
    const curr = sim.timeline[i];
    const prev = sim.timeline[i - 1];
    if (curr && prev && curr.oilStock_kL > prev.oilStock_kL) {
      lastInflowDay = curr.day;
    }
  }

  // 石化カスケード: 石油供給制限の前段で発生（ナフサは原油精製の副産物）
  // 価格高騰時点でナフサ調達が困難化し、その後段階的に崩壊
  const naphthaConstraintDay = oilPriceSpikeDay != null
    ? Math.max(oilPriceSpikeDay - 5, 1)
    : Math.round(sim.oilDepletionDay * 0.2);
  const packagingShortageDay = oilRationingDay != null
    ? oilRationingDay
    : Math.round(sim.oilDepletionDay * 0.5);
  const petrochemStopDay = oilDistributionDay != null
    ? oilDistributionDay
    : Math.round(sim.oilDepletionDay * 0.7);

  // 物流停止: 供給制限発令時点
  const logisticsDay = oilRationingDay ?? Math.round(sim.oilDepletionDay * 0.5);

  const steps: Array<{ label: string; color: string; days: number }> = [
    { label: "ホルムズ海峡封鎖", color: "#ef4444", days: 0 },
  ];

  if (lastInflowDay > 0) {
    steps.push({ label: `航行中タンカー最終到着（Day ${lastInflowDay}まで入荷継続）`, color: "#94a3b8", days: lastInflowDay });
  }

  steps.push(
    { label: "ナフサ供給制約 → エチレン減産開始", color: "#f59e0b", days: naphthaConstraintDay },
    { label: "軽油不足 → 物流制限", color: "#ef4444", days: logisticsDay },
    { label: "包装材・容器・食品トレーの品薄", color: "#f59e0b", days: packagingShortageDay },
    { label: "石化製品の供給停止（塩ビ・PE・PP）", color: "#ef4444", days: petrochemStopDay },
    { label: "電力崩壊 → 冷蔵停止", color: "#f59e0b", days: sim.powerCollapseDay },
    { label: "石油枯渇 → スーパー棚が空に", color: "#ef4444", days: sim.oilDepletionDay },
  );

  steps.sort((a, b) => a.days - b.days);
  return steps;
}

export const FoodCollapse: FC = () => {
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const { regions } = useCollapseOrder(scenario);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const userRegion = useUserRegion();

  // 位置情報が取得できたら初期選択に反映（手動選択がなければ）
  useEffect(() => {
    if (userRegion.regionId && !selectedRegionId) {
      setSelectedRegionId(userRegion.regionId);
    }
  }, [userRegion.regionId]);

  const selectedRegion: RegionCollapse | null = useMemo(
    () => regions.find((r) => r.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  const products = useFoodDepletion(scenario, selectedRegionId ?? undefined);
  const { data: simResult } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenario}`,
    EMPTY_SIM,
  );
  const sim = simResult ?? EMPTY_SIM;
  const chainSteps = useMemo(() => buildChainSteps(sim), [sim]);

  const oilDays = selectedRegion?.oilDepletionDays ?? sim.oilDepletionDay;
  const powerDays = selectedRegion?.powerCollapseDays ?? sim.powerCollapseDay;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold font-mono">
            <span className="text-[#ef4444]">FOOD CHAIN</span> COLLAPSE
          </h1>
          <ScenarioSelector selected={scenario} onChange={setScenario} />
        </div>
        <p className="text-neutral-500 text-sm">
          商品カテゴリ別の消失予測 — スーパーの棚はいつ空になるか
        </p>
      </div>

      <AlertBanner
        level="critical"
        message={
          selectedRegion
            ? `${selectedRegion.name}エリアのエネルギー崩壊を起点とした食料消失予測`
            : "エネルギー途絶は食料供給を連鎖崩壊させる"
        }
      />

      {/* エリア選択 */}
      <div data-no-swipe className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="font-mono text-xs text-neutral-400 tracking-wider shrink-0">
            電力エリア選択
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegionId(null)}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                selectedRegionId === null
                  ? "border-[#ef4444] text-[#ef4444] bg-[#ef4444]/10"
                  : "border-[#1e2a36] text-neutral-500 hover:text-neutral-300 hover:border-[#444]"
              }`}
            >
              全国
            </button>
            {regions.map((region) => {
              const isActive = selectedRegionId === region.id;
              const color = getAlertColor(getAlertLevel(region.collapseDays));
              return (
                <button
                  key={region.id}
                  onClick={() => { setSelectedRegionId(region.id); userRegion.setManualRegion(region.id); }}
                  className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                    isActive
                      ? "bg-white/10"
                      : "border-[#1e2a36] text-neutral-500 hover:text-neutral-300 hover:border-[#444]"
                  }`}
                  style={isActive ? { borderColor: color, color } : undefined}
                >
                  {region.name}
                </button>
              );
            })}
          </div>
        </div>
        {selectedRegion && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-mono text-neutral-500">
            <span>
              崩壊予測: <span className="text-neutral-300">{formatDecimal(selectedRegion.collapseDays)}日</span>
            </span>
            <span>
              石油枯渇: <span className="text-neutral-300">{formatDecimal(selectedRegion.oilDepletionDays)}日</span>
            </span>
            <span>
              電力崩壊: <span className="text-neutral-300">{formatDecimal(selectedRegion.powerCollapseDays)}日</span>
            </span>
            <span>
              食料自給率: <span className="text-neutral-300">{formatNumber(Math.round(selectedRegion.foodSelfSufficiency * 100))}%</span>
            </span>
          </div>
        )}
      </div>

      <SimulationBanner />
      <BlockadeContext />
      <LocationBar
        regionName={userRegion.regionName}
        source={userRegion.source}
        loading={userRegion.loading}
        onReset={() => { userRegion.setManualRegion(null); setSelectedRegionId(null); }}
        onRequestGeolocation={userRegion.requestGeolocation}
      />

      {/* 食品消失タイムライン */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {products.map((product) => {
          const level = getAlertLevel(product.collapseDays);
          const color = getAlertColor(level);
          return (
            <div
              key={product.id}
              className="bg-[#151c24] border rounded-lg p-4 space-y-2"
              style={{ borderColor: `${color}40` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{product.icon}</span>
                <span className="font-bold text-sm text-neutral-200">{product.name}</span>
              </div>
              <div className="font-mono font-bold text-3xl" style={{ color }}>
                {formatDecimal(product.collapseDays)}
              </div>
              <div className="text-neutral-400 font-mono text-xs">
                日で消失 — {formatDepletionDate(product.collapseDays)}
              </div>
              <p className="text-[10px] text-neutral-600 leading-relaxed">
                {product.collapseReason}
              </p>
            </div>
          );
        })}
      </div>

      {/* サプライチェーン連鎖図 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">サプライチェーン崩壊フロー</h2>
        <div className="flex flex-col gap-1">
          {chainSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-16 text-right font-mono text-xs text-neutral-500 shrink-0">
                {step.days}日
              </div>
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: step.color }}
              />
              {i < chainSteps.length - 1 && (
                <div
                  className="absolute ml-[4.75rem] mt-6 w-0.5 h-4"
                  style={{ backgroundColor: `${step.color}40` }}
                />
              )}
              <span className="text-sm" style={{ color: step.color }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-neutral-600 font-mono mt-2">
          {selectedRegion ? `${selectedRegion.name}: ` : "全国: "}
          石油枯渇 {formatDecimal(oilDays)}日 / 電力崩壊 {formatDecimal(powerDays)}日
        </div>
      </div>

      {/* エリア別食料自給率 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">
            エリア別食料自給率 — 自給率が高いほど持ちこたえる
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-[#1e2a36]">
                <th className="px-4 py-2 text-left">エリア</th>
                <th className="px-4 py-2 text-right">自給率</th>
                <th className="px-4 py-2 text-left">ゲージ</th>
                <th className="px-4 py-2 text-right">崩壊予測</th>
              </tr>
            </thead>
            <tbody>
              {[...regions]
                .sort((a, b) => b.foodSelfSufficiency - a.foodSelfSufficiency)
                .map((region) => {
                  const pct = Math.min(region.foodSelfSufficiency * 100, 100);
                  const barColor = pct >= 75 ? "#22c55e" : pct >= 40 ? "#f59e0b" : "#ef4444";
                  const isSelected = selectedRegionId === region.id;
                  return (
                    <tr
                      key={region.id}
                      className={`border-b border-[#162029] cursor-pointer transition-colors ${
                        isSelected ? "bg-white/5" : "hover:bg-white/[0.02]"
                      }`}
                      onClick={() => setSelectedRegionId(region.id)}
                    >
                      <td className={`px-4 py-2 font-bold ${isSelected ? "text-white" : "text-neutral-200"}`}>
                        {region.name}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatNumber(Math.round(region.foodSelfSufficiency * 100))}%
                      </td>
                      <td className="px-4 py-2">
                        <div className="w-full h-2 rounded-full bg-[#1e2a36] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: barColor }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-neutral-400">
                        {formatDecimal(region.collapseDays)}日
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
