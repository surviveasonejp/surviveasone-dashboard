import { type FC, useState, useMemo } from "react";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { useFoodDepletion } from "../hooks/useFoodDepletion";
import { useCollapseOrder } from "../hooks/useCollapseOrder";
import type { RegionCollapse } from "../../shared/types";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatDepletionDate, formatNumber } from "../lib/formatters";

const CHAIN_STEPS = [
  { label: "ホルムズ海峡封鎖", color: "#ff1744", days: 0 },
  { label: "原油輸入途絶", color: "#ff1744", days: 0 },
  { label: "軽油不足 → 物流停止", color: "#ff5252", days: 14 },
  { label: "ナフサ不足 → 包装停止", color: "#ff9100", days: 30 },
  { label: "電力崩壊 → 冷蔵停止", color: "#ff9100", days: null },
  { label: "スーパー棚 → 空", color: "#ff1744", days: null },
];

export const FoodCollapse: FC = () => {
  const regions = useCollapseOrder();
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const selectedRegion: RegionCollapse | null = useMemo(
    () => regions.find((r) => r.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );

  const products = useFoodDepletion("realistic", selectedRegionId ?? undefined);
  const oilDays = selectedRegion?.oilDepletionDays ?? (products[0]?.collapseDays ?? 168.8);
  const powerDays = selectedRegion?.powerCollapseDays ?? 487.8;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ff5252]">FOOD CHAIN</span> COLLAPSE
        </h1>
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
      <div data-no-swipe className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="font-mono text-xs text-neutral-400 tracking-wider shrink-0">
            電力エリア選択
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegionId(null)}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                selectedRegionId === null
                  ? "border-[#ff5252] text-[#ff5252] bg-[#ff5252]/10"
                  : "border-[#2a2a2a] text-neutral-500 hover:text-neutral-300 hover:border-[#444]"
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
                  onClick={() => setSelectedRegionId(region.id)}
                  className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                    isActive
                      ? "bg-white/10"
                      : "border-[#2a2a2a] text-neutral-500 hover:text-neutral-300 hover:border-[#444]"
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

      {/* 食品消失タイムライン */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {products.map((product) => {
          const level = getAlertLevel(product.collapseDays);
          const color = getAlertColor(level);
          return (
            <div
              key={product.id}
              className="bg-[#141414] border rounded-lg p-4 space-y-2"
              style={{ borderColor: `${color}40` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{product.icon}</span>
                <span className="font-bold text-sm text-neutral-200">{product.name}</span>
              </div>
              <div className="font-mono font-bold text-3xl" style={{ color }}>
                {formatDecimal(product.collapseDays)}
              </div>
              <div className="text-neutral-500 font-mono text-xs">
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
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">サプライチェーン崩壊フロー</h2>
        <div className="flex flex-col gap-1">
          {CHAIN_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-3">
              <div className="w-16 text-right font-mono text-xs text-neutral-500 shrink-0">
                {step.days !== null ? `${step.days}日` : ""}
              </div>
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: step.color }}
              />
              {i < CHAIN_STEPS.length - 1 && (
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
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">
            エリア別食料自給率 — 自給率が高いほど持ちこたえる
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-[#2a2a2a]">
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
                  const barColor = pct >= 75 ? "#00e676" : pct >= 40 ? "#ff9100" : "#ff1744";
                  const isSelected = selectedRegionId === region.id;
                  return (
                    <tr
                      key={region.id}
                      className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${
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
                        <div className="w-full h-2 rounded-full bg-[#2a2a2a] overflow-hidden">
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
