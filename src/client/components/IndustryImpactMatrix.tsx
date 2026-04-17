/**
 * 産業別ダメージヒートマップ
 *
 * 石油・LNG・電力への依存度をもとに、産業ごとに
 * 「正常 → 制約開始 → 減産 → 停止」の段階的影響を時系列で表示。
 * EconomicCascadeの延長として、横断的な産業比較を可能にする。
 */

import { type FC, useState } from "react";
import type { ScenarioId } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";
import type { ResourceCountdown } from "../../shared/types";
import { FALLBACK_COUNTDOWNS } from "../lib/fallbackCountdowns";

interface Props {
  scenario: ScenarioId;
}

// 産業定義: 石油・LNG・電力への依存度と影響フェーズ日数
interface Industry {
  id: string;
  name: string;
  category: "medical" | "food" | "infra" | "manufacturing" | "export";
  /** 軽油依存度（物流・生産機械）0-1 */
  oilDep: number;
  /** ナフサ/石化依存度 0-1 */
  naphtaDep: number;
  /** 電力依存度 0-1 */
  powerDep: number;
  /** 制約開始日（依存度から算出する基準倍率） */
  constraintFactor: number;
  /** 減産開始日の倍率 */
  reductionFactor: number;
  /** 停止日の倍率 */
  haltFactor: number;
  note: string;
}

const INDUSTRIES: Industry[] = [
  // 医療
  {
    id: "medical_devices",
    name: "医療機器・消耗品",
    category: "medical",
    oilDep: 0.4, naphtaDep: 0.95, powerDep: 0.9,
    constraintFactor: 0.05, reductionFactor: 0.15, haltFactor: 0.30,
    note: "輸液バッグ・医療チューブはPVC/PE依存。ナフサ枯渇で最初に製造停止",
  },
  // 食品
  {
    id: "dairy",
    name: "乳製品・冷蔵食品",
    category: "food",
    oilDep: 0.9, naphtaDep: 0.4, powerDep: 0.95,
    constraintFactor: 0.02, reductionFactor: 0.08, haltFactor: 0.15,
    note: "冷蔵チェーン断絶が致命的。停電24時間で品質劣化開始",
  },
  {
    id: "processed_food",
    name: "加工食品・包装",
    category: "food",
    oilDep: 0.7, naphtaDep: 0.7, powerDep: 0.5,
    constraintFactor: 0.10, reductionFactor: 0.25, haltFactor: 0.45,
    note: "PE/PPフィルム不足で包装停止。小麦在庫は約2.3ヶ月分",
  },
  {
    id: "agriculture",
    name: "農業・食料生産",
    category: "food",
    oilDep: 0.75, naphtaDep: 0.6, powerDep: 0.4,
    constraintFactor: 0.15, reductionFactor: 0.35, haltFactor: 0.60,
    note: "軽油農機・化学肥料（石化由来）・農業用ビニールが三重依存",
  },
  // インフラ
  {
    id: "logistics",
    name: "物流・トラック輸送",
    category: "infra",
    oilDep: 0.98, naphtaDep: 0.1, powerDep: 0.2,
    constraintFactor: 0.08, reductionFactor: 0.20, haltFactor: 0.35,
    note: "軽油直接依存。燃料制限で即座にキャパシティ低下",
  },
  {
    id: "power_thermal",
    name: "火力発電（LNG/石油）",
    category: "infra",
    oilDep: 0.3, naphtaDep: 0.1, powerDep: 0.0,
    constraintFactor: 0.10, reductionFactor: 0.30, haltFactor: 0.65,
    note: "LNG在庫枯渇が電力崩壊に直結。原子力・再エネで一部補完",
  },
  {
    id: "water_treatment",
    name: "水処理・上下水道",
    category: "infra",
    oilDep: 0.3, naphtaDep: 0.5, powerDep: 0.85,
    constraintFactor: 0.15, reductionFactor: 0.40, haltFactor: 0.70,
    note: "凝集剤（ポリアクリルアミド系）はナフサ由来。電力停止で即座に断水",
  },
  // 製造
  {
    id: "automotive",
    name: "自動車・部品",
    category: "manufacturing",
    oilDep: 0.5, naphtaDep: 0.7, powerDep: 0.7,
    constraintFactor: 0.20, reductionFactor: 0.40, haltFactor: 0.55,
    note: "合成ゴム・樹脂部品・塗料がナフサ依存。優先度低く早期に生産調整対象",
  },
  {
    id: "semiconductor",
    name: "半導体・精密電子",
    category: "manufacturing",
    oilDep: 0.2, naphtaDep: 0.8, powerDep: 0.95,
    constraintFactor: 0.15, reductionFactor: 0.30, haltFactor: 0.50,
    note: "フォトレジスト・洗浄剤が石化製品。超高純度電力が必要",
  },
  // 輸出
  {
    id: "chemical_export",
    name: "輸出向け化学製品",
    category: "export",
    oilDep: 0.4, naphtaDep: 0.9, powerDep: 0.6,
    constraintFactor: 0.05, reductionFactor: 0.10, haltFactor: 0.20,
    note: "国内優先配分により最初に出荷割当がゼロに。政府指示で即停止",
  },
];

