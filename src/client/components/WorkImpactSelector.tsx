/**
 * WorkImpactSelector — 業種選択→「あなたの仕事への影響」タイムライン
 *
 * IndustryImpactMatrix が政策立案者向け俯瞰ビューなのに対し、
 * このコンポーネントは一般ユーザーが「自分の仕事」を選んで影響を把握するための
 * 逆引き個人化ビュー。確認フレームで「今確認すべき事項」を3点提示する。
 */

import { type FC, useState } from "react";
import type { ScenarioId } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";
import type { ResourceCountdown } from "../../shared/types";
import { FALLBACK_COUNTDOWNS } from "../lib/fallbackCountdowns";

interface Props {
  scenario: ScenarioId;
}

interface OccupationData {
  id: string;
  label: string;
  icon: string;
  /** 石油日数に対する影響開始倍率 */
  constraintFactor: number;
  /** 石油日数に対する本格影響倍率 */
  impactFactor: number;
  description: string;
  impactDetail: string;
  checks: string[];
  priority: "protected" | "high" | "medium" | "low";
}

const OCCUPATIONS: OccupationData[] = [
  {
    id: "medical",
    label: "医療・福祉",
    icon: "🏥",
    constraintFactor: 0.05,
    impactFactor: 0.30,
    description: "医師・看護師・介護士・薬剤師・透析施設",
    impactDetail: "法的優先配分の対象（石油需給適正化法）。燃料・電力は確保されるが、医薬品・消耗品（輸液バッグ・医療チューブ）はナフサ不足で早期に品薄化。輸液バッグのPVC/PE素材が制約の起点。",
    checks: [
      "職場の非常用電源容量・燃料備蓄量を確認し、持続時間を計算する",
      "医薬品・消耗品の在庫水準と代替品リストを今すぐ把握する",
      "透析施設は代替施設リスト・停電時の透析継続計画を事前策定する",
    ],
    priority: "protected",
  },
  {
    id: "food",
    label: "食品・農業",
    icon: "🌾",
    constraintFactor: 0.10,
    impactFactor: 0.25,
    description: "スーパー・農家・飲食・食品製造",
    impactDetail: "物流制限（Day 15〜）で入荷量が減少。包装材（PE/PPフィルム）はナフサ不足で先に品薄化。農業は軽油農機・化学肥料（石化由来）・農業用ビニールが三重制約。冷凍・冷蔵チェーンは停電24時間で品質劣化。",
    checks: [
      "包装材・ラップ・容器の在庫と代替品手配先を確認する",
      "電力バックアップ（自家発電・ポータブル電源）の稼働時間を確認する",
      "農家は収穫物の保管・直販ルートを事前に確認する",
    ],
    priority: "high",
  },
  {
    id: "logistics",
    label: "物流・運輸",
    icon: "🚚",
    constraintFactor: 0.08,
    impactFactor: 0.20,
    description: "トラックドライバー・宅配・タクシー・航空",
    impactDetail: "燃料直接依存のため最初に制限を受ける業種。Day 7〜14で燃料出荷10%制限開始、Day 30前後で奇数偶数制に移行。輸送キャパシティが段階的に縮小し、医療・食料を優先した配送に制限される。",
    checks: [
      "燃料カードの残高・補給拠点の対応状況を確認する",
      "配送ルートの優先順位付けと縮小シナリオを所属会社と確認する",
      "通勤手段を自転車・公共交通に切り替える準備をする",
    ],
    priority: "high",
  },
  {
    id: "manufacturing",
    label: "製造・工場",
    icon: "🏭",
    constraintFactor: 0.20,
    impactFactor: 0.40,
    description: "自動車・電機・化学・繊維・樹脂加工",
    impactDetail: "ナフサ系原料（合成ゴム・樹脂・塗料）不足で減産対象。法的優先度が低く、食料・医療より先に生産調整対象となる。半導体はフォトレジスト・洗浄剤が石化製品依存、超高純度電力が必要。",
    checks: [
      "主要原材料の在庫日数と代替素材の調達可否を確認する",
      "受発注先・取引先への影響を早期に確認・共有する",
      "操業縮小・一時帰休の判断基準を社内で確認する",
    ],
    priority: "medium",
  },
  {
    id: "it",
    label: "IT・テレワーク",
    icon: "💻",
    constraintFactor: 0.15,
    impactFactor: 0.35,
    description: "エンジニア・オフィスワーカー・金融・メディア",
    impactDetail: "データセンターの輪番停電（電力30%削減で発動）でクラウドサービス・決済システムが断続的に停止。Suica/PayPayなどキャッシュレス決済・オンラインバンキングが不安定化。通信インフラも電力依存。",
    checks: [
      "業務データのオフラインバックアップとUPS（無停電電源）の稼働確認をする",
      "テレワーク環境のモバイル回線・ポータブル電源の容量を確認する",
      "決済システムが停止した場合の現金対応フローを確認する",
    ],
    priority: "medium",
  },
  {
    id: "retail",
    label: "小売・サービス",
    icon: "🛒",
    constraintFactor: 0.12,
    impactFactor: 0.28,
    description: "コンビニ・百貨店・飲食・美容・観光",
    impactDetail: "物流停止で在庫が枯渇（コンビニは通常2〜3日分の在庫）。電力制限で営業時間縮小・POSシステム停止・電子決済不可に。飲食は食材入荷停止と電気調理不可が重なる。",
    checks: [
      "POSシステムが停止した場合の手書き伝票・現金対応を準備する",
      "商品在庫の優先順位と販売制限のルールを店舗で確認する",
      "食材・消耗品の代替仕入先を事前にリストアップする",
    ],
    priority: "medium",
  },
  {
    id: "construction",
    label: "建設・土木",
    icon: "🏗️",
    constraintFactor: 0.15,
    impactFactor: 0.30,
    description: "建築士・施工管理・職人・設備工事",
    impactDetail: "重機・発電機の燃料制限で工期遅延。建築資材（樹脂系断熱材・接着剤・塗料）がナフサ依存で品薄化。屋外作業は夏季の冷却・冬季の暖房が制限され熱中症・低体温症リスクが上昇。",
    checks: [
      "現場の燃料備蓄量と重機稼働計画を確認する",
      "工期・工程表を燃料制限シナリオに合わせて見直す",
      "樹脂系資材の代替品と手配先を事前にリストアップする",
    ],
    priority: "low",
  },
  {
    id: "public",
    label: "教育・公務",
    icon: "🏫",
    constraintFactor: 0.18,
    impactFactor: 0.35,
    description: "教員・公務員・学生・研究者",
    impactDetail: "交通手段の制限（ガソリン奇数偶数制）で通勤・通学に影響。学校・役所は施設電力の維持計画次第で業務継続が変わる。対面授業→遠隔移行はデータセンター電力問題と連動するため想定外の支障が起きやすい。",
    checks: [
      "テレワーク・遠隔授業の準備（PC・通信・電源）を確認する",
      "通勤通学ルートの代替手段（自転車・公共交通）を今から確認する",
      "施設の非常用電源・燃料備蓄計画を職場・学校に確認する",
    ],
    priority: "low",
  },
];

