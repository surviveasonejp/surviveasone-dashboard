/**
 * 政策介入効果比較カード（インタラクティブ版）
 *
 * /api/simulation の policyEffects を使い、
 * 4つの政策オプションをトグルして組み合わせ効果を確認できる。
 * 加算モデルによる近似計算（相乗効果は含まない）。
 */

import { type FC, useState } from "react";
import { useApiData } from "../hooks/useApiData";
import type { FlowSimulationResult } from "../../shared/types";
import type { ScenarioId } from "../../shared/scenarios";

interface Props {
  scenario: ScenarioId;
}

interface PolicyCard {
  key: keyof Omit<FlowSimulationResult["policyEffects"] & object, "baseline">;
  title: string;
  triggerDay: string;
  description: string;
  primaryResource: "oil" | "lng" | "power";
  sideEffect?: string;
}

const POLICY_CARDS: PolicyCard[] = [
  {
    key: "sprRelease",
    title: "SPR放出 + IEA協調備蓄",
    triggerDay: "Day 14",
    description: "国家石油備蓄を14日リードタイムで放出。IEA加盟国との協調放出を含む。",
    primaryResource: "oil",
    sideEffect: "民間備蓄の一部は即日利用可",
  },
  {
    key: "demandCut10pct",
    title: "燃料消費制限 −10%",
    triggerDay: "Day 7",
    description: "産業・輸送向け燃料出荷を10%制限。奇数偶数制の前段階として発動。",
    primaryResource: "oil",
    sideEffect: "物流コスト上昇・配送遅延",
  },
  {
    key: "emergencyPower15pct",
    title: "緊急節電要請 −15%",
    triggerDay: "Day 3",
    description: "LNG火力の消費を15%削減。大口需要家への節電要請と産業シフト。",
    primaryResource: "lng",
    sideEffect: "製造業への生産調整要請",
  },
  {
    key: "lngSpot",
    title: "LNGスポット緊急調達",
    triggerDay: "Day 21",
    description: "非ホルムズルート（豪州・マレーシア・米国）からのスポット購入。7日分相当。",
    primaryResource: "lng",
    sideEffect: "価格プレミアム +30〜50%",
  },
];

const RESOURCE_LABELS: Record<"oil" | "lng" | "power", string> = {
  oil: "石油",
  lng: "LNG",
  power: "電力",
};

