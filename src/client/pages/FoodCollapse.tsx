import { type FC, useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
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
import { formatDecimal, formatNumber } from "../lib/formatters";
import { SectionHeading } from "../components/SectionHeading";

const EMPTY_SIM: FlowSimulationResult = {
  timeline: [],
  oilDepletionDay: 365,
  lngDepletionDay: 365,
  powerCollapseDay: 365,
  thresholds: [],
};

/** フローシミュレーションの閾値イベントから動的にサプライチェーン崩壊ステップを生成 */
function buildChainSteps(sim: FlowSimulationResult, selectedRegion: RegionCollapse | null): Array<{ label: string; color: string; days: number }> {
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

  // 物流停止: 地域選択時はlogisticsCollapseDaysを使用、未選択時はフォールバック
  const logisticsLimitDay = selectedRegion
    ? Math.round(selectedRegion.logisticsCollapseDays * 0.7)
    : (oilRationingDay ?? Math.round(sim.oilDepletionDay * 0.5));
  const logisticsStopDay = selectedRegion
    ? selectedRegion.logisticsCollapseDays
    : sim.oilDepletionDay;

  const steps: Array<{ label: string; color: string; days: number }> = [
    { label: "ホルムズ海峡リスク発生", color: "#ef4444", days: 0 },
  ];

  if (lastInflowDay > 0) {
    steps.push({ label: `航行中タンカー最終到着（Day ${lastInflowDay}まで入荷継続）`, color: "#94a3b8", days: lastInflowDay });
  }

  steps.push(
    { label: "ナフサ供給制約 → エチレン減産開始", color: "#f59e0b", days: naphthaConstraintDay },
    { label: `物流制限 — 長距離輸送停止${selectedRegion ? `（${selectedRegion.name}）` : ""}`, color: "#8b5cf6", days: logisticsLimitDay },
    { label: "包装材・容器・食品トレーの品薄", color: "#f59e0b", days: packagingShortageDay },
    { label: "石化製品の供給停止（塩ビ・PE・PP）", color: "#ef4444", days: petrochemStopDay },
    { label: "電力崩壊 → 冷蔵停止", color: "#f59e0b", days: sim.powerCollapseDay },
    { label: `物流停止 — 店頭補充停止${selectedRegion ? `（${selectedRegion.name}）` : ""}`, color: "#8b5cf6", days: logisticsStopDay },
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
  const chainSteps = useMemo(() => buildChainSteps(sim, selectedRegion), [sim, selectedRegion]);

  const oilDays = selectedRegion?.oilDepletionDays ?? sim.oilDepletionDay;
  const powerDays = selectedRegion?.powerCollapseDays ?? sim.powerCollapseDay;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold font-mono">
            <span className="text-primary-soft">FOOD CHAIN</span> COLLAPSE
          </h1>
          <ScenarioSelector selected={scenario} onChange={setScenario} />
        </div>
        <p className="text-neutral-500 text-sm">
          何から備えるべきか — 商品カテゴリ別の店頭在庫リスク
        </p>
      </div>

      <AlertBanner
        level="warning"
        message={
          selectedRegion
            ? `${selectedRegion.name}エリアのエネルギー途絶シナリオに基づく食料供給への影響予測`
            : "エネルギー途絶シナリオにおける食料供給への連鎖的影響を可視化"
        }
      />

      {/* エリア選択 */}
      <div data-no-swipe className="bg-panel border border-border rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="font-mono text-xs text-neutral-400 tracking-wider shrink-0">
            電力エリア選択
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegionId(null)}
              className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                selectedRegionId === null
                  ? "border-primary-soft text-primary-soft bg-primary-soft/10"
                  : "border-border text-neutral-500 hover:text-neutral-300 hover:border-[#444]"
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
                      : "border-border text-neutral-500 hover:text-neutral-300 hover:border-[#444]"
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

      {/* 商品別在庫リスク */}
      <div data-screenshot="food-collapse" className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {products.map((product) => {
          const level = getAlertLevel(product.collapseDays);
          const color = getAlertColor(level);
          return (
            <div
              key={product.id}
              className="bg-panel border rounded-lg p-4 space-y-2"
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
                日分の店頭在庫（{scenario === "optimistic" ? "楽観" : scenario === "pessimistic" ? "悲観" : "現実"}シナリオ）
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                {product.collapseReason}
              </p>
            </div>
          );
        })}
      </div>

      {/* ナフサ連鎖説明 */}
      <div className="bg-panel border border-warning-soft/30 rounded-lg p-4 space-y-2">
        <SectionHeading as="h2" tone="warning" tracking="wider">なぜ食品包装が消えるのか</SectionHeading>
        <div className="flex flex-wrap items-center gap-1 text-xs font-mono">
          {[
            { label: "原油", color: "#ef4444" },
            { label: "ナフサ", color: "#f59e0b" },
            { label: "エチレン/PP", color: "#f59e0b" },
            { label: "食品トレー・袋・ラップ", color: "#94a3b8" },
            { label: "食品流通停止", color: "#ef4444" },
          ].map((item, i, arr) => (
            <span key={item.label} className="flex items-center gap-1">
              <span style={{ color: item.color }}>{item.label}</span>
              {i < arr.length - 1 && <span className="text-neutral-600">→</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          ナフサ在庫は約14日分（2026-01経産省統計）。供給制約後5月以降に本格減産→包装材品薄へ。
          対策：ガラス・ステンレス容器への移行と食品バルク購入（包装なしで保存できる状態に）。
        </p>
        <p className="text-xs text-warning-soft/70 leading-relaxed">
          ゴミ袋・ラップ・洗剤・医療用品（注射器・点滴バッグ）も同じルートで枯渇する。「食料不足」ではなく「衛生・包装の崩壊」が先に来る。
        </p>
        {/* 容器が先に消える — キーポイント */}
        <div className="border-t border-border pt-2 mt-1">
          <p className="text-xs text-primary-soft/80 font-mono leading-relaxed">
            ⚠ 「中身ではなく容器が先に消える」 — PETボトル飲料は中身の在庫があっても容器不足で棚から消える。
            食品トレーが入手困難になると精肉・鮮魚の店頭販売が停止し、量り売り・バラ売りに移行する。
          </p>
        </div>
      </div>

      {/* 消費財消滅タイムライン */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">消費財消滅タイムライン</SectionHeading>
        <p className="text-xs text-neutral-600">ナフサ不足が家庭生活に波及する順序。「燃料がない」より「モノが消える」が先に来る。</p>
        <div className="space-y-3">
          {([
            {
              period: "1〜2週間",
              color: "#f59e0b",
              items: [
                { name: "レジ袋・薄手ゴミ袋", reason: "PE製。最初に出荷制限がかかる" },
                { name: "食品用ラップ", reason: "PE製。供給制約後2〜3週で品薄化" },
                { name: "PETボトル飲料", reason: "中身より容器が先に不足。棚から消えるが水は別経路で存在" },
                { name: "プラ製カトラリー", reason: "PP製。代替あり（箸・金属）" },
              ],
            },
            {
              period: "1〜2ヶ月",
              color: "#ef4444",
              items: [
                { name: "おむつ・生理用品", reason: "不織布・高分子吸収体（石化由来）。代替が効かない" },
                { name: "ウェットティッシュ・除菌シート", reason: "不織布（石化由来）" },
                { name: "食品トレー（肉・魚）", reason: "PS製。精肉・鮮魚の店頭販売が停止→量り売りへ" },
                { name: "コンビニ弁当容器・冷凍食品パッケージ", reason: "PP/PE製。コンビニ品揃え激減" },
                { name: "液体洗剤・シャンプー", reason: "界面活性剤（ナフサ由来）。固形石鹸への移行が必要" },
              ],
            },
            {
              period: "2〜3ヶ月",
              color: "#dc2626",
              items: [
                { name: "化繊衣類（ポリエステル・ナイロン）", reason: "石化由来。綿・ウールに回帰するが供給不足" },
                { name: "家電・修理部品", reason: "樹脂部品不足。壊れたら直せない状態に" },
                { name: "宅配便・配送サービス", reason: "包装材不足で荷受け困難。物流崩壊の副作用" },
              ],
            },
            {
              period: "3ヶ月以降",
              color: "#991b1b",
              items: [
                { name: "点滴バッグ・注射器", reason: "国家優先配給対象だが逼迫。産業配給の最優先品目" },
                { name: "水処理薬品", reason: "ポリマー系凝集剤が不足→浄水場に影響" },
              ],
            },
          ] as const).map((phase) => (
            <div key={phase.period} className="space-y-1.5">
              <div
                className="text-xs font-mono font-bold px-2 py-0.5 rounded inline-block"
                style={{ color: phase.color, backgroundColor: `${phase.color}15`, border: `1px solid ${phase.color}40` }}
              >
                {phase.period}
              </div>
              <div className="space-y-1 pl-2">
                {phase.items.map((item) => (
                  <div key={item.name} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
                    <span className="text-xs text-neutral-300 shrink-0">{item.name}</span>
                    <span className="text-[10px] text-neutral-600">— {item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-mono text-neutral-600 border-t border-border pt-2">
          対策: ゴミ袋・ラップは食料より先に確保。おむつ・生理用品は最優先備蓄品目。
          固形石鹸・ガラス/ステンレス容器への移行を今のうちに。
        </p>
      </div>

      {/* 家庭支出への価格転嫁 */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">家庭支出への価格転嫁 — ナフサ価格段階別</SectionHeading>
        <p className="text-xs text-neutral-600">
          ナフサ+40%（¥10万/kL超）は現在進行中の減産フェーズ。+80%以降は在庫枯渇後のシナリオ。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-neutral-600 border-b border-border">
                <th className="px-2 py-1.5 text-left">支出カテゴリ</th>
                <th className="px-2 py-1.5 text-right" style={{ color: "var(--color-warning-soft)" }}>+40%</th>
                <th className="px-2 py-1.5 text-right" style={{ color: "var(--color-primary-soft)" }}>+80%</th>
                <th className="px-2 py-1.5 text-right" style={{ color: "var(--color-primary)" }}>+120%</th>
              </tr>
            </thead>
            <tbody>
              {([
                { category: "食品（加工・冷凍）", p40: "+3〜5%", p80: "+5〜10%", p120: "+10〜20%", bold: false },
                { category: "日用品（洗剤・衛生）", p40: "+10〜20%", p80: "+20〜35%", p120: "+30〜50%", bold: false },
                { category: "衣料品（化繊）", p40: "+5〜10%", p80: "+10〜20%", p120: "+20〜30%", bold: false },
                { category: "自動車・交通", p40: "+5〜8%", p80: "+8〜15%", p120: "+15〜25%", bold: false },
                { category: "家計全体", p40: "+2〜4%", p80: "+4〜7%", p120: "+7〜12%", bold: true },
                { category: "月30万円世帯", p40: "+6,000〜12,000円", p80: "+12,000〜21,000円", p120: "+21,000〜36,000円", bold: true },
              ] satisfies Array<{ category: string; p40: string; p80: string; p120: string; bold: boolean }>).map((row) => (
                <tr key={row.category} className="border-b border-[#0c1018]">
                  <td className={`px-2 py-1.5 ${row.bold ? "text-neutral-200 font-bold" : "text-neutral-400"}`}>{row.category}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: "var(--color-warning-soft)" }}>{row.p40}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: "var(--color-primary-soft)" }}>{row.p80}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: "var(--color-primary)" }}>{row.p120}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] font-mono text-neutral-600 space-y-0.5 border-t border-border pt-2">
          <p><span className="text-warning-soft">+40%（¥10万/kL超）</span>: 減産開始フェーズ — 現在進行中。企業が自主減産して価格転嫁</p>
          <p><span className="text-primary-soft">+80%（¥11〜13万/kL）</span>: 広範囲停止フェーズ — 在庫枯渇後。多くのクラッカーが稼働停止</p>
          <p><span className="text-primary">+120%（¥14万/kL超）</span>: 構造崩壊フェーズ — プラント長期停止・産業配給発動済み</p>
          <p className="text-neutral-700">出典: IEA価格弾力性モデル + 経産省石化産業調査 + 2026年業界減産実績に基づく推計</p>
        </div>
      </div>

      {/* サプライチェーン連鎖図 */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">サプライチェーン崩壊フロー</SectionHeading>
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
      <div className="bg-panel border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SectionHeading as="h2" tone="neutral-muted" size="sm" tracking="wider">
            エリア別食料自給率 — 自給率が高いほど持ちこたえる
          </SectionHeading>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-neutral-500 font-mono text-xs border-b border-border">
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
                      className={`border-b border-border cursor-pointer transition-colors ${
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
                        <div className="w-full h-2 rounded-full bg-border overflow-hidden">
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

      <p className="text-xs text-neutral-600 text-center">
        必要なのは買い占めではなく、わが家に足りないものの確認です。
        <Link to="/prepare" className="text-neutral-500 underline underline-offset-2 hover:text-neutral-400 ml-1">備蓄ガイドを見る →</Link>
      </p>
    </div>
  );
};
