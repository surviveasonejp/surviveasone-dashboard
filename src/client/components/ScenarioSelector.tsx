import { type FC } from "react";
import { type ScenarioId, SCENARIO_LIST } from "../../shared/scenarios";

interface ScenarioSelectorProps {
  selected: ScenarioId;
  onChange: (id: ScenarioId) => void;
}

const SCENARIO_COLORS: Record<ScenarioId, string> = {
  optimistic: "#2563eb",
  realistic: "#16a34a",
  pessimistic: "#d97706",
  ceasefire: "#0d9488",
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
            className={`px-3 py-2 text-xs font-mono tracking-wider rounded border transition-colors cursor-pointer min-h-[36px]${!isActive ? " border-border text-neutral-400" : ""}`}
            style={
              isActive
                ? { borderColor: color, color, backgroundColor: `${color}15` }
                : undefined
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
