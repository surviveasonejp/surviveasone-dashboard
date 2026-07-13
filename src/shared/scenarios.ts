export type ScenarioId = "optimistic" | "realistic" | "pessimistic" | "ceasefire" | "intermittent";

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
  intermittent: {
    id: "intermittent",
    label: "断続制約",
    // 停戦と再燃が交互に訪れるオンオフ型（振動レジーム）。
    // Day130までの経緯は実測に整合させ、以降は周期60〜90日の逼迫⇔緩和窓の振動を仮定する。
    // 実測アンカー: 封鎖38日→停戦・小競り合い68日→MoU部分緩和24日（通航は平時の最大39%まで回復）→Day130停戦崩壊・再燃。
    description: "停戦と再燃が交互に訪れるオンオフ型。Day130までは実測に整合させ、以降は周期60〜90日で逼迫と緩和窓が振動すると仮定。長期平均遮断率は約60%",
    // このスカラーは calculations.ts / fallbackCountdowns.ts の静的カウントダウンで
    // 「代表値（時間非依存の単一遮断率）」として消費される（時間可変プロファイルは
    // flowSimulation.ts の BLOCKADE_PROFILES.intermittent が担う）。
    // したがって振動の初期値 0.94 ではなく長期平均に整合する代表値を採用する。
    // 0.60 は BLOCKADE_PROFILES.intermittent の収束値（finalRate 0.60）および
    // 「長期平均遮断率 約60%」の記述と一致させた値。
    oilBlockadeRate: 0.60,
    lngBlockadeRate: 0.05,   // カタールLNGは緩和窓で部分回復するが再燃で再逼迫、長期平均5%
    demandReductionRate: 0.08, // 長期化による節約定着（振動の反復で行動変容が定着）
  },
} as const;

export const SCENARIO_LIST: Scenario[] = [
  SCENARIOS.optimistic,
  SCENARIOS.realistic,
  SCENARIOS.pessimistic,
  SCENARIOS.ceasefire,
  SCENARIOS.intermittent,
];

export const DEFAULT_SCENARIO: ScenarioId = "realistic";
