import { type FC, useState } from "react";
import { Link } from "react-router-dom";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { BlockadeContext } from "../components/BlockadeContext";
import { useFamilySurvival } from "../hooks/useFamilySurvival";
import { useUserRegion } from "../hooks/useUserRegion";
import { useScenarioParam } from "../hooks/useScenarioParam";
import { useRecentRealEvents } from "../hooks/useRecentRealEvents";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { SCENARIOS } from "../../shared/scenarios";
import type { FamilyInputs, SurvivalMode } from "../../shared/types";
import {
  getSurvivalRankColor,
  getSurvivalRankLabel,
  getAlertLevel,
} from "../lib/alertHelpers";
import { formatDecimal, formatDepletionDate } from "../lib/formatters";
import {
  REGION_PROFILES,
  getRegionProfile,
  getAreaAdvice,
} from "../lib/regionAdvice";
import { PageHero } from "../components/PageHero";
import { SectionHeading } from "../components/SectionHeading";
import {
  STATUS_BY_SCENARIO,
  STATUS_LABEL,
  STATUS_COLOR,
  INFLATION_BY_SCENARIO,
  RESOURCE_STATUS_UPDATED_AT,
} from "../lib/resourceStatus";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

const InputSlider: FC<SliderProps> = ({ label, value, min, max, step, unit, onChange }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono font-bold text-text">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={`${label}: ${value}${unit}`}
      className="w-full h-2 rounded-full appearance-none bg-border cursor-pointer"
    />
    <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
      <span>{min}{unit}</span>
      <span>{max}{unit}</span>
    </div>
  </div>
);

const RANK_ADVICE: Record<string, string[]> = {
  S: ["十分な供給余力があります。近隣への支援も検討できるレベルです"],
  A: ["良好な備蓄状況です。水の補充サイクルを維持してください"],
  B: ["基本的な備えはありますが、2週間超の制約局面には不十分。カセットボンベと水の過不足を確認してください"],
  C: ["1週間程度で供給余力が尽きる見込みです。水と食料の過不足を優先的に確認してください"],
  D: ["備蓄が不足しています。一度に全部揃える必要はありません。まず「水の残量」を確認するところから始めましょう"],
  F: ["備蓄がほぼありません。まず飲料水の状況を確認してください"],
};

/** ボトルネック種別 × 残り日数 → 緊急アクション（3項目） */
const BOTTLENECK_URGENT_ACTIONS: Record<string, string[]> = {
  水: [
    "水の備蓄量を確認し、不足分を把握する（目安: 1人3L/日）",
    "近隣の給水所・給水スポットの場所を事前に確認しておく",
    "飲料以外（トイレ・清拭）は雨水・生活排水で代替する手段を調べておく",
  ],
  食料: [
    "残存食料のカロリーを把握し、1日摂取量を記録する",
    "主食（米・缶詰・乾麺）の過不足を確認する（目安: 1人5日分）",
    "地域の食料配給・フードバンク情報を自治体ウェブで確認する",
  ],
  燃料: [
    "カセットボンベの残量を確認する（目安: 1人3本/週）",
    "魔法瓶保温・電気ケトル等でガス消費量を減らす方法を確認する",
    "近隣の給油所の在庫状況と割当制限を確認する",
  ],
  電力: [
    "スマートフォン・ラジオ・モバイルバッテリーの残量を確認する",
    "充電式ランタン・ヘッドライトの電池残量を確認する",
    "在宅医療機器がある場合、病院・クリニックへ電力確保方法を事前に相談する",
  ],
  "医療・衛生": [
    "処方薬の残薬日数を確認する（慢性疾患がある場合は90日分を目安に主治医と相談）",
    "マスク・消毒薬・使い捨て手袋の残数を確認する（メーカー受注制限が先行発火する品目）",
    "おむつ・生理用品・経口補水液・体温計等、代替困難な衛生用品の過不足を確認する",
  ],
};

const STORAGE_KEY = "familyMeterInputs";

