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

/** 365日以上は年単位で表示 */
function formatDaysMain(days: number): { value: string; unit: string; sub?: string } {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const rem = Math.round(days % 365);
    return {
      value: String(years),
      unit: "年",
      sub: rem > 0 ? `${rem}日` : undefined,
    };
  }
  return { value: formatNumber(days), unit: "日" };
}

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
  const { value: mainValue, unit: mainUnit, sub: mainSub } = formatDaysMain(days);

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
            {mainValue}
          </span>
          <span className="text-neutral-500 text-sm font-mono">{mainUnit}</span>
          {mainSub && (
            <span className="font-mono text-sm text-neutral-400">{mainSub}</span>
          )}
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
        className={`font-mono font-bold text-6xl md:text-7xl mb-1 ${isCritical ? "animate-pulse-danger" : ""}`}
        style={{ color }}
      >
        {mainValue}
      </div>
      <div className="text-neutral-500 font-mono text-lg mb-1">{mainUnit}</div>
      {mainSub && (
        <div className="font-mono text-2xl text-neutral-400 mb-1">{mainSub}</div>
      )}
      <div className="font-mono text-2xl text-neutral-300 mb-3">
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

/** レンジバー用: 365日以上は「X.X年」表示 */
function formatRangeDays(val: number): string {
  if (val >= 365) {
    return `${(val / 365).toFixed(1)}年`;
  }
  return `${Math.round(val)}日`;
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
              className="text-[10px] font-mono w-6 text-right shrink-0"
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
              className="text-[10px] font-mono w-10 text-right shrink-0"
              style={{ color: isActive ? sColor : "#555" }}
            >
              {formatRangeDays(val)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