function GainBar({ days, max, highlight }: { days: number; max: number; highlight?: boolean }) {
  const pct = max > 0 ? Math.min((days / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${highlight ? "bg-success-soft" : "bg-info"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const PolicyIntervention: FC<Props> = ({ scenario }) => {
  const [selected, setSelected] = useState<Set<PolicyCard["key"]>>(new Set());

  const { data: simResult } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenario}&maxDays=365`,
    null as unknown as FlowSimulationResult,
  );

  const pe = simResult?.policyEffects;

  // ベースラインとの差分で最大値を計算（バー幅の基準）
  const maxOilGain = pe
    ? Math.max(pe.sprRelease.oilDaysGain, pe.demandCut10pct.oilDaysGain, 1)
    : 1;
  const maxLngGain = pe
    ? Math.max(pe.emergencyPower15pct.lngDaysGain, pe.lngSpot.lngDaysGain, 1)
    : 1;
  const maxPowerGain = pe
    ? Math.max(
        pe.sprRelease.powerDaysGain,
        pe.demandCut10pct.powerDaysGain,
        pe.emergencyPower15pct.powerDaysGain,
        pe.lngSpot.powerDaysGain,
        1,
      )
    : 1;

  function getGains(key: PolicyCard["key"]) {
    if (!pe) return { oil: 0, lng: 0, power: 0 };
    const impact = pe[key];
    return {
      oil: impact.oilDaysGain,
      lng: impact.lngDaysGain,
      power: impact.powerDaysGain,
    };
  }

  function getMaxForResource(resource: "oil" | "lng" | "power") {
    if (resource === "oil") return maxOilGain;
    if (resource === "lng") return maxLngGain;
    return maxPowerGain;
  }

  // 選択された政策の合算効果（加算近似）
  const combinedGains = [...selected].reduce(
    (acc, key) => {
      const g = getGains(key);
      return { oil: acc.oil + g.oil, lng: acc.lng + g.lng, power: acc.power + g.power };
    },
    { oil: 0, lng: 0, power: 0 },
  );

  const hasSelection = selected.size > 0;
  const combinedMaxGain = Math.max(combinedGains.oil, combinedGains.lng, combinedGains.power, 1);

  function toggleCard(key: PolicyCard["key"]) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-mono text-xs tracking-widest text-neutral-500">
          POLICY INTERVENTION — 政策介入の延命効果
        </div>
        <div className="text-[10px] text-neutral-400 font-mono">
          カードを選択して組み合わせ効果を確認
        </div>
      </div>

      {pe && (
        <div className="flex gap-3 text-[11px] text-neutral-500 bg-[#f1f5f9] rounded px-3 py-2 font-mono flex-wrap">
          <span>政策なし:</span>
          <span>石油 Day {pe.baseline.oilDay}</span>
          <span className="text-neutral-300">|</span>
          <span>LNG Day {pe.baseline.lngDay}</span>
          <span className="text-neutral-300">|</span>
          <span>電力 Day {pe.baseline.powerDay}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {POLICY_CARDS.map((card) => {
          const gains = getGains(card.key);
          const primaryGain =
            card.primaryResource === "oil"
              ? gains.oil
              : card.primaryResource === "lng"
                ? gains.lng
                : gains.power;
          const maxGain = getMaxForResource(card.primaryResource);
          const isSelected = selected.has(card.key);

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => toggleCard(card.key)}
              className={[
                "border rounded-lg p-3 space-y-2.5 text-left transition-all cursor-pointer w-full",
                isSelected
                  ? "border-info/60 bg-info/6 shadow-sm"
                  : "border-border hover:border-info/40",
              ].join(" ")}
            >
              {/* ヘッダー */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {/* チェックボックス */}
                  <div
                    className={[
                      "mt-0.5 w-3.5 h-3.5 shrink-0 rounded border transition-colors",
                      isSelected
                        ? "bg-info border-info"
                        : "border-neutral-300 bg-white",
                    ].join(" ")}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 10 10" className="w-full h-full text-white" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-mono text-xs font-bold text-text">
                      {card.title}
                    </div>
                    <div className="text-xs font-mono text-info">
                      発動: {card.triggerDay}
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono font-bold text-lg text-info">
                    +{primaryGain}
                    <span className="text-xs font-normal text-neutral-400">日</span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {RESOURCE_LABELS[card.primaryResource]}延命
                  </div>
                </div>
              </div>

              {/* 主要効果バー */}
              <GainBar days={primaryGain} max={maxGain} />

              {/* 3リソースの詳細 */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {(["oil", "lng", "power"] as const).map((res) => {
                  const val = gains[res];
                  const isMain = res === card.primaryResource;
                  return (
                    <div key={res} className={`rounded px-1 py-0.5 ${isMain ? "bg-info/8" : ""}`}>
                      <div className={`font-mono text-xs font-bold ${val > 0 ? (isMain ? "text-info" : "text-neutral-500") : "text-neutral-300"}`}>
                        {val > 0 ? `+${val}` : "—"}
                      </div>
                      <div className="text-[10px] text-neutral-400">{RESOURCE_LABELS[res]}</div>
                    </div>
                  );
                })}
              </div>

              {/* 説明 */}
              <p className="text-xs text-neutral-500 leading-relaxed">
                {card.description}
              </p>

              {/* 副作用 */}
              {card.sideEffect && (
                <div className="text-xs text-[#d97706] font-mono">
                  ⚠ {card.sideEffect}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 組み合わせ効果サマリー */}
      {hasSelection && pe && (
        <div className="border border-success-soft/40 rounded-lg p-3 bg-success-soft/6 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs font-bold text-success-soft">
              組み合わせ効果（{selected.size}政策）
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-mono text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              クリア
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(["oil", "lng", "power"] as const).map((res) => {
              const val = combinedGains[res];
              const baseline = res === "oil" ? pe.baseline.oilDay : res === "lng" ? pe.baseline.lngDay : pe.baseline.powerDay;
              return (
                <div key={res} className="bg-panel rounded p-2 border border-success-soft/20">
                  <div className="font-mono text-xs text-neutral-500">{RESOURCE_LABELS[res]}</div>
                  <div className="font-mono font-bold text-sm text-success-soft">
                    {val > 0 ? `+${val}日` : "—"}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    → Day {baseline + val}
                  </div>
                </div>
              );
            })}
          </div>
          <GainBar days={combinedGains.oil + combinedGains.lng + combinedGains.power} max={combinedMaxGain * 3} highlight />
          <p className="text-xs text-neutral-400 leading-relaxed">
            加算近似による推定です。実際の相乗効果・干渉はモデルに含まれていません。
          </p>
        </div>
      )}

      {!pe && (
        <div className="text-center text-xs text-neutral-400 py-4 font-mono animate-pulse">
          計算中...
        </div>
      )}

      <p className="text-[10px] text-neutral-400 border-t border-border pt-2 leading-relaxed">
        各政策の効果はシミュレーションモデルによる推定値です。実際の発動タイミング・規模は政策決定に依存します。
      </p>
    </div>
  );
};
