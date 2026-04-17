/**
 * SituationActionPanel — 選択シナリオの最初の閾値イベントから「今確認すべき事項」を表示。
 * カウントダウン直後に置き、「数値を見た → 何をすべきか」の橋渡しをする。
 * 確認フレーム: 購買誘導ではなく「確認行動」を促す。
 */

import { type FC, useMemo } from "react";
import { Link } from "react-router";
import type { FlowSimulationResult, ThresholdType } from "../../shared/types";
import { type ScenarioId } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";

interface Props {
  scenario: ScenarioId;
}

// 最初に表示する閾値の優先順（早期到達 & 影響大のものを優先）
const PRIORITY_TYPES: ThresholdType[] = [
  "price_spike",
  "logistics_limit",
  "rationing",
  "logistics_stop",
  "distribution",
  "water_pressure",
  "water_cutoff",
  "stop",
  "waste_collection",
  "waste_incineration",
  "water_sanitation",
];

interface PhaseData {
  label: string;
  urgency: "normal" | "high" | "critical";
  colorClass: string;
  borderClass: string;
  bgClass: string;
  actions: string[];
}

const PHASE_DATA: Record<ThresholdType, PhaseData> = {
  price_spike: {
    label: "価格上昇フェーズ",
    urgency: "normal",
    colorClass: "text-warning",
    borderClass: "border-warning/30",
    bgClass: "bg-warning/8",
    actions: [
      "処方薬の残量を確認し、2ヶ月分への補充を主治医に相談する",
      "通勤・通学の代替手段（公共交通・自転車ルート）を今のうちに確認する",
      "公的推奨水準（3日分）と自宅備蓄を比較・確認する",
    ],
  },
  logistics_limit: {
    label: "物流制限フェーズ",
    urgency: "high",
    colorClass: "text-[#8b5cf6]",
    borderClass: "border-[#8b5cf6]/30",
    bgClass: "bg-[#8b5cf6]/8",
    actions: [
      "食料・日用品の2〜4週間備蓄量を確認する",
      "処方薬を1〜2ヶ月分まとめて調剤してもらう相談をする",
      "地元スーパー・農家からの直接調達ルートを調べる",
    ],
  },
  rationing: {
    label: "供給制限フェーズ",
    urgency: "high",
    colorClass: "text-primary-soft",
    borderClass: "border-primary-soft/30",
    bgClass: "bg-primary-soft/8",
    actions: [
      "公共交通・自転車・徒歩での代替通勤ルートを確認・実走する",
      "現金5万円以上を手元に確保する（電子決済停止リスク対応）",
      "地域の配給センター・市区町村窓口の場所を確認する",
    ],
  },
  logistics_stop: {
    label: "物流停止フェーズ",
    urgency: "critical",
    colorClass: "text-primary",
    borderClass: "border-primary/30",
    bgClass: "bg-primary/8",
    actions: [
      "残存備蓄量を把握し、1日の消費量を管理する",
      "地域の食料配給・物資支援の情報を自治体から入手する",
      "近隣住民と物資を分かち合い、役割分担を話し合う",
    ],
  },
  distribution: {
    label: "配給制フェーズ",
    urgency: "critical",
    colorClass: "text-primary",
    borderClass: "border-primary/30",
    bgClass: "bg-primary/8",
    actions: [
      "マイナンバーカード・本人確認書類の保管場所を確認する",
      "近隣の要配慮者（高齢者・透析患者）の状況を把握しておく",
      "食料の消費量を記録し、残量管理を始める",
    ],
  },
  stop: {
    label: "供給停止フェーズ",
    urgency: "critical",
    colorClass: "text-primary",
    borderClass: "border-primary/30",
    bgClass: "bg-primary/8",
    actions: [
      "徒歩・自転車圏内での生活に切り替える",
      "水・食料の厳格な管理・記録を開始する（1日分ずつ把握）",
      "地域コミュニティに参加し情報・物資を共有する",
    ],
  },
  water_pressure: {
    label: "水圧低下フェーズ",
    urgency: "high",
    colorClass: "text-info-soft",
    borderClass: "border-info-soft/30",
    bgClass: "bg-info-soft/8",
    actions: [
      "浴槽・容器に水を確保する（1人3L/日 × 最低7日分）",
      "近隣の給水所・給水車の場所を事前確認する",
      "飲料水とトイレ・清拭用水を分けて管理する",
    ],
  },
  water_cutoff: {
    label: "断水フェーズ",
    urgency: "critical",
    colorClass: "text-info-soft",
    borderClass: "border-info-soft/30",
    bgClass: "bg-info-soft/8",
    actions: [
      "浴槽・ポリタンクに確保した水を節約して使う",
      "携帯浄水フィルター・浄水タブレットを準備する",
      "給水所への往復ルートを家族で確認する",
    ],
  },
  water_sanitation: {
    label: "衛生悪化フェーズ",
    urgency: "critical",
    colorClass: "text-info-soft",
    borderClass: "border-info-soft/30",
    bgClass: "bg-info-soft/8",
    actions: [
      "手洗い・食器洗いに消毒液（次亜塩素酸水・アルコール）を代用する",
      "生水の飲用を避け必ず煮沸する",
      "簡易トイレ（凝固剤+ビニール袋）の使用方法を確認する",
    ],
  },
  waste_collection: {
    label: "ゴミ収集停止フェーズ",
    urgency: "normal",
    colorClass: "text-[#64748b]",
    borderClass: "border-[#64748b]/30",
    bgClass: "bg-[#64748b]/8",
    actions: [
      "ゴミ袋を密封し、屋外・日陰の風通しが良い場所に仮置きする",
      "生ゴミは乾燥・脱水してから袋に入れ、臭いと腐敗を抑える",
      "地域の自治体・町内会に仮置き場・収集再開情報を確認する",
    ],
  },
  waste_incineration: {
    label: "焼却停止フェーズ",
    urgency: "high",
    colorClass: "text-[#64748b]",
    borderClass: "border-[#64748b]/30",
    bgClass: "bg-[#64748b]/8",
    actions: [
      "感染リスクのある廃棄物（おむつ・医療廃棄物）は密封し分別管理する",
      "コンポスト・発酵処理で生ゴミを減量する方法を調べる",
      "廃棄物の自家処理ルールを自治体・近隣と共有する",
    ],
  },
};

