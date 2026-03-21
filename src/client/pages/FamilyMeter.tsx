import { type FC, useState } from "react";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { useFamilySurvival } from "../hooks/useFamilySurvival";
import {
  type FamilyInputs,
  getSurvivalRankColor,
  getSurvivalRankLabel,
  getAlertLevel,
  getAlertColor,
} from "../lib/calculations";
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
      className="w-full h-1.5 rounded-full appearance-none bg-[#2a2a2a] cursor-pointer accent-[#ff9100]"
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
  C: ["1週間程度で限界に達します。今すぐ備蓄を始めてください。特に水と食料"],
  D: ["極めて危険。3日分の水と食料を最優先で確保してください"],
  F: ["生存困難。水の確保が最優先。ペットボトル水を今すぐ購入してください"],
};

export const FamilyMeter: FC = () => {
  const [inputs, setInputs] = useState<FamilyInputs>({
    members: 3,
    waterLiters: 36,
    foodDays: 7,
    gasCanisterCount: 6,
    batteryWh: 500,
    cashYen: 30000,
  });

  const score = useFamilySurvival(inputs);
  const rankColor = getSurvivalRankColor(score.rank);
  const rankLabel = getSurvivalRankLabel(score.rank);

  const update = (key: keyof FamilyInputs) => (value: number) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const breakdowns = [
    { label: "水", days: score.waterDays, color: "#4fc3f7" },
    { label: "食料", days: score.foodDays, color: "#81c784" },
    { label: "燃料", days: score.energyDays, color: "#ff9100" },
    { label: "電力", days: score.powerDays, color: "#ffea00" },
  ];

  const maxDays = Math.max(...breakdowns.map((b) => b.days), 30);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ff9100]">FAMILY SURVIVAL</span> METER
        </h1>
        <p className="text-neutral-500 text-sm">
          あなたの家庭はどれだけ持ちこたえられるか — 備蓄を入力してランクを確認
        </p>
      </div>

      <AlertBanner
        level={getAlertLevel(score.totalDays)}
        message={`現在の備蓄で${formatDecimal(score.totalDays)}日生存可能 — ボトルネック: ${score.bottleneck}`}
      />

      <SimulationBanner />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: 入力フォーム */}
        <div data-no-swipe className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-6 space-y-5">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">備蓄入力</h2>
          <InputSlider label="世帯人数" value={inputs.members} min={1} max={10} step={1} unit="人" onChange={update("members")} />
          <InputSlider label="水備蓄" value={inputs.waterLiters} min={0} max={500} step={5} unit="L" onChange={update("waterLiters")} />
          <InputSlider label="食料備蓄" value={inputs.foodDays} min={0} max={90} step={1} unit="日分" onChange={update("foodDays")} />
          <InputSlider label="カセットボンベ" value={inputs.gasCanisterCount} min={0} max={100} step={1} unit="本" onChange={update("gasCanisterCount")} />
          <InputSlider label="ポータブル電源" value={inputs.batteryWh} min={0} max={5000} step={50} unit="Wh" onChange={update("batteryWh")} />
          <InputSlider label="現金" value={inputs.cashYen} min={0} max={1000000} step={10000} unit="円" onChange={update("cashYen")} />
        </div>

        {/* 右: スコアカード */}
        <div className="space-y-4">
          {/* ランク表示 */}
          <div
            className="bg-[#141414] border rounded-lg p-6 text-center space-y-3"
            style={{ borderColor: `${rankColor}40` }}
          >
            <div className="text-xs font-mono text-neutral-500 tracking-wider">SURVIVAL RANK</div>
            <div
              className="font-mono font-bold text-8xl"
              style={{ color: rankColor }}
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
            <div className="text-xs font-mono text-neutral-500">
              限界日: {formatDepletionDate(score.totalDays)}
            </div>
          </div>

          {/* 内訳バー */}
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 space-y-3">
            <h3 className="font-mono text-xs text-neutral-500 tracking-wider">リソース別限界日数</h3>
            {breakdowns.map((b) => {
              const pct = Math.min((b.days / maxDays) * 100, 100);
              const isBottleneck = b.label === score.bottleneck;
              return (
                <div key={b.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={isBottleneck ? "text-[#ff1744] font-bold" : "text-neutral-400"}>
                      {b.label} {isBottleneck && "← ボトルネック"}
                    </span>
                    <span className="font-mono" style={{ color: b.color }}>
                      {formatDecimal(b.days)}日
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#2a2a2a] overflow-hidden">
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
    </div>
  );
};