const CATEGORY_META: Record<Industry["category"], { label: string; color: string }> = {
  medical:       { label: "医療", color: "#22c55e" },
  food:          { label: "食料", color: "#f59e0b" },
  infra:         { label: "インフラ", color: "#2563eb" },
  manufacturing: { label: "製造", color: "var(--color-logistics)" },
  export:        { label: "輸出", color: "#ef4444" },
};

// 日数を受け取り、産業ごとの制約・減産・停止日を計算
function calcImpactDays(
  industry: Industry,
  oilDays: number,
  lngDays: number,
  powerDays: number,
): { constraint: number; reduction: number; halt: number } {
  // 各リソースの影響日数を依存度で加重
  const oilImpact   = oilDays   * (1 - industry.oilDep);
  const naphtaImpact = oilDays  * (1 - industry.naphtaDep) * 0.06;  // ナフサ在庫は石油の約6%
  const powerImpact  = powerDays * (1 - industry.powerDep);

  // ボトルネック（最も早い制約）を採用
  const bottleneck = Math.min(oilImpact, naphtaImpact, powerImpact);

  return {
    constraint: Math.max(1, Math.round(bottleneck + oilDays * industry.constraintFactor)),
    reduction:  Math.max(1, Math.round(bottleneck + oilDays * industry.reductionFactor)),
    halt:       Math.max(1, Math.round(bottleneck + oilDays * industry.haltFactor)),
  };
}

// セル表示: 指定日がどのフェーズか
type Phase = "normal" | "constraint" | "reduction" | "halt";

function getPhase(
  day: number,
  days: { constraint: number; reduction: number; halt: number },
): Phase {
  if (day >= days.halt)       return "halt";
  if (day >= days.reduction)  return "reduction";
  if (day >= days.constraint) return "constraint";
  return "normal";
}

const PHASE_STYLE: Record<Phase, { bg: string; text: string; label: string }> = {
  normal:     { bg: "bg-state-ok-bg",      text: "text-state-ok-text",      label: "正常" },
  constraint: { bg: "bg-state-caution-bg", text: "text-state-caution-text", label: "制約" },
  reduction:  { bg: "bg-state-warn-bg",    text: "text-state-warn-text",    label: "減産" },
  halt:       { bg: "bg-state-halt-bg",    text: "text-state-halt-text",    label: "停止" },
};

const TIMELINE_DAYS = [7, 14, 30, 60, 90, 120, 180, 240];