const DEFAULT_INPUTS: FamilyInputs = {
  members: 3,
  waterLiters: 36,
  foodDays: 7,
  gasCanisterCount: 6,
  batteryWh: 500,
  solarWatts: 0,
  hasMedicalDevice: false,
  cashYen: 30000,
  medicalSupplyDays: 7,
  mode: "constraint",
};

const MODE_META: Record<SurvivalMode, { label: string; short: string; note: string }> = {
  disaster: {
    label: "突発災害（地震・台風）",
    short: "突発災害",
    note: "外部供給ゼロの前提で、公的支援が届くまでの窓を計算します",
  },
  constraint: {
    label: "供給制約（ホルムズ型）",
    short: "供給制約",
    note: "部分供給が続く前提で、価格高騰・配給下での延命日数を計算します（realistic シナリオ相当）",
  },
};

function loadInputs(): FamilyInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_INPUTS;
    return { ...DEFAULT_INPUTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_INPUTS;
  }
}

export const FamilyMeter: FC = () => {
  const [inputs, setInputs] = useState<FamilyInputs>(loadInputs);
  const [subsidyApplied, setSubsidyApplied] = useState(true);
  const { regionId, setManualRegion } = useUserRegion();
  const [scenarioId, setScenarioId] = useScenarioParam();
  const scenarioMeta = SCENARIOS[scenarioId];
  const inflation = INFLATION_BY_SCENARIO[scenarioId];
  const resourceStatus = STATUS_BY_SCENARIO[scenarioId];

  const score = useFamilySurvival(inputs, scenarioId);
  const { response: recentEventsData, isFromApi: eventsFromApi } = useRecentRealEvents(30);
  const recentEvents = recentEventsData.events.slice(0, 5);
  const rankColor = getSurvivalRankColor(score.rank);
  const rankLabel = getSurvivalRankLabel(score.rank);

  const update = (key: keyof FamilyInputs) => (value: number) =>
    setInputs((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const setMode = (mode: SurvivalMode) =>
    setInputs((prev) => {
      const next = { ...prev, mode };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const breakdowns = [
    { label: "水", days: score.waterDays, color: isLight ? "#3b82f6" : "#94a3b8" },
    { label: "食料", days: score.foodDays, color: isLight ? "#16a34a" : "#4ade80" },
    { label: "燃料", days: score.energyDays, color: isLight ? "#d97706" : "#f59e0b" },
    { label: "電力", days: score.powerDays, color: isLight ? "#7c3aed" : "#94a3b8" },
    { label: "医療・衛生", days: score.medicalDays, color: isLight ? "#dc2626" : "#f87171" },
  ];

  const maxDays = Math.max(...breakdowns.map((b) => b.days), 30);

  return (
    <div className="space-y-6">
      <PageHero
        title={<><span className="text-warning-soft">HOUSEHOLD</span> SUPPLY CHECK</>}
        subtitle={
          inputs.mode === "constraint"
            ? "価格高騰・配給下でわが家の供給余力を確認する（参考ツール）"
            : "公的支援が届くまでの間、わが家の供給余力を確認する（参考ツール）"
        }
      />

      {/* モード切替: 突発災害 / 供給制約 */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <SectionHeading as="h2" tone="text-muted" size="sm" tracking="wider">
            想定する状況
          </SectionHeading>
          <span className="text-[10px] text-text-muted font-mono">
            現在: {MODE_META[inputs.mode].short}モード
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(["disaster", "constraint"] as const).map((m) => {
            const active = inputs.mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={active}
                className={`text-left p-3 rounded border transition-colors min-h-[56px] ${
                  active
                    ? "border-accent bg-accent/10 text-text"
                    : "border-border text-text-muted hover:border-neutral-400"
                }`}
              >
                <div className={`text-sm font-bold ${active ? "text-accent" : "text-text"}`}>
                  {MODE_META[m].label}
                </div>
                <div className="text-[10px] mt-1 leading-snug">{MODE_META[m].note}</div>
              </button>
            );
          })}
        </div>

        {inputs.mode === "constraint" && (
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[10px] font-mono text-text-muted tracking-wider">
                想定シナリオ
              </span>
              <ScenarioSelector selected={scenarioId} onChange={setScenarioId} />
            </div>
            <p className="text-[10px] text-text-muted leading-snug">
              {scenarioMeta.description}
            </p>
          </div>
        )}
      </div>

      <AlertBanner
        level={getAlertLevel(score.totalDays)}
        message={`供給余力: ${formatDecimal(score.totalDays)}日分（目安・${MODE_META[inputs.mode].short}モード） — 最短項目: ${score.bottleneck}`}
      />

      {/* 自主判断前提バナー（constraintモード時のみ） */}
      {inputs.mode === "constraint" && (
        <div className="bg-bg border border-info/30 rounded-lg p-3">
          <p className="text-xs text-text-muted leading-relaxed">
            <span className="font-bold text-info">政府は消費自粛を要請していません</span>
            （2026-04-07 高市首相「電力・ガソリン消費の自粛要請はしない」経済維持方針）。
            このモードは政策介入なし前提の<span className="text-text">自主判断の目安</span>です。
            買い占めは最も脆弱な人から物資を奪うため、まず過不足の確認から始めてください。
          </p>
        </div>
      )}

      <SimulationBanner />
      <BlockadeContext />

      {/* 直近の関連イベント（constraint モード時・APIから取得） */}
      {inputs.mode === "constraint" && recentEvents.length > 0 && (
        <div className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionHeading as="h2" tone="text-muted" size="sm" tracking="wider">
              直近30日の関連イベント
            </SectionHeading>
            <span className="text-[9px] font-mono text-text-muted">
              全{recentEventsData.count}件 / 表示{recentEvents.length}件
              {!eventsFromApi && " (キャッシュ)"}
            </span>
          </div>
          <ul className="space-y-2">
            {recentEvents.map((ev, i) => (
              <li key={`${ev.date}-${i}`} className="flex gap-2 text-xs">
                <span className="font-mono text-text-muted shrink-0 w-20">{ev.date}</span>
                <span className="text-[10px] font-mono px-1.5 rounded border border-border text-text-muted shrink-0 self-start mt-0.5">
                  {ev.category}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-text leading-snug">{ev.label}</div>
                  {ev.affectedPopulation && (
                    <div className="text-[10px] text-primary-soft font-mono mt-0.5" title={ev.affectedPopulation.source}>
                      影響: {ev.affectedPopulation.label}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-text-muted leading-snug pt-1 border-t border-border">
            供給制約の根拠となる実イベント。ステータス判定の補助情報として参照できます。
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: 入力フォーム */}
        <div className="bg-panel border border-border rounded-lg p-6 space-y-5">
          <SectionHeading as="h2" tone="text-muted" size="sm" tracking="wider">備蓄入力</SectionHeading>
          <InputSlider label="世帯人数" value={inputs.members} min={1} max={10} step={1} unit="人" onChange={update("members")} />
          <InputSlider label="水備蓄" value={inputs.waterLiters} min={0} max={500} step={5} unit="L" onChange={update("waterLiters")} />
          <InputSlider label="食料備蓄" value={inputs.foodDays} min={0} max={90} step={1} unit="日分" onChange={update("foodDays")} />
          <InputSlider label="カセットボンベ" value={inputs.gasCanisterCount} min={0} max={100} step={1} unit="本" onChange={update("gasCanisterCount")} />
          <InputSlider label="ポータブル電源" value={inputs.batteryWh} min={0} max={5000} step={50} unit="Wh" onChange={update("batteryWh")} />
          <InputSlider label="ソーラーパネル" value={inputs.solarWatts} min={0} max={500} step={10} unit="W" onChange={update("solarWatts")} />
          <InputSlider
            label="医療・衛生物資"
            value={inputs.medicalSupplyDays}
            min={0}
            max={90}
            step={1}
            unit="日分"
            onChange={update("medicalSupplyDays")}
          />
          <p className="text-[10px] text-text-muted -mt-3">
            処方薬・マスク・消毒薬・使い捨て手袋・経口補水液等。ホルムズ型ではパニック買いで先行逼迫
          </p>
          <div className="flex items-center gap-3 min-h-[44px]">
            <button
              className={`w-6 h-6 rounded border flex items-center justify-center transition-colors shrink-0 ${
                inputs.hasMedicalDevice
                  ? "bg-primary-soft border-primary-soft"
                  : "border-border hover:border-neutral-500"
              }`}
              onClick={() => {
                const next = { ...inputs, hasMedicalDevice: !inputs.hasMedicalDevice };
                setInputs(next);
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
              }}
            >
              {inputs.hasMedicalDevice && <span className="text-white text-xs font-bold">✓</span>}
            </button>
            <div>
              <span className="text-sm text-text">在宅医療機器を使用</span>
              <span className="text-[10px] text-text-muted ml-2">（人工呼吸器・吸引器等 → 電力消費10倍で計算）</span>
            </div>
          </div>
          <InputSlider label="現金" value={inputs.cashYen} min={0} max={1000000} step={10000} unit="円" onChange={update("cashYen")} />
          <p className="text-xs text-text-muted">※ 現金は参考情報です。供給余力の計算には含まれません（配給制移行時の購買力指標）</p>
          <p className="text-xs text-text-muted leading-relaxed">
            入力データはこのブラウザ内でのみ保存・計算されます。サーバーへの送信は行いません。
          </p>
        </div>

        {/* 右: スコアカード */}
        <div className="space-y-4">
          {/* ランク表示 */}
          <div
            className="bg-panel border rounded-lg p-6 text-center space-y-3"
            style={{ borderColor: `${rankColor}40` }}
          >
            <div className="text-xs font-mono text-text-muted tracking-wider" id="rank-label" data-screenshot="family-rank">SUPPLY RANK</div>
            <div
              className="font-mono font-bold text-8xl"
              style={{ color: rankColor }}
              role="status"
              aria-labelledby="rank-label"
              aria-label={`供給ランク${score.rank}、${rankLabel}、供給余力${formatDecimal(score.totalDays)}日分`}
            >
              {score.rank}
            </div>
            <div className="font-mono text-sm" style={{ color: rankColor }}>
              {rankLabel}
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="font-mono font-bold text-3xl text-text">
                {formatDecimal(score.totalDays)}
              </span>
              <span className="text-text-muted font-mono text-sm">日分（目安）</span>
            </div>
            <div className="text-xs font-mono text-text-muted">
              目安日: {formatDepletionDate(score.totalDays)}
            </div>
            <div className="text-[10px] text-text-muted mt-2">
              {inputs.members}人世帯 / 水{inputs.waterLiters}L / 食料{inputs.foodDays}日 / ボンベ{inputs.gasCanisterCount}本 / 医療{inputs.medicalSupplyDays}日
            </div>
            <div className="text-[9px] text-text-muted font-mono mt-1">
              surviveasonejp.org/family
            </div>
            <button
              className="mt-3 w-full py-2 px-4 rounded text-xs font-mono font-bold bg-x-brand/15 text-x-brand border border-x-brand/30 hover:bg-x-brand/25 transition-colors"
              onClick={() => {
                const days = Math.round(score.totalDays);
                const text = [
                  `わが家の${score.bottleneck}は${days}日分（${MODE_META[inputs.mode].short}モード推定・ランク${score.rank}）`,
                  `買い占めは最も脆弱な人から物資を奪います。まず過不足を確認。`,
                  `surviveasonejp.org/family`,
                  "",
                  "#surviveasonejp #ホルムズ海峡 #供給リスク分析",
                ].join("\n");
                window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
            >
              X(Twitter)でシェア
            </button>
          </div>

          {/* 内訳バー */}
          <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <SectionHeading as="h3" tone="text-muted" tracking="wider">リソース別供給余力</SectionHeading>
              {inputs.mode === "constraint" && (
                <span className="text-[9px] font-mono text-text-muted">
                  市場ステータス {RESOURCE_STATUS_UPDATED_AT} 時点
                </span>
              )}
            </div>
            {breakdowns.map((b) => {
              const pct = Math.min((b.days / maxDays) * 100, 100);
              const isBottleneck = b.label === score.bottleneck;
              const status = inputs.mode === "constraint"
                ? resourceStatus[b.label as keyof typeof resourceStatus]
                : undefined;
              const statusColor = status ? STATUS_COLOR[status.status] : null;
              return (
                <div key={b.label} className="space-y-1">
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={isBottleneck ? "text-primary-soft font-bold shrink-0" : "text-text-muted shrink-0"}>
                        {b.label}
                      </span>
                      {status && statusColor && (
                        <span
                          title={status.note}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0"
                          style={{
                            color: statusColor.text,
                            backgroundColor: statusColor.bg,
                            borderColor: statusColor.border,
                          }}
                        >
                          {STATUS_LABEL[status.status]}
                        </span>
                      )}
                      {isBottleneck && <span className="text-primary-soft text-[10px] shrink-0">← ボトルネック</span>}
                    </div>
                    <span className="font-mono shrink-0" style={{ color: b.color }}>
                      {formatDecimal(b.days)}日
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                  {status && inputs.mode === "constraint" && (
                    <p className="text-[9px] text-text-muted leading-snug pl-0.5">
                      {status.note}
                      {status.since && <span className="ml-1 font-mono">({status.since}〜)</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* 購買力カード: 現金による追加購買可能日数（constraintモード時のみ） */}
          {inputs.mode === "constraint" && (() => {
            // 1人1日あたり生活必需品推計: 食料1000円+飲料水300円+日用品400円+衛生200円 = 1900円
            // 出典: 総務省家計調査(2024)・2人以上世帯の食料+光熱費+消耗品月額から算出
            const DAILY_COST_PER_PERSON = 1900;
            const INFLATION_TOTAL = inflation.overall; // シナリオ連動の全品目加重平均
            const m = Math.max(inputs.members, 1);
            const baseDaysStore = inputs.cashYen / (m * DAILY_COST_PER_PERSON);
            const baseDaysActual = inputs.cashYen / (m * DAILY_COST_PER_PERSON * INFLATION_TOTAL);
            const effectiveDays = subsidyApplied ? baseDaysStore : baseDaysActual;
            return (
              <div className="bg-panel border border-border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h3" tone="text-muted" tracking="wider">
                    現金による追加購買力
                  </SectionHeading>
                  <span className="text-[10px] font-mono text-text-muted">
                    {subsidyApplied ? "店頭価格想定" : "実勢価格想定"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-2xl text-accent">
                    +{formatDecimal(effectiveDays)}
                  </span>
                  <span className="text-text-muted text-sm">日分</span>
                </div>
                <div className="text-[10px] font-mono text-text-muted">
                  店頭価格 {formatDecimal(baseDaysStore)}日 / 実勢価格 {formatDecimal(baseDaysActual)}日
                </div>
                <p className="text-[10px] text-text-muted leading-snug">
                  ¥{inputs.cashYen.toLocaleString()} ÷ ({inputs.members}人 × {DAILY_COST_PER_PERSON}円/日
                  {!subsidyApplied && ` × ${INFLATION_TOTAL}`})。
                  配給制下では備蓄＋現金購買で{formatDecimal(score.totalDays + effectiveDays)}日分が実質バッファ。
                </p>
              </div>
            );
          })()}

          {/* ボトルネック緊急アドバイス（14日以内のみ表示） */}
          {score.totalDays < 14 && (() => {
            const urgentActions = BOTTLENECK_URGENT_ACTIONS[score.bottleneck];
            const bottleneckDays = Math.round(score.totalDays);
            return urgentActions ? (
              <div className="border border-primary/40 rounded-lg p-4 space-y-2 bg-primary/05">
                <h3 className="font-mono text-xs tracking-wider text-primary flex items-center gap-1.5">
                  <span>⚠</span>
                  {score.bottleneck}の供給余力: {bottleneckDays}日分（確認を推奨）
                </h3>
                <div className="text-[10px] font-mono text-text-muted mb-1">確認・対応事項:</div>
                <ul className="space-y-1.5">
                  {urgentActions.map((action) => (
                    <li key={action} className="text-xs text-text flex gap-2">
                      <span className="text-primary shrink-0">▸</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })()}

          {/* アドバイス */}
          <div
            className="border rounded-lg p-4 space-y-2"
            style={{ borderColor: `${rankColor}30`, backgroundColor: `${rankColor}08` }}
          >
            <h3 className="font-mono text-xs tracking-wider" style={{ color: rankColor }}>
              改善提案
            </h3>
            <ul className="space-y-1">
              {(RANK_ADVICE[score.rank] ?? []).map((advice) => (
                <li key={advice} className="text-xs text-text-muted flex gap-2">
                  <span style={{ color: rankColor }}>▸</span>
                  {advice}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 居住地別アドバイス */}
      {(() => {
        const profile = regionId ? getRegionProfile(regionId) : null;
        const advice = profile ? getAreaAdvice(profile.areaType) : null;
        return (
          <div className="bg-panel border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionHeading as="h2" tone="text-muted" size="sm" tracking="wider">
                居住地タイプ別 備蓄優先事項
              </SectionHeading>
              {profile && advice && (
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold"
                  style={{ backgroundColor: `${advice.typeColor}15`, color: advice.typeColor }}
                >
                  {profile.name} — {advice.typeLabel}
                </span>
              )}
            </div>

            {/* 地域選択 */}
            <div className="space-y-1.5">
              <div className="text-xs text-neutral-500">居住地を選択（任意）</div>
              <div className="flex flex-wrap gap-2">
                {REGION_PROFILES.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setManualRegion(regionId === r.id ? null : r.id)}
                    className={`text-xs font-mono px-3 py-2 rounded border transition-colors min-h-[36px] ${
                      regionId === r.id
                        ? "border-info text-info bg-info/10"
                        : "border-border text-neutral-500 hover:border-neutral-400"
                    }`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            {advice && profile ? (
              <div className="space-y-4">
                {/* サマリ */}
                <p
                  className="text-xs leading-relaxed rounded-lg px-3 py-2.5"
                  style={{ backgroundColor: advice.typeBg, color: advice.typeColor }}
                >
                  {advice.summary}
                </p>

                {/* 推奨備蓄目安 */}
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="border border-border rounded p-2 space-y-0.5">
                    <div className="font-mono font-bold text-lg" style={{ color: advice.typeColor }}>
                      {advice.recommendedDays.food}日
                    </div>
                    <div className="text-[10px] text-neutral-500">推奨食料備蓄</div>
                    {inputs.foodDays < advice.recommendedDays.food && (
                      <div className="text-[9px] text-primary font-mono">
                        現在{inputs.foodDays}日 — {advice.recommendedDays.food - inputs.foodDays}日不足
                      </div>
                    )}
                  </div>
                  <div className="border border-border rounded p-2 space-y-0.5">
                    <div className="font-mono font-bold text-lg" style={{ color: advice.typeColor }}>
                      {advice.recommendedDays.water}日
                    </div>
                    <div className="text-[10px] text-neutral-500">推奨水備蓄</div>
                    {(() => {
                      const waterDays = inputs.members > 0 ? inputs.waterLiters / (inputs.members * 3) : 0;
                      return waterDays < advice.recommendedDays.water ? (
                        <div className="text-[9px] text-primary font-mono">
                          現在{Math.round(waterDays)}日 — 不足
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* 優先事項 */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono text-neutral-500 tracking-wider">優先確認事項</div>
                  <div className="space-y-1.5">
                    {advice.priorities.map((p) => (
                      <div key={p.resource} className="flex gap-2 text-xs">
                        <span
                          className="shrink-0 font-mono font-bold mt-0.5"
                          style={{ color: p.urgent ? "#dc2626" : "#d97706" }}
                        >
                          {p.urgent ? "!" : "▸"}
                        </span>
                        <div>
                          <span className="font-bold text-text">{p.resource}</span>
                          <span className="text-neutral-500 ml-1">— {p.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* リスク・強み */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                  <div className="space-y-1">
                    <div className="font-mono text-primary">このエリアのリスク</div>
                    <ul className="space-y-0.5 text-neutral-500">
                      {advice.risks.map((r) => (
                        <li key={r} className="flex gap-1">
                          <span className="text-primary shrink-0">×</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <div className="font-mono text-success">このエリアの強み</div>
                    <ul className="space-y-0.5 text-neutral-500">
                      {advice.positives.map((p) => (
                        <li key={p} className="flex gap-1">
                          <span className="text-success shrink-0">✓</span>{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-[9px] text-neutral-500 border-t border-border pt-2">
                  食料自給率 {profile.foodSelfSufficiency.toFixed(2)}（農水省）/ 物流遅延目安 {profile.deliveryDelayDays}日。
                  居住地タイプはこの地域の平均的な状況に基づきます。個別の住環境により大きく異なります。
                </p>
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                上のボタンで居住地を選択すると、そのエリアに合わせた備蓄アドバイスを表示します。
              </p>
            )}
          </div>
        );
      })()}

      {/* 要配慮者向け注意喚起 */}
      <div className="bg-panel border border-primary-soft/20 rounded-lg p-5 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-primary">要配慮者がいる家庭へ</h2>
        <p className="text-xs text-text-muted">
          上記の計算は健常な成人を前提としています。以下に該当する家族がいる場合、必要な備蓄量は大幅に増えます。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "乳幼児", note: "液体ミルク・おむつ・経口補水液。脱水は数時間で致命的" },
            { label: "人工呼吸器等の医療機器", note: "ポータブル電源1000Wh以上が生死を分ける" },
            { label: "透析患者", note: "透析不能の猶予は3-4日。代替施設の事前把握必須" },
            { label: "要介護者", note: "処方薬90日分・介護用品14日分・電動機器の電源" },
          ].map((item) => (
            <div key={item.label} className="bg-bg rounded p-3 space-y-1">
              <div className="text-xs font-bold text-primary">{item.label}</div>
              <div className="text-[10px] text-text-muted">{item.note}</div>
            </div>
          ))}
        </div>
        <Link
          to="/prepare"
          className="block text-center text-xs font-mono text-primary-soft hover:text-primary-dark transition-colors mt-2"
        >
          詳細な要配慮者チェックリスト →
        </Link>
      </div>

      {/* 行動エンジン: 不足量+購入リスト */}
      {score.totalDays < 30 && (() => {
        const TARGET_DAYS = 30;
        const m = Math.max(inputs.members, 1);
        const waterNeed = Math.max(0, TARGET_DAYS * m * 3 - inputs.waterLiters);
        const foodNeed = Math.max(0, TARGET_DAYS - inputs.foodDays);
        const gasNeed = Math.max(0, Math.ceil(TARGET_DAYS * m * 30 / 60) - inputs.gasCanisterCount);
        const batteryNeed = Math.max(0, TARGET_DAYS * m * 50 - inputs.batteryWh);
        const medicalNeed = Math.max(0, TARGET_DAYS - inputs.medicalSupplyDays);
        // 補助金OFF時の品目別価格上昇係数（2026-04基準）
        // 根拠: ガソリン補助金48.1円/L→35.5円/L、実勢215円/L vs 店頭167.5円/L（+28%）
        // 物流・包装・燃料コスト転嫁、医療物資は受注制限由来のプレミアム
        const items: { name: string; amount: string; price: number; inflation: number; needed: boolean }[] = [
          { name: "ペットボトル水(2L×6)", amount: `${Math.ceil(waterNeed / 12)}箱`, price: Math.ceil(waterNeed / 12) * 500, inflation: inflation.water, needed: waterNeed > 0 },
          { name: "非常食セット(3日分)", amount: `${Math.ceil(foodNeed / 3)}セット`, price: Math.ceil(foodNeed / 3) * 3000, inflation: inflation.food, needed: foodNeed > 0 },
          { name: "カセットボンベ(3本組)", amount: `${Math.ceil(gasNeed / 3)}パック`, price: Math.ceil(gasNeed / 3) * 350, inflation: inflation.gas, needed: gasNeed > 0 },
          { name: "ポータブル電源", amount: batteryNeed > 1000 ? "1000Wh級×1" : "500Wh級×1", price: batteryNeed > 1000 ? 80000 : batteryNeed > 0 ? 40000 : 0, inflation: inflation.battery, needed: batteryNeed > 0 },
          { name: "医療・衛生物資(処方薬・マスク・消毒薬等)", amount: `${medicalNeed}日分`, price: medicalNeed * 200, inflation: inflation.medical, needed: medicalNeed > 0 },
        ];
        const neededItems = items.filter((i) => i.needed);
        const isConstraint = inputs.mode === "constraint";
        const showInflated = isConstraint && !subsidyApplied;
        const effectivePrice = (item: { price: number; inflation: number }) =>
          showInflated ? Math.round(item.price * item.inflation) : item.price;
        const totalCost = neededItems.reduce((sum, i) => sum + effectivePrice(i), 0);
        const totalSubsidized = neededItems.reduce((sum, i) => sum + i.price, 0);
        const totalInflated = neededItems.reduce((sum, i) => sum + Math.round(i.price * i.inflation), 0);
        if (neededItems.length === 0) return null;
        return (
          <div className="bg-panel border border-primary-soft/30 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionHeading as="h2" tone="primary" size="sm" tracking="wider">
                30日分に向けた不足確認
              </SectionHeading>
              {isConstraint && (
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <button
                    onClick={() => setSubsidyApplied(true)}
                    aria-pressed={subsidyApplied}
                    className={`px-2 py-1 rounded border transition-colors ${
                      subsidyApplied
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-text-muted hover:border-neutral-400"
                    }`}
                  >
                    補助金ON（店頭価格）
                  </button>
                  <button
                    onClick={() => setSubsidyApplied(false)}
                    aria-pressed={!subsidyApplied}
                    className={`px-2 py-1 rounded border transition-colors ${
                      !subsidyApplied
                        ? "border-primary-soft bg-primary-soft/10 text-primary-soft"
                        : "border-border text-text-muted hover:border-neutral-400"
                    }`}
                  >
                    補助金OFF（実勢価格）
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-text-muted">
              現在{formatDecimal(score.totalDays)}日分 → 目標30日分までの不足量
            </p>
            <div className="space-y-2">
              {neededItems.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-text">{item.name}</span>
                    <span className="text-text-muted ml-2 text-xs">{item.amount}</span>
                  </div>
                  <span className="font-mono text-text-muted text-xs">
                    ¥{effectivePrice(item).toLocaleString()}
                    {isConstraint && showInflated && (
                      <span className="ml-1 text-[9px] text-primary-soft">
                        (店頭¥{item.price.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="text-sm text-text-muted">概算合計</span>
              <div className="text-right">
                <span className="font-mono font-bold text-lg text-primary-soft">
                  ¥{totalCost.toLocaleString()}
                </span>
                {isConstraint && (
                  <div className="text-[9px] font-mono text-text-muted">
                    店頭¥{totalSubsidized.toLocaleString()} / 実勢¥{totalInflated.toLocaleString()}
                    <span className="ml-1">
                      （+{Math.round(((totalInflated - totalSubsidized) / Math.max(totalSubsidized, 1)) * 100)}%）
                    </span>
                  </div>
                )}
              </div>
            </div>
            {totalCost > 10000 && (
              <p className="text-xs text-neutral-500 bg-bg rounded p-3 leading-relaxed">
                一度に全部揃える必要はありません。<br />
                優先順位：<span className="text-text">水 → 食料 → 医療・衛生 → ガス → 電源</span>。まず水の残量を確認するところから始めましょう。
              </p>
            )}
            {isConstraint && (
              <p className="text-[10px] text-text-muted bg-bg rounded p-2 leading-relaxed">
                「店頭価格」はガソリン補助金48.1円/L→35.5円/L等の政府介入を反映した2026-04時点の小売水準。
                「実勢価格」は補助金が切れた場合の推計値（ガソリン実勢215円/L・品目別コスト転嫁係数ベース）。
                補助金終了日は未公表。
              </p>
            )}
            <p className="text-[10px] text-neutral-600">
              ※ 価格は参考値です。実際の価格は販売店・時期により変動します
            </p>
          </div>
        );
      })()}
    </div>
  );
};
