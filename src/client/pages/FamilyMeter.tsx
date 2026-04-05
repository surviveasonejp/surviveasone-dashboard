import { type FC, useState } from "react";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { BlockadeContext } from "../components/BlockadeContext";
import { useFamilySurvival } from "../hooks/useFamilySurvival";
import type { FamilyInputs } from "../../shared/types";
import {
  getSurvivalRankColor,
  getSurvivalRankLabel,
  getAlertLevel,
} from "../lib/alertHelpers";
import { formatDecimal, formatDepletionDate } from "../lib/formatters";

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
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono font-bold text-neutral-200">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={`${label}: ${value}${unit}`}
      className="w-full h-2 rounded-full appearance-none bg-[#1e2a36] cursor-pointer"
    />
    <div className="flex justify-between text-[10px] text-neutral-600 font-mono">
      <span>{min}{unit}</span>
      <span>{max}{unit}</span>
    </div>
  </div>
);

const RANK_ADVICE: Record<string, string[]> = {
  S: ["十分な備えがあります。近隣への支援も検討できるレベルです"],
  A: ["良好な備蓄状況です。水の補充サイクルを維持してください"],
  B: ["最低限の備えはありますが、2週間以上の危機には不十分。カセットボンベと水を増やしましょう"],
  C: ["1週間程度で限界に達する見込みです。水と食料の過不足を優先的に確認してください"],
  D: ["備蓄が不足しています。一度に全部揃える必要はありません。まず「水だけ」を確認するところから始めましょう"],
  F: ["備蓄がほぼありません。今日できることはひとつだけ：飲料水の状況を確認してください"],
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

  const score = useFamilySurvival(inputs);
  const rankColor = getSurvivalRankColor(score.rank);
  const rankLabel = getSurvivalRankLabel(score.rank);

  const update = (key: keyof FamilyInputs) => (value: number) =>
    setInputs((prev) => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const breakdowns = [
    { label: "水", days: score.waterDays, color: isLight ? "#3b82f6" : "#94a3b8" },
    { label: "食料", days: score.foodDays, color: isLight ? "#16a34a" : "#4ade80" },
    { label: "燃料", days: score.energyDays, color: isLight ? "#d97706" : "#f59e0b" },
    { label: "電力", days: score.powerDays, color: isLight ? "#7c3aed" : "#94a3b8" },
  ];

  const maxDays = Math.max(...breakdowns.map((b) => b.days), 30);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#f59e0b]">FAMILY SURVIVAL</span> METER
        </h1>
        <p className="text-neutral-500 text-sm">
          配給や相互支援が届くまで、あなたの家庭はどれだけ持ちこたえられるか
        </p>
      </div>

      <AlertBanner
        level={getAlertLevel(score.totalDays)}
        message={`現在の備蓄で${formatDecimal(score.totalDays)}日生存可能 — ボトルネック: ${score.bottleneck}`}
      />

      <SimulationBanner />
      <BlockadeContext />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: 入力フォーム */}
        <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-5">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">備蓄入力</h2>
          <InputSlider label="世帯人数" value={inputs.members} min={1} max={10} step={1} unit="人" onChange={update("members")} />
          <InputSlider label="水備蓄" value={inputs.waterLiters} min={0} max={500} step={5} unit="L" onChange={update("waterLiters")} />
          <InputSlider label="食料備蓄" value={inputs.foodDays} min={0} max={90} step={1} unit="日分" onChange={update("foodDays")} />
          <InputSlider label="カセットボンベ" value={inputs.gasCanisterCount} min={0} max={100} step={1} unit="本" onChange={update("gasCanisterCount")} />
          <InputSlider label="ポータブル電源" value={inputs.batteryWh} min={0} max={5000} step={50} unit="Wh" onChange={update("batteryWh")} />
          <InputSlider label="ソーラーパネル" value={inputs.solarWatts} min={0} max={500} step={10} unit="W" onChange={update("solarWatts")} />
          <div className="flex items-center gap-3">
            <button
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                inputs.hasMedicalDevice
                  ? "bg-[#ef4444] border-[#ef4444]"
                  : "border-[#1e2a36] hover:border-neutral-500"
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
              <span className="text-sm text-neutral-300">在宅医療機器を使用</span>
              <span className="text-[10px] text-neutral-500 ml-2">（人工呼吸器・吸引器等 → 電力消費10倍で計算）</span>
            </div>
          </div>
          <InputSlider label="現金" value={inputs.cashYen} min={0} max={1000000} step={10000} unit="円" onChange={update("cashYen")} />
          <p className="text-[10px] text-neutral-500">※ 現金は参考情報です。生存日数の計算には含まれません（配給制移行時の購買力指標）</p>
          <p className="text-[10px] text-neutral-600 leading-relaxed">
            入力データはこのブラウザ内でのみ保存・計算されます。サーバーへの送信は行いません。
          </p>
        </div>

        {/* 右: スコアカード */}
        <div className="space-y-4">
          {/* ランク表示 */}
          <div
            className="bg-[#151c24] border rounded-lg p-6 text-center space-y-3"
            style={{ borderColor: `${rankColor}40` }}
          >
            <div className="text-xs font-mono text-neutral-500 tracking-wider" id="rank-label" data-screenshot="family-rank">SURVIVAL RANK</div>
            <div
              className="font-mono font-bold text-8xl"
              style={{ color: rankColor }}
              role="status"
              aria-labelledby="rank-label"
              aria-label={`生存ランク${score.rank}、${rankLabel}、${formatDecimal(score.totalDays)}日生存可能`}
            >
              {score.rank}
            </div>
            <div className="font-mono text-sm" style={{ color: rankColor }}>
              {rankLabel}
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="font-mono font-bold text-3xl text-neutral-200">
                {formatDecimal(score.totalDays)}
              </span>
              <span className="text-neutral-500 font-mono text-sm">日生存可能</span>
            </div>
            <div className="text-xs font-mono text-neutral-400">
              限界日: {formatDepletionDate(score.totalDays)}
            </div>
            <div className="text-[10px] text-neutral-600 mt-2">
              {inputs.members}人世帯 / 水{inputs.waterLiters}L / 食料{inputs.foodDays}日 / ボンベ{inputs.gasCanisterCount}本
            </div>
            <div className="text-[9px] text-neutral-700 font-mono mt-1">
              surviveasonejp.org/family
            </div>
            <button
              className="mt-3 w-full py-2 px-4 rounded text-xs font-mono font-bold bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/30 hover:bg-[#1d9bf0]/25 transition-colors"
              onClick={() => {
                const days = Math.round(score.totalDays);
                const text = [
                  `ホルムズリスクシナリオ、わが家の備蓄を診断した。`,
                  `ランク【${score.rank}】推定${days}日（ボトルネック: ${score.bottleneck}）`,
                  `${inputs.members}人世帯・水${inputs.waterLiters}L・食料${inputs.foodDays}日・ガス${inputs.gasCanisterCount}本で試算。`,
                  "",
                  "足りないものを確認 → surviveasonejp.org/family",
                  "",
                  "#ホルムズ海峡 #備蓄確認",
                ].join("\n");
                window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener");
              }}
            >
              X(Twitter)でシェア
            </button>
          </div>

          {/* 内訳バー */}
          <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 space-y-3">
            <h3 className="font-mono text-xs text-neutral-500 tracking-wider">リソース別限界日数</h3>
            {breakdowns.map((b) => {
              const pct = Math.min((b.days / maxDays) * 100, 100);
              const isBottleneck = b.label === score.bottleneck;
              return (
                <div key={b.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={isBottleneck ? "text-[#ef4444] font-bold" : "text-neutral-400"}>
                      {b.label} {isBottleneck && "← ボトルネック"}
                    </span>
                    <span className="font-mono" style={{ color: b.color }}>
                      {formatDecimal(b.days)}日
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#1e2a36] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: b.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

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
                <li key={advice} className="text-xs text-neutral-400 flex gap-2">
                  <span style={{ color: rankColor }}>▸</span>
                  {advice}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 要配慮者向け注意喚起 */}
      <div className="bg-[#151c24] border border-[#ef4444]/20 rounded-lg p-5 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-red-400">要配慮者がいる家庭へ</h2>
        <p className="text-xs text-neutral-400">
          上記の計算は健常な成人を前提としています。以下に該当する家族がいる場合、必要な備蓄量は大幅に増えます。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "乳幼児", note: "液体ミルク・おむつ・経口補水液。脱水は数時間で致命的" },
            { label: "人工呼吸器等の医療機器", note: "ポータブル電源1000Wh以上が生死を分ける" },
            { label: "透析患者", note: "透析不能の猶予は3-4日。代替施設の事前把握必須" },
            { label: "要介護者", note: "処方薬90日分・介護用品14日分・電動機器の電源" },
          ].map((item) => (
            <div key={item.label} className="bg-[#0f1419] rounded p-3 space-y-1">
              <div className="text-xs font-bold text-red-300">{item.label}</div>
              <div className="text-[10px] text-neutral-500">{item.note}</div>
            </div>
          ))}
        </div>
        <a
          href="/prepare"
          className="block text-center text-xs font-mono text-[#ef4444] hover:text-red-300 transition-colors mt-2"
        >
          詳細な要配慮者チェックリスト →
        </a>
      </div>

      {/* 行動エンジン: 不足量+購入リスト */}
      {score.totalDays < 30 && (() => {
        const TARGET_DAYS = 30;
        const m = Math.max(inputs.members, 1);
        const waterNeed = Math.max(0, TARGET_DAYS * m * 3 - inputs.waterLiters);
        const foodNeed = Math.max(0, TARGET_DAYS - inputs.foodDays);
        const gasNeed = Math.max(0, Math.ceil(TARGET_DAYS * m * 30 / 60) - inputs.gasCanisterCount);
        const batteryNeed = Math.max(0, TARGET_DAYS * m * 50 - inputs.batteryWh);
        const items: { name: string; amount: string; price: number; needed: boolean }[] = [
          { name: "ペットボトル水(2L×6)", amount: `${Math.ceil(waterNeed / 12)}箱`, price: Math.ceil(waterNeed / 12) * 500, needed: waterNeed > 0 },
          { name: "非常食セット(3日分)", amount: `${Math.ceil(foodNeed / 3)}セット`, price: Math.ceil(foodNeed / 3) * 3000, needed: foodNeed > 0 },
          { name: "カセットボンベ(3本組)", amount: `${Math.ceil(gasNeed / 3)}パック`, price: Math.ceil(gasNeed / 3) * 350, needed: gasNeed > 0 },
          { name: "ポータブル電源", amount: batteryNeed > 1000 ? "1000Wh級×1" : "500Wh級×1", price: batteryNeed > 1000 ? 80000 : batteryNeed > 0 ? 40000 : 0, needed: batteryNeed > 0 },
        ];
        const neededItems = items.filter((i) => i.needed);
        const totalCost = neededItems.reduce((sum, i) => sum + i.price, 0);
        if (neededItems.length === 0) return null;
        return (
          <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-6 space-y-4">
            <h2 className="font-mono text-sm tracking-wider text-[#ef4444]">
              30日生存に必要な追加備蓄
            </h2>
            <p className="text-xs text-neutral-400">
              現在{formatDecimal(score.totalDays)}日 → 目標30日に到達するための不足分
            </p>
            <div className="space-y-2">
              {neededItems.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-neutral-300">{item.name}</span>
                    <span className="text-neutral-500 ml-2 text-xs">{item.amount}</span>
                  </div>
                  <span className="font-mono text-neutral-400 text-xs">
                    ¥{item.price.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#1e2a36] pt-3 flex items-center justify-between">
              <span className="text-sm text-neutral-400">概算合計</span>
              <span className="font-mono font-bold text-lg text-[#ef4444]">
                ¥{totalCost.toLocaleString()}
              </span>
            </div>
            {totalCost > 10000 && (
              <p className="text-xs text-neutral-500 bg-[#0f1419] rounded p-3 leading-relaxed">
                一度に全部揃える必要はありません。<br />
                優先順位：<span className="text-neutral-300">水 → 食料 → ガス → 電源</span>。まず水だけでも確認してください。
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
