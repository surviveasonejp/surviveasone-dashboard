import { type FC } from "react";
import { type ScenarioId } from "../../shared/scenarios";
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
  activeScenario?: ScenarioId;
  /** trueのとき残り日数によるアラート色付けを無効化（到着カウントダウン用） */
  noAlert?: boolean;
}

const SCENARIO_LABELS: Record<ScenarioId, string> = {
  optimistic: "国際協調",
  realistic: "標準対応",
  pessimistic: "需要超過",
  ceasefire: "停戦・回復",
};

const SCENARIO_COLORS: Record<ScenarioId, string> = {
  optimistic: "#2563eb",
  realistic: "#16a34a",
  pessimistic: "#d97706",
  ceasefire: "#0d9488",
};

export const CountdownTimer: FC<CountdownTimerProps> = ({
  label,
  totalSeconds,
  compact = false,
  range,
  activeScenario = "realistic",
  noAlert = false,
}) => {
  const { days, hours, minutes, seconds, alertLevel } = useCountdown(totalSeconds);
  const isCeasefire = activeScenario === "ceasefire";
  const color = noAlert ? "#94a3b8" : isCeasefire ? SCENARIO_COLORS.ceasefire : getAlertColor(alertLevel);
  const isCritical = !noAlert && !isCeasefire && alertLevel === "critical";
  // 停戦シナリオではレンジバー非表示（3シナリオ比較レンジは適用外）
  const showRange = range !== undefined && !isCeasefire;
  const depletionLabel = isCeasefire ? "正常化目標:" : "枯渇日:";

  if (compact) {
    return (
      <div className="bg-panel border border-border rounded-lg p-4">
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
        {/* レンジ表示（compact）: 停戦シナリオでは非表示 */}
        {showRange && <RangeBar range={range} activeScenario={activeScenario} />}
        <div className="text-xs font-mono text-neutral-400 mt-1">
          {depletionLabel} {formatDepletionDate(days)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-6 text-center">
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
      {/* レンジ表示（フル）: 停戦シナリオでは非表示 */}
      {showRange && <RangeBar range={range} activeScenario={activeScenario} />}
      <div className="text-sm font-mono text-neutral-400 mt-2">
        {depletionLabel} {formatDepletionDate(days)}
      </div>
      <div className="mt-4 h-1 rounded-full bg-border overflow-hidden">
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
  activeScenario: ScenarioId;
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
