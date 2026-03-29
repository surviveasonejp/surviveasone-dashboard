import { type FC } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { getAlertColor } from "../lib/alertHelpers";
import { formatNumber, formatTimeHMS, formatDepletionDate } from "../lib/formatters";
import type { ScenarioRange } from "../lib/fallbackCountdowns";

interface CountdownTimerProps {
  label: string;
  totalSeconds: number;
  compact?: boolean;
  /** 3シナリオの日数レンジ（表示中シナリオは totalSeconds から算出） */
  range?: ScenarioRange;
  /** 現在選択中のシナリオID */
  activeScenario?: "optimistic" | "realistic" | "pessimistic";
}

const SCENARIO_LABELS = {
  optimistic: "楽観",
  realistic: "現実",
  pessimistic: "悲観",
} as const;

const SCENARIO_COLORS = {
  optimistic: "#22c55e",
  realistic: "#f59e0b",
  pessimistic: "#ef4444",
} as const;

export const CountdownTimer: FC<CountdownTimerProps> = ({
  label,
  totalSeconds,
  compact = false,
  range,
  activeScenario = "realistic",
}) => {
  const { days, hours, minutes, seconds, alertLevel } = useCountdown(totalSeconds);
  const color = getAlertColor(alertLevel);
  const isCritical = alertLevel === "critical";

  if (compact) {
    return (
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4">
        <div className="text-xs font-mono text-neutral-500 tracking-wider mb-1">
          {label}
          <span className="ml-1.5 text-neutral-600">({SCENARIO_LABELS[activeScenario]}シナリオ)</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono font-bold text-2xl ${isCritical ? "animate-pulse-danger" : ""}`}
            style={{ color }}
          >
            {formatNumber(days)}
          </span>
          <span className="text-neutral-500 text-sm font-mono">日</span>
          <span className="font-mono text-sm text-neutral-400">
            {formatTimeHMS(hours, minutes, seconds)}
          </span>
        </div>
        {/* レンジ表示（compact） */}
        {range && <RangeBar range={range} activeScenario={activeScenario} />}
        <div className="text-xs font-mono text-neutral-400 mt-1">
          枯渇日: {formatDepletionDate(days)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 text-center">
      <div className="text-sm font-mono text-neutral-500 tracking-wider mb-4">
        {label}
        <span className="ml-1.5 text-neutral-600">({SCENARIO_LABELS[activeScenario]}シナリオ)</span>
      </div>
      <div
        className={`font-mono font-bold text-6xl md:text-7xl mb-2 ${isCritical ? "animate-pulse-danger" : ""}`}
        style={{ color }}
      >
        {formatNumber(days)}
      </div>
      <div className="text-neutral-500 font-mono text-lg mb-3">日</div>
      <div className="font-mono text-2xl text-neutral-300">
        {formatTimeHMS(hours, minutes, seconds)}
      </div>
      {/* レンジ表示（フル） */}
      {range && <RangeBar range={range} activeScenario={activeScenario} />}
      <div className="text-sm font-mono text-neutral-400 mt-2">
        枯渇日: {formatDepletionDate(days)}
      </div>
      <div className="mt-4 h-1 rounded-full bg-[#1e2a36] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            backgroundColor: color,
            width: `${Math.max(0, Math.min(100, (days / 267) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
};

// ─── レンジバー ──────────────────────────────────────

interface RangeBarProps {
  range: ScenarioRange;
  activeScenario: "optimistic" | "realistic" | "pessimistic";
}

const RangeBar: FC<RangeBarProps> = ({ range, activeScenario }) => {
  const max = Math.max(range.optimistic, range.realistic, range.pessimistic, 1);
  const scenarios = ["pessimistic", "realistic", "optimistic"] as const;

  return (
    <div className="mt-2 space-y-0.5">
      {scenarios.map((id) => {
        const val = range[id];
        const isActive = id === activeScenario;
        const sColor = SCENARIO_COLORS[id];
        const pct = Math.min((val / max) * 100, 100);
        return (
          <div key={id} className="flex items-center gap-1.5">
            <span
              className="text-[9px] font-mono w-6 text-right shrink-0"
              style={{ color: isActive ? sColor : "#555" }}
            >
              {SCENARIO_LABELS[id]}
            </span>
            <div className="flex-1 h-1.5 bg-[#0c1018] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: sColor,
                  opacity: isActive ? 0.8 : 0.25,
                }}
              />
            </div>
            <span
              className="text-[9px] font-mono w-8 text-right shrink-0"
              style={{ color: isActive ? sColor : "#555" }}
            >
              {Math.round(val)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