const PRIORITY_META: Record<OccupationData["priority"], { label: string; color: string; bg: string }> = {
  protected: { label: "法的優先確保",    color: "#22c55e", bg: "bg-success-soft/10" },
  high:      { label: "早期影響・要対応", color: "#f59e0b", bg: "bg-warning-soft/10" },
  medium:    { label: "中期影響",         color: "var(--color-logistics)", bg: "bg-logistics/10" },
  low:       { label: "段階的影響",        color: "#64748b", bg: "bg-[#64748b]/10" },
};

export const WorkImpactSelector: FC<Props> = ({ scenario }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: countdownData } = useApiData<ResourceCountdown[]>(
    `/api/countdowns?scenario=${scenario}`,
    FALLBACK_COUNTDOWNS,
  );
  const countdowns = countdownData ?? FALLBACK_COUNTDOWNS;

  // 石油の供給余力日数を取得（影響日数の基準値として使用）
  const oilDays = countdowns.find((c) => c.label === "石油備蓄")?.totalDays ?? 200;

  const selected = OCCUPATIONS.find((o) => o.id === selectedId) ?? null;

  // 選択業種の影響日数を計算
  const constraintDay = selected
    ? Math.max(1, Math.round(oilDays * selected.constraintFactor))
    : null;
  const impactDay = selected
    ? Math.max(1, Math.round(oilDays * selected.impactFactor))
    : null;

  const meta = selected ? PRIORITY_META[selected.priority] : null;

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-mono text-xs tracking-widest text-neutral-500">
          WORK IMPACT — あなたの仕事への影響
        </div>
        <div className="text-xs text-neutral-400 font-mono">
          業種を選んで影響タイムラインを確認
        </div>
      </div>

      {/* 業種ボタングリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {OCCUPATIONS.map((occ) => {
          const pm = PRIORITY_META[occ.priority];
          const isSelected = selectedId === occ.id;
          return (
            <button
              key={occ.id}
              type="button"
              onClick={() => setSelectedId(isSelected ? null : occ.id)}
              className={[
                "flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all cursor-pointer min-h-[80px] justify-center",
                isSelected
                  ? `border-current ${pm.bg} shadow-sm`
                  : "border-border hover:border-neutral-300",
              ].join(" ")}
              style={isSelected ? { color: pm.color, borderColor: `${pm.color}60` } : undefined}
            >
              <span className="text-xl leading-none">{occ.icon}</span>
              <span className="font-mono text-xs font-bold leading-tight text-text">
                {occ.label}
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${pm.bg}`} style={{ color: pm.color }}>
                {pm.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 選択後の詳細パネル */}
      {selected && meta && constraintDay !== null && impactDay !== null && (
        <div
          className="rounded-lg p-4 space-y-4 border"
          style={{ borderColor: `${meta.color}35`, backgroundColor: `${meta.color}06` }}
        >
          {/* タイトル行 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl">{selected.icon}</span>
            <div>
              <div className="font-mono font-bold text-sm text-text">{selected.label}</div>
              <div className="text-xs text-neutral-400">{selected.description}</div>
            </div>
            <span
              className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40` }}
            >
              {meta.label}
            </span>
          </div>

          {/* 影響タイムライン */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-panel rounded-lg p-3 border border-border text-center">
              <div className="text-xs text-neutral-400 font-mono mb-1">制約開始</div>
              <div className="font-mono font-bold text-xl" style={{ color: meta.color }}>
                Day {constraintDay}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {scenario}シナリオ試算
              </div>
            </div>
            <div className="bg-panel rounded-lg p-3 border border-border text-center">
              <div className="text-xs text-neutral-400 font-mono mb-1">本格影響</div>
              <div className="font-mono font-bold text-xl text-primary-soft">
                Day {impactDay}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                業務・操業への深刻な影響
              </div>
            </div>
          </div>

          {/* 影響詳細 */}
          <div className="space-y-1.5">
            <div className="font-mono text-xs tracking-wider text-neutral-500">影響内容</div>
            <p className="text-xs text-text-muted leading-relaxed">{selected.impactDetail}</p>
          </div>

          {/* 今確認すべき3点 */}
          <div className="space-y-2">
            <div className="font-mono text-xs tracking-wider" style={{ color: meta.color }}>
              今確認すべき3点
            </div>
            {selected.checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-text">
                <span
                  className="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center font-mono text-[10px] mt-0.5"
                  style={{ borderColor: `${meta.color}50`, color: meta.color }}
                >
                  {i + 1}
                </span>
                <span className="leading-relaxed">{check}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-neutral-400 border-t border-neutral-100 pt-2 leading-relaxed">
            シミュレーション上の推定値です。石油備蓄{Math.round(oilDays)}日を基準に計算。実際の影響は政策介入・代替供給により変動します。
          </p>
        </div>
      )}

      {!selected && (
        <p className="text-xs text-neutral-400 text-center py-2 font-mono">
          業種を選ぶと影響タイムラインと確認事項が表示されます
        </p>
      )}
    </div>
  );
};
