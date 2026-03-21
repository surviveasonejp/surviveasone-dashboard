export type ScenarioId = "optimistic" | "realistic" | "pessimistic";

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  /** ホルムズ経由石油の遮断率 (0-1) */
  oilBlockadeRate: number;
  /** ホルムズ経由LNGの遮断率 (0-1) */
  lngBlockadeRate: number;
  /** 需要削減率 (正=節約, 負=パニック増加) */
  demandReductionRate: number;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  optimistic: {
    id: "optimistic",
    label: "楽観",
    description: "部分封鎖。代替航路確保、IEA備蓄放出、需要15%削減",
    oilBlockadeRate: 0.50,
    lngBlockadeRate: 0.03,
    demandReductionRate: 0.15,
  },
  realistic: {
    id: "realistic",
    label: "現実",
    description: "全面封鎖。代替限定、備蓄放出遅延、需要5%削減",
    oilBlockadeRate: 0.94,
    lngBlockadeRate: 0.063,
    demandReductionRate: 0.05,
  },
  pessimistic: {
    id: "pessimistic",
    label: "悲観",
    description: "全面封鎖+マラッカ混乱。パニック買いで需要10%増",
    oilBlockadeRate: 1.0,
    lngBlockadeRate: 0.15,
    demandReductionRate: -0.10,
  },
} as const;

export const SCENARIO_LIST: Scenario[] = [
  SCENARIOS.optimistic,
  SCENARIOS.realistic,
  SCENARIOS.pessimistic,
];

export const DEFAULT_SCENARIO: ScenarioId = "realistic";
