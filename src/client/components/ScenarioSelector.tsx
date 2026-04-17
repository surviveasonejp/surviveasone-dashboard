import { type FC, type KeyboardEvent } from "react";
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

export const ScenarioSelector: FC<ScenarioSelectorProps> = ({ selected, onChange }) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const currentIdx = SCENARIO_LIST.findIndex((s) => s.id === selected);
    if (currentIdx < 0) return;
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const newIdx = (currentIdx + dir + SCENARIO_LIST.length) % SCENARIO_LIST.length;
    const newScenario = SCENARIO_LIST[newIdx];
    if (!newScenario) return;
    onChange(newScenario.id);
    const nextBtn = e.currentTarget.parentElement?.querySelectorAll("button")[newIdx];
    if (nextBtn instanceof HTMLButtonElement) nextBtn.focus();
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-neutral-500 tracking-wider hidden sm:inline">
        SCENARIO
      </span>
      <div className="flex gap-1" data-no-swipe role="radiogroup" aria-label="シナリオ選択（←→キーで切替）">
        {SCENARIO_LIST.map((s) => {
          const isActive = selected === s.id;
          const color = SCENARIO_COLORS[s.id];
          return (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              onKeyDown={handleKeyDown}
              role="radio"
              aria-checked={isActive}
              className={`px-3 py-2 text-xs font-mono tracking-wider rounded border transition-colors cursor-pointer min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-info${!isActive ? " border-border text-neutral-400" : ""}`}
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
};