const EMPTY_RESULT: FlowSimulationResult = {
  timeline: [],
  oilDepletionDay: 365,
  lngDepletionDay: 365,
  powerCollapseDay: 365,
  thresholds: [],
};

const URGENCY_BADGE: Record<PhaseData["urgency"], { label: string; className: string }> = {
  normal:   { label: "確認推奨",   className: "bg-success-soft/15 text-success-soft" },
  high:     { label: "事前準備",   className: "bg-warning/15 text-warning" },
  critical: { label: "重要確認",   className: "bg-primary-soft/15 text-primary-soft" },
};

export const SituationActionPanel: FC<Props> = ({ scenario }) => {
  const { data } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenario}`,
    EMPTY_RESULT,
  );
  const result = data ?? EMPTY_RESULT;

  // PRIORITY_TYPES順で最初の2イベントを抽出
  const { first, second } = useMemo(() => {
    const sorted = [...result.thresholds]
      .filter((t) => t.stockPercent >= 0)
      .sort((a, b) => a.day - b.day);

    const seen = new Set<ThresholdType>();
    const deduped = sorted.filter((t) => {
      if (seen.has(t.type)) return false;
      seen.add(t.type);
      return true;
    });

    const prioritized = deduped.sort(
      (a, b) => PRIORITY_TYPES.indexOf(a.type) - PRIORITY_TYPES.indexOf(b.type),
    );

    return { first: prioritized[0] ?? null, second: prioritized[1] ?? null };
  }, [result.thresholds]);

  // ceasefireシナリオで閾値が遠い（Day90超）場合は「回復フェーズ」表示
  const isRecovery = scenario === "ceasefire" && (first === null || first.day > 90);

  if (isRecovery) {
    return (
      <div className="bg-teal/8 border border-teal/25 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-mono text-xs tracking-widest text-teal">
            SITUATION ACTIONS — 今確認すべき事項
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-teal/15 text-teal">
            停戦・回復フェーズ
          </span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          停戦シナリオでは段階的な供給回復が想定されます。供給余力が戻る過程で確認しておくべき事項:
        </p>
        <div className="space-y-2">
          {[
            "医療機器・透析の補給ルート・備蓄状況を確認する（回復ラグに備える）",
            "使用した備蓄（食料・薬）を徐々に補充し、推奨水準に戻す",
            "燃料価格・物流コストの正常化を確認してから大型購入を検討する",
          ].map((action, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-text">
              <span className="shrink-0 w-5 h-5 rounded-full border border-teal/40 text-teal flex items-center justify-center font-mono text-[10px] mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{action}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-text-muted border-t border-teal/15 pt-2">
          シミュレーション上の推定です。実際の回復状況は政策対応により変動します。
          <Link to="/prepare" className="text-teal ml-1 hover:underline">詳細チェックリスト →</Link>
        </div>
      </div>
    );
  }

  if (!first) {
    return null;
  }

  const phase = PHASE_DATA[first.type];
  const badge = URGENCY_BADGE[phase.urgency];

  return (
    <div className={`border rounded-lg p-4 space-y-3 ${phase.borderClass} ${phase.bgClass}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-mono text-xs tracking-widest text-neutral-500">
          SITUATION ACTIONS — 今確認すべき事項
        </div>
        <span className={`text-xs font-mono px-2 py-0.5 rounded ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* 次のフェーズ予告 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-neutral-400">次のフェーズ:</span>
          <span className={`font-mono text-xs font-bold ${phase.colorClass}`}>
            {phase.label}
          </span>
          <span className="font-mono text-xs text-neutral-500">
            — Day {first.day} 想定
          </span>
        </div>
        {second && (
          <>
            <span className="text-neutral-300 font-mono text-xs">→</span>
            <span className="font-mono text-xs text-neutral-400">
              その後: {PHASE_DATA[second.type]?.label ?? second.type}（Day {second.day}）
            </span>
          </>
        )}
      </div>

      {/* アクション3点 */}
      <div className="space-y-2">
        {phase.actions.map((action, i) => (
          <div key={i} className="flex items-start gap-2.5 text-xs text-text">
            <span className={`shrink-0 w-5 h-5 rounded-full border ${phase.borderClass} ${phase.colorClass} flex items-center justify-center font-mono text-[10px] mt-0.5`}>
              {i + 1}
            </span>
            <span className="leading-relaxed">{action}</span>
          </div>
        ))}
      </div>

      {/* フッター */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-t border-neutral-200 pt-2">
        <p className="text-xs text-text-muted leading-relaxed">
          シミュレーション上の推定値です。備蓄放出・代替供給により変動します。
        </p>
        <Link
          to="/prepare"
          className="text-xs font-mono text-info hover:underline shrink-0"
        >
          詳細チェックリスト →
        </Link>
      </div>
    </div>
  );
};
