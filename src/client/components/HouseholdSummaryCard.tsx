import { type FC, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { FamilyInputs } from "../../shared/types";
import type { ScenarioId } from "../../shared/scenarios";
import { useFamilySurvival } from "../hooks/useFamilySurvival";
import { getSurvivalRankColor, getSurvivalRankLabel } from "../lib/alertHelpers";
import { formatDecimal } from "../lib/formatters";
import { SectionHeading } from "./SectionHeading";

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

interface HouseholdSummaryCardProps {
  scenario: ScenarioId;
}

/**
 * Dashboard 用の世帯供給余力サマリーカード。
 * localStorage に familyMeterInputs があれば計算して表示、なければCTA表示。
 */
export const HouseholdSummaryCard: FC<HouseholdSummaryCardProps> = ({ scenario }) => {
  const [inputs, setInputs] = useState<FamilyInputs | null>(null);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setInputs({ ...DEFAULT_INPUTS, ...parsed });
        setHasData(true);
      } else {
        setInputs(DEFAULT_INPUTS);
        setHasData(false);
      }
    } catch {
      setInputs(DEFAULT_INPUTS);
      setHasData(false);
    }
  }, []);

  const score = useFamilySurvival(inputs ?? DEFAULT_INPUTS, scenario);

  if (!inputs) return null;

  const rankColor = getSurvivalRankColor(score.rank);
  const rankLabel = getSurvivalRankLabel(score.rank);

  if (!hasData) {
    return (
      <Link
        to="/family"
        className="block bg-panel border border-border hover:border-accent/50 rounded-lg p-4 transition-colors group"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <SectionHeading as="h2" tone="text-muted" size="sm" tracking="wider">
              わが家の供給余力を確認
            </SectionHeading>
            <p className="text-xs text-text-muted mt-1">
              HOUSEHOLD SUPPLY CHECK で備蓄入力 → 現シナリオ下での供給余力日数を計算
            </p>
          </div>
          <span className="text-accent font-mono text-xl group-hover:translate-x-1 transition-transform">
            &rarr;
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/family"
      className="block bg-panel border rounded-lg p-4 transition-colors group"
      style={{ borderColor: `${rankColor}40` }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="font-mono font-bold text-3xl shrink-0"
            style={{ color: rankColor }}
            aria-label={`ランク${score.rank}`}
          >
            {score.rank}
          </div>
          <div className="min-w-0">
            <SectionHeading as="h2" tone="text-muted" size="sm" tracking="wider">
              わが家の供給余力
            </SectionHeading>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-mono font-bold text-lg text-text">
                {formatDecimal(score.totalDays)}
              </span>
              <span className="text-xs text-text-muted">日分</span>
              <span className="text-[10px] font-mono ml-1" style={{ color: rankColor }}>
                {rankLabel}
              </span>
            </div>
            <div className="text-[10px] text-text-muted font-mono mt-0.5">
              最短: {score.bottleneck} / {inputs.mode === "constraint" ? "供給制約" : "突発災害"}モード
            </div>
          </div>
        </div>
        <span className="text-text-muted font-mono text-sm group-hover:text-accent transition-colors">
          詳細 &rarr;
        </span>
      </div>
    </Link>
  );
};