export const IndustryImpactMatrix: FC<Props> = ({ scenario }) => {
  const { data: countdownData } = useApiData<ResourceCountdown[]>(
    `/api/countdowns?scenario=${scenario}`,
    FALLBACK_COUNTDOWNS,
  );
  const countdowns = countdownData ?? FALLBACK_COUNTDOWNS;

  const oilDays   = Math.round(countdowns.find((c) => c.label === "石油備蓄")?.totalDays ?? 241);
  const lngDays   = Math.round(countdowns.find((c) => c.label === "LNG供給余力")?.totalDays ?? 135);
  const powerDays = Math.round(countdowns.find((c) => c.label === "電力供給")?.totalDays ?? 83);

  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="font-mono text-xs tracking-widest text-neutral-500">
          INDUSTRY IMPACT MATRIX — 産業別供給制約タイムライン
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["normal", "constraint", "reduction", "halt"] as Phase[]).map((p) => (
            <span key={p} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${PHASE_STYLE[p].bg} ${PHASE_STYLE[p].text}`}>
              {PHASE_STYLE[p].label}
            </span>
          ))}
        </div>
      </div>

      {/* カテゴリ凡例 */}
      <div className="flex gap-3 flex-wrap">
        {(Object.entries(CATEGORY_META) as [Industry["category"], typeof CATEGORY_META[Industry["category"]]][]).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
            <span className="text-[10px] text-neutral-500">{meta.label}</span>
          </div>
        ))}
      </div>

      {/* モバイル: 4列簡易ビュー */}
      <div className="sm:hidden space-y-1">
        {INDUSTRIES.map((industry) => {
          const days = calcImpactDays(industry, oilDays, lngDays, powerDays);
          const catMeta = CATEGORY_META[industry.category];
          const isExpanded = expanded === industry.id;
          const MOBILE_DAYS = [7, 30, 90, 180] as const;
          return (
            <div key={industry.id}>
              <button
                className="w-full text-left rounded px-2 py-2 active:bg-white/[0.04] transition-colors"
                onClick={() => setExpanded(isExpanded ? null : industry.id)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catMeta.color }} />
                  <span className="text-xs text-text flex-1 leading-tight">{industry.name}</span>
                  <div className="flex gap-1 shrink-0">
                    {MOBILE_DAYS.map((d) => {
                      const phase = getPhase(d, days);
                      const style = PHASE_STYLE[phase];
                      return (
                        <div key={d} className={`text-[10px] font-mono rounded px-1 py-0.5 ${style.bg} ${style.text} leading-none`}>
                          {d}d
                        </div>
                      );
                    })}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-2 ml-4 space-y-1 text-[10px] text-neutral-500">
                    <p className="leading-relaxed">{industry.note}</p>
                    <div className="flex gap-3 font-mono">
                      <span>制約: <span className="text-warning font-bold">Day {days.constraint}</span></span>
                      <span>減産: <span className="text-reduction font-bold">Day {days.reduction}</span></span>
                      <span>停止: <span className="text-primary font-bold">Day {days.halt}</span></span>
                    </div>
                  </div>
                )}
              </button>
            </div>
          );
        })}
        <p className="text-[10px] text-neutral-500 pt-1">7d / 30d / 90d / 180d 時点のフェーズ。行をタップで詳細表示。</p>
      </div>

      {/* デスクトップ: ヒートマップテーブル */}
      <div className="hidden sm:block overflow-x-auto -mx-4 px-4">
        <table className="w-full text-[10px] font-mono border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left pr-3 pb-2 text-neutral-400 font-normal w-36 whitespace-nowrap">産業</th>
              {TIMELINE_DAYS.map((d) => (
                <th key={d} className="text-center pb-2 text-neutral-400 font-normal px-0.5 whitespace-nowrap">
                  Day{d}
                </th>
              ))}
              <th className="text-left pl-3 pb-2 text-neutral-400 font-normal whitespace-nowrap">制約開始</th>
            </tr>
          </thead>
          <tbody>
            {INDUSTRIES.map((industry) => {
              const days = calcImpactDays(industry, oilDays, lngDays, powerDays);
              const catMeta = CATEGORY_META[industry.category];
              const isExpanded = expanded === industry.id;

              return (
                <>
                  <tr
                    key={industry.id}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setExpanded(isExpanded ? null : industry.id)}
                  >
                    <td className="pr-3 py-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: catMeta.color }} />
                        <span className="text-[10px] text-text leading-tight">{industry.name}</span>
                      </div>
                    </td>
                    {TIMELINE_DAYS.map((d) => {
                      const phase = getPhase(d, days);
                      const style = PHASE_STYLE[phase];
                      return (
                        <td key={d} className="px-0.5 py-1">
                          <div className={`text-center rounded px-1 py-0.5 ${style.bg} ${style.text}`}>
                            {style.label}
                          </div>
                        </td>
                      );
                    })}
                    <td className="pl-3 py-1 text-info whitespace-nowrap">
                      Day {days.constraint}〜
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${industry.id}-detail`}>
                      <td colSpan={TIMELINE_DAYS.length + 2} className="pb-2 pt-0">
                        <div className="ml-4 bg-[#f8fafc] border border-border rounded p-2.5 space-y-1.5 text-[10px]">
                          <div className="text-neutral-600">{industry.note}</div>
                          <div className="flex gap-4 text-neutral-500">
                            <span>制約開始: <span className="text-warning font-bold">Day {days.constraint}</span></span>
                            <span>減産: <span className="text-reduction font-bold">Day {days.reduction}</span></span>
                            <span>停止: <span className="text-primary font-bold">Day {days.halt}</span></span>
                          </div>
                          <div className="flex gap-3 text-neutral-400">
                            <span>石油依存: {Math.round(industry.oilDep * 100)}%</span>
                            <span>ナフサ依存: {Math.round(industry.naphtaDep * 100)}%</span>
                            <span>電力依存: {Math.round(industry.powerDep * 100)}%</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-neutral-400 border-t border-border pt-2 leading-relaxed">
        現在のシナリオ: 石油 {oilDays}日 / LNG {lngDays}日 / 電力 {powerDays}日。
        各産業の影響日数はこれらを元にした推定値。行をタップすると詳細を表示。
        政策介入（SPR放出・配給制）により実際の影響は異なります。
      </p>
    </div>
  );
};
