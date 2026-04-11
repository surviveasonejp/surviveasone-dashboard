export type ScenarioId = "optimistic" | "realistic" | "pessimistic" | "ceasefire";

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
    label: "国際協調",
    description: "代替航路確保・IEA協調備蓄放出・需要抑制政策（速度制限/在宅勤務）実施・需要15%削減。実効遮断率50%まで低下",
    oilBlockadeRate: 0.50,
    lngBlockadeRate: 0.03,
    demandReductionRate: 0.15,
  },
  realistic: {
    id: "realistic",
    label: "標準対応",
    description: "国家・民間備蓄放出・代替供給限定・需要5%削減。現実的な政策対応の標準想定",
    oilBlockadeRate: 0.94,
    lngBlockadeRate: 0.063,
    demandReductionRate: 0.05,
  },
  pessimistic: {
    id: "pessimistic",
    label: "需要超過",
    description: "代替ルートも混乱・需要超過により供給制約が最大化（参考ケース）",
    oilBlockadeRate: 1.0,
    lngBlockadeRate: 0.15,
    demandReductionRate: -0.10,
  },
  ceasefire: {
    id: "ceasefire",
    label: "停戦・回復",
    description: "停戦合意後の段階的供給回復。港湾再開・タンカー回航・契約正常化に60〜90日要する。構造的残存リスク8%",
    oilBlockadeRate: 0.08,
    lngBlockadeRate: 0.005,
    demandReductionRate: -0.08,
  },
} as const;

export const SCENARIO_LIST: Scenario[] = [
  SCENARIOS.optimistic,
  SCENARIOS.realistic,
  SCENARIOS.pessimistic,
  SCENARIOS.ceasefire,
];

export const DEFAULT_SCENARIO: ScenarioId = "realistic";
