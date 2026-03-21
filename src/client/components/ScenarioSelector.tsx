import { type FC } from "react";
import { type ScenarioId, SCENARIO_LIST } from "../lib/scenarios";

interface ScenarioSelectorProps {
  selected: ScenarioId;
  onChange: (id: ScenarioId) => void;
}

const SCENARIO_COLORS: Record<ScenarioId, string> = {
  optimistic: "#00e676",
  realistic: "#ff9100",
  pessimistic: "#ff1744",
};

export const ScenarioSelector: FC<ScenarioSelectorProps> = ({ selected, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-mono text-neutral-500 tracking-wider hidden sm:inline">
      SCENARIO
    </span>
    <div className="flex gap-1" data-no-swipe>
      {SCENARIO_LIST.map((s) => {
        const isActive = selected === s.id;
        const color = SCENARIO_COLORS[s.id];
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className="px-2.5 py-1 text-[11px] font-mono tracking-wider rounded border transition-colors cursor-pointer"
            style={
              isActive
                ? { borderColor: color, color, backgroundColor: `${color}15` }
                : { borderColor: "#2a2a2a", color: "#666" }
            }
            title={s.description}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  </div>
);
