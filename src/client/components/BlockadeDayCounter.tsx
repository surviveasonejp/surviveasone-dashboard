import { type FC } from "react";
import { type ScenarioId } from "../../shared/scenarios";

interface BlockadeDayCounterProps {
  activeScenario?: ScenarioId;
}

/** IRGC停止命令日（AL DAAYEN/RASHEEDA引き返し） */
const BLOCKADE_START = new Date("2026-04-06T00:00:00+09:00");

/** シナリオ別 次のマイルストーン（封鎖からの日数） */
const SCENARIO_MILESTONE: Record<ScenarioId, { day: number; label: string } | null> = {
  optimistic: { day: 90,  label: "解除推定" },
  realistic:  { day: 120, label: "解除推定" },
  pessimistic: null,
  ceasefire:  { day: 180, label: "正常化完了" },
};

const SCENARIO_COLORS: Record<ScenarioId, string> = {
  optimistic:  "#2563eb",
  realistic:   "#16a34a",
  pessimistic: "#d97706",
  ceasefire:   "#0d9488",
};

const SCENARIO_LABELS: Record<ScenarioId, string> = {
  optimistic:  "国際協調",
  realistic:   "標準対応",
  pessimistic: "需要超過",
  ceasefire:   "停戦・回復",
};

export const BlockadeDayCounter: FC<BlockadeDayCounterProps> = ({
  activeScenario = "realistic",
}) => {
  const now = new Date();
  const elapsed = Math.max(
    0,
    Math.floor((now.getTime() - BLOCKADE_START.getTime()) / (1000 * 60 * 60 * 24)),
  );
  const milestone = SCENARIO_MILESTONE[activeScenario];
  const color = SCENARIO_COLORS[activeScenario];
  const scenarioLabel = SCENARIO_LABELS[activeScenario];

  const pct = milestone
    ? Math.min((elapsed / milestone.day) * 100, 100)
    : 100;

  return (
    <div className="bg-panel border border-border rounded-lg px-5 py-4 space-y-3">
      {/* 上段: 経過日数 + マイルストーン */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* 経過日数 */}
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-xs font-mono text-text-muted shrink-0">封鎖</span>
          <span
            className="font-mono font-bold text-3xl leading-none"
            style={{ color }}
          >
            {elapsed}
          </span>
          <span className="text-sm font-mono text-text-muted shrink-0">日目</span>
          <span className="text-xs font-mono text-neutral-500 ml-1 hidden sm:inline">
            （2026/04/06 IRGC停止命令 — Day 0）
          </span>
        </div>

        {/* シナリオ + マイルストーン */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {scenarioLabel}
          </span>
          {milestone ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-text-muted">{milestone.label}:</span>
              <span className="font-mono font-bold text-sm" style={{ color }}>
                Day {milestone.day}
              </span>
              <span className="text-xs font-mono text-neutral-500">
                （あと{Math.max(0, milestone.day - elapsed)}日）
              </span>
            </div>
          ) : (
            <span className="text-[10px] font-mono text-neutral-500">
              解除推定なし（長期継続シナリオ）
            </span>
          )}
        </div>
      </div>

      {/* プログレスバー */}
      <div className="space-y-1">
        <div className="relative h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-neutral-600">
          <span>Day 0　封鎖開始</span>
          <span style={{ color }}>現在 Day {elapsed}</span>
          {milestone ? (
            <span>Day {milestone.day}　{milestone.label}</span>
          ) : (
            <span>継続中</span>
          )}
        </div>
      </div>
    </div>
  );
};
