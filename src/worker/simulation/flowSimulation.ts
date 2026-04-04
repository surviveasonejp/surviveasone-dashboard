/**
 * フロー型シミュレーションエンジン（サーバーサイド）
 *
 * dStock/dt = Inflow(t) - Consumption(t) + SPR_Release(t)
 * supply(t) = min(stock(t), processingCapacity)
 *
 * Phase 5 拡張:
 * - #3 SPR放出メカニズム（リードタイム + 日次上限 + 民間制約）
 * - #4 封鎖解除曲線（blockadeRate を時間関数化）
 * - #5 需要破壊モデリング（在庫%に連動した動的需要削減）
 * - #10 歴史データ対比マーカー
 */

import type {
  FlowState,
  ThresholdType,
  ThresholdEvent,
  FlowSimulationResult,
  PolicyEffects,
} from "../../shared/types";
import { type ScenarioId, SCENARIOS } from "../../shared/scenarios";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";
import staticTankerData from "../data/tankers.json";

// ─── 閾値定義 ─────────────────────────────────────────

const THRESHOLDS: Array<{ percent: number; type: ThresholdType; label: string }> = [
  { percent: 50, type: "price_spike", label: "価格暴騰（買い占め・パニック買い発生）" },
  { percent: 30, type: "rationing", label: "供給制限（給油制限・奇数偶数制の導入）" },
  { percent: 10, type: "distribution", label: "配給制（政府管理下の燃料・食料分配）" },
  { percent: 0, type: "stop", label: "完全停止（備蓄ゼロ・自力生存へ）" },
  { percent: 30, type: "logistics_limit", label: "物流制限（トラック配車50%制限・長距離輸送停止）" },
  { percent: 5, type: "logistics_stop", label: "物流停止（トラック燃料枯渇・配送完全停止）" },
];

// ─── 遅延パラメータ ──────────────────────────────────

const REFINING_DELAY_DAYS = 5;
const LNG_REGAS_DELAY_DAYS = 2;

// ─── #3 SPR放出パラメータ ────────────────────────────
// 出典: 石油備蓄法(昭和50年法律第96号) + IEA Emergency Response Mechanism
// リードタイム根拠: IEA協調行動要請(数日)→閣議了解(1-2日)→JOGMEC放出指示→
//   基地からの出荷開始(タンク搬出・ポンプ稼働に3-5日)→精製工場到着(2-3日) = 計約14日
// 参考: 2022年IEA協調放出時は閣議了解から実出荷まで約10日(JOGMEC報告)

const SPR_NATIONAL_LEAD_TIME_DAYS = 14;
// 出典: JOGMEC 石油備蓄基地一覧の全10基地出荷能力合算(推定)。
// 各基地のポンプ・パイプライン能力は非公開だが、全量放出に約5ヶ月(≈日量30万kL)が目安
const SPR_NATIONAL_DAILY_MAX_KL = 300000;
// 民間備蓄の実効利用可能率。
// 公式推定(石油連盟2019年): 利用可能率70%（操業用ワーキングストック30%控除）。
// 実効値補正: 製油所底部残液・タンカーバラスト・精製所停止時の運転継続在庫等を
// 追加考慮すると実質利用可能率は30〜50%程度。中央値として40%を採用。
// 根拠: 資源エネルギー庁「石油備蓄実効値評価」分析 + IEA協調放出(2022年)時の
// 日本分実出荷量(JOGMEC報告)と整合。
const SPR_PRIVATE_USABLE_RATIO = 0.40;
const SPR_PRIVATE_DAILY_MAX_KL = 200000;

// 産油国共同備蓄の実効利用可能率（シナリオ別）
// 契約ベースで確実性が低く、産油国の政治的立場・外交交渉遅延で利用不可になり得る。
// 楽観: 全量(100%) / 現実: 50%(契約交渉遅延・輸送手配) / 悲観: 0%(産油国が封鎖側を支持)
const JOINT_STOCK_USABLE_RATIO: Record<string, number> = {
  optimistic: 1.0,
  realistic: 0.5,
  pessimistic: 0.0,
};

// 国家備蓄（原油タンク）の精製変換係数
// 国家備蓄の大半は原油備蓄(タンク)であり、ガソリン等の製品として流通させるには
// 精製工程が必要。精製稼働率×製品歩留り×搬送ロス = 約82%が実際の製品供給に転換可能。
// 出典: IEA "Oil Supply Security" (2014) Table 1.2 conversion factor ≈ 0.82
const REFINERY_CONVERSION_RATIO = 0.82;

// ─── #4 封鎖解除曲線 ────────────────────────────────

interface BlockadeProfile {
  /** 初期遮断率（day 0） */
  initialRate: number;
  /** 解除開始日 */
  reliefStartDay: number;
  /** 完全解除日（この日に最終遮断率に達する） */
  reliefEndDay: number;
  /** 最終遮断率 */
  finalRate: number;
}

const BLOCKADE_PROFILES: Record<ScenarioId, BlockadeProfile> = {
  optimistic: {
    initialRate: 0.50,
    reliefStartDay: 7,   // 1週間で米軍介入開始
    reliefEndDay: 30,     // 1ヶ月で大幅解除
    finalRate: 0.10,      // 10%残留リスク
  },
  realistic: {
    initialRate: 0.94,
    reliefStartDay: 30,   // 1ヶ月は全面封鎖
    reliefEndDay: 120,    // 4ヶ月で段階的解除
    finalRate: 0.30,      // 30%残留（機雷等）
  },
  pessimistic: {
    initialRate: 1.0,
    reliefStartDay: 90,   // 3ヶ月間は全面封鎖
    reliefEndDay: 365,    // 1年かけて段階的解除
    finalRate: 0.60,      // 60%残留
  },
};

function getBlockadeRate(day: number, profile: BlockadeProfile): number {
  if (day < profile.reliefStartDay) return profile.initialRate;
  if (day >= profile.reliefEndDay) return profile.finalRate;
  // 線形補間で段階的に解除
  const t = (day - profile.reliefStartDay) / (profile.reliefEndDay - profile.reliefStartDay);
  return profile.initialRate + (profile.finalRate - profile.initialRate) * t;
}

// ─── #5 需要破壊モデリング ───────────────────────────

/**
 * 在庫残量(%)から石油価格倍率を算出（フィードバックループ用）
 *
 * EconomicCascade.tsx の getOilPriceMultiplier() と同一ロジック。
 * 需要破壊を「在庫% → 価格 → 需要」の経路で計算するために参照。
 *
 * 出典: IEA World Energy Outlook 2024 + 1973年石油ショック実績
 */
function getOilPriceMultiplierForDemand(stockPercent: number): number {
  if (stockPercent > 80) return 1.0;
  if (stockPercent > 50) return 1.0 + (80 - stockPercent) * 0.05;  // 80→50%: 1.0→2.5倍
  if (stockPercent > 30) return 2.5 + (50 - stockPercent) * 0.1;   // 50→30%: 2.5→4.5倍
  if (stockPercent > 10) return 4.5 + (30 - stockPercent) * 0.2;   // 30→10%: 4.5→8.5倍
  return 8.5 + (10 - stockPercent) * 0.5;                           // 10→0%: 8.5→13.5倍
}

/**
 * 在庫残量(%)に応じた需要削減率を返す（価格媒介型・フィードバックループ統合版）
 *
 * 供給ショック → 価格高騰 → 需要崩壊 の連鎖を価格を媒介して計算。
 * 旧実装（在庫%からの段階関数）を価格弾力性モデルに置き換え。
 * キー閾値での需要破壊量は旧実装と同値を維持し、区間を線形補間して連続化。
 *
 * 価格倍率 → 需要削減マッピング（IEA "Saving Oil in a Hurry" + 1973年危機実績）:
 *   1.0倍（在庫80%以上）: 削減なし         → factor 1.0
 *   2.5倍（在庫50%相当）: 産業用15%削減    → factor 0.85
 *   4.5倍（在庫30%相当）: 産業+商業35%削減 → factor 0.65
 *   8.5倍（在庫10%相当）: 生活必需のみ     → factor 0.45
 *
 * 出典:
 * - Hamilton, J.D. (2003) "What is an Oil Shock?" Journal of Econometrics, 113(2), 363-398
 * - 1973年第一次石油危機: 消費量前年比7.3%減(60日時点)→最大15%減(90日時点)
 *   (経産省「石油危機の教訓」2018年エネルギー白書)
 * - IEA "Energy Supply Security 2014" - 価格弾力性による需要破壊の段階モデル
 * - 閾値の50%/30%/10%は石油備蓄法の放出段階(注意→警戒→緊急)に概ね対応
 */
function getDemandDestructionFactor(stockPercent: number): number {
  const p = getOilPriceMultiplierForDemand(stockPercent);
  // 価格倍率 → 需要削減: キー閾値間を線形補間
  if (p <= 1.0) return 1.0;
  if (p <= 2.5) return 1.0  - (p - 1.0) * (0.15 / 1.5); // 1.0→2.5倍: factor 1.0→0.85
  if (p <= 4.5) return 0.85 - (p - 2.5) * (0.20 / 2.0); // 2.5→4.5倍: factor 0.85→0.65
  if (p <= 8.5) return 0.65 - (p - 4.5) * (0.20 / 4.0); // 4.5→8.5倍: factor 0.65→0.45
  return 0.45;                                             // 生活必需のみ。55%削減
}

// ─── #7 代替供給ルートモデル ─────────────────────────
//
// ホルムズ封鎖後に確保される代替供給を日次でシミュレート。
// 根拠:
// - フジャイラ(UAE): ホルムズ外の貯蔵拠点(7000万バレル)。即座に出荷可能だが容量制限あり
// - ヤンブー(サウジ西岸): 東西パイプライン経由。日量400万バレル(VLCC2隻分/日)に拡大(Bloomberg 2026-03)
// - 非中東調達: インド・アフリカ・豪州等。リードタイム長いが到着確率高い
// - 国際競争: 中国・韓国・欧州がアジア市場で取り合い → 調達成功率が時間とともに低下

interface AlternativeSupplyProfile {
  /** 代替供給開始日（調達契約→出荷→到着のリードタイム） */
  startDay: number;
  /** フジャイラ日量 (kL)。アラビアン・ライト系→精製互換性問題なし */
  fujairahDailyKL: number;
  /** ヤンブー日量 (kL)。サウジ西岸積み→アラビアン・ライト系で互換性問題なし */
  yanbuDailyKL: number;
  /** 非中東日量 (kL)。豪州・インドネシア・アフリカ等 */
  nonMiddleEastDailyKL: number;
  /**
   * 非中東原油の精製互換性係数 (0-1)
   *
   * 日本の製油所はアラビアン・ライト系（API比重27〜34°、硫黄分0.8〜2.5%）に最適化。
   * 非中東原油（豪州軽質・アフリカ・WTI）は成分が異なり即座に全量処理できない。
   * この係数は「到着した非中東原油のうち既存設備で即処理できる割合」を表す。
   * 残りは設備改造（6〜18ヶ月）が完了するまで製品化できない。
   *
   * 出典: 石油連盟「製油所設備能力調査」+ 資源エネルギー庁「原油調達多様化報告」
   */
  nonMideastCompatibilityFactor: number;
  /** 初期調達成功率 (0-1) */
  initialSuccessRate: number;
  /** 成功率の低下速度（日次、国際競争による） */
  successRateDecayPerDay: number;
  /** 成功率の下限 */
  minSuccessRate: number;
}

const ALT_SUPPLY_PROFILES: Record<ScenarioId, AlternativeSupplyProfile> = {
  optimistic: {
    startDay: 14,                  // 2週間で代替調達開始
    fujairahDailyKL: 80000,        // フジャイラ8万kL/日（VLCC 0.5隻分相当）
    yanbuDailyKL: 60000,                // ヤンブー6万kL/日
    nonMiddleEastDailyKL: 40000,        // 非中東4万kL/日
    nonMideastCompatibilityFactor: 0.6, // 非中東原油の60%を即処理可能（設備余裕あり）
    initialSuccessRate: 0.7,            // 初期成功率70%
    successRateDecayPerDay: 0.001,      // 緩やかに低下
    minSuccessRate: 0.4,                // 最低40%
  },
  realistic: {
    startDay: 28,                       // 1ヶ月で代替調達開始（経産相発表と整合）
    fujairahDailyKL: 50000,             // フジャイラ5万kL/日
    yanbuDailyKL: 40000,                // ヤンブー4万kL/日
    nonMiddleEastDailyKL: 20000,        // 非中東2万kL/日
    nonMideastCompatibilityFactor: 0.4, // 非中東原油の40%のみ即処理可能
    initialSuccessRate: 0.4,            // 初期成功率40%（アジア競争激化）
    successRateDecayPerDay: 0.002,      // 日々低下
    minSuccessRate: 0.15,               // 最低15%
  },
  pessimistic: {
    startDay: 60,                       // 2ヶ月まで代替確保不能
    fujairahDailyKL: 20000,             // フジャイラ限定的
    yanbuDailyKL: 15000,                // ヤンブーもバベルマンデブ封鎖で制限
    nonMiddleEastDailyKL: 10000,        // 非中東も国際取り合い
    nonMideastCompatibilityFactor: 0.2, // 非中東原油の20%のみ即処理可能（設備改造未実施）
    initialSuccessRate: 0.2,            // 初期成功率20%
    successRateDecayPerDay: 0.003,      // 急速に低下
    minSuccessRate: 0.05,               // ほぼ調達不能
  },
};

/** 指定日の代替供給量 (kL) を返す */
function getAlternativeSupply(day: number, profile: AlternativeSupplyProfile): number {
  if (day < profile.startDay) return 0;

  const daysSinceStart = day - profile.startDay;
  const successRate = Math.max(
    profile.minSuccessRate,
    profile.initialSuccessRate - daysSinceStart * profile.successRateDecayPerDay,
  );

  // フジャイラ・ヤンブーはアラビアン・ライト系 → 精製互換性問題なし
  // 非中東原油は互換性係数を適用（設備改造が完了するまで全量処理不可）
  const totalDailyCapacity =
    profile.fujairahDailyKL +
    profile.yanbuDailyKL +
    profile.nonMiddleEastDailyKL * profile.nonMideastCompatibilityFactor;

  return totalDailyCapacity * successRate;
}

// ─── #10 歴史データ対比マーカー ──────────────────────

const HISTORICAL_MARKERS: Array<{ day: number; label: string }> = [
  { day: 14, label: "1973年石油危機: トイレットペーパー騒動発生" },
  { day: 60, label: "1973年石油危機: 消費量前年比7.3%減少に到達" },
  { day: 90, label: "2011年福島: 全原発停止完了" },
];

// ─── シミュレーション ────────────────────────────────

export function runFlowSimulation(
  scenarioId: ScenarioId = "realistic",
  maxDays: number = 365,
): FlowSimulationResult {
  const s = SCENARIOS[scenarioId];
  const blockadeProfile = BLOCKADE_PROFILES[scenarioId];
  const altSupplyProfile = ALT_SUPPLY_PROFILES[scenarioId];

  // #3 SPR: 備蓄を種別ごとに分離管理
  let oilNationalStock = staticReserves.oil.nationalReserve_kL;
  let oilPrivateStock = staticReserves.oil.privateReserve_kL * SPR_PRIVATE_USABLE_RATIO;
  let oilJointStock = staticReserves.oil.jointReserve_kL * (JOINT_STOCK_USABLE_RATIO[scenarioId] ?? 0);
  let oilCommercialStock = staticReserves.oil.privateReserve_kL * (1 - SPR_PRIVATE_USABLE_RATIO); // 操業用在庫

  let oilStock = oilPrivateStock + oilJointStock + oilCommercialStock; // 即時利用可能分
  let lngStock = staticReserves.lng.inventory_t;

  const totalOilReserve = staticReserves.oil.totalReserve_kL;
  const initialOil = totalOilReserve;
  const initialLng = lngStock;

  const baseDailyOil = staticConsumption.oil.dailyConsumption_kL * (1 - s.demandReductionRate);
  const baseDailyLng = staticConsumption.lng.dailyConsumption_t * (1 - s.demandReductionRate);

  // LNG: 非ホルムズ供給（封鎖されても継続する輸入分）
  const lngNonHormuzSupply = staticConsumption.lng.dailyConsumption_t * (1 - staticReserves.lng.hormuzDependencyRate);

  const oilArrivals = buildArrivalSchedule("VLCC", blockadeProfile.initialRate);
  const lngArrivals = buildArrivalSchedule("LNG", blockadeProfile.initialRate);

  const timeline: FlowState[] = [];
  const thresholds: ThresholdEvent[] = [];
  let oilDepletionDay = maxDays;
  let lngDepletionDay = maxDays;
  let powerCollapseDay = maxDays;

  const oilThresholdHit = new Set<number>();
  const lngThresholdHit = new Set<number>();

  let oilRationFactor = 1.0;
  let lngRationFactor = 1.0;
  let nationalReleaseStarted = false;
  let altSupplyStarted = false;

  for (let day = 0; day < maxDays; day++) {
    // #4 封鎖解除曲線: 日ごとの遮断率
    const currentBlockadeRate = getBlockadeRate(day, blockadeProfile);

    // タンカー到着（遅延込み）
    const oilArrival = oilArrivals.get(day - REFINING_DELAY_DAYS) ?? 0;
    const lngArrival = lngArrivals.get(day - LNG_REGAS_DELAY_DAYS) ?? 0;
    oilStock += oilArrival;
    lngStock += lngArrival;

    // #7 代替供給ルート（封鎖後の新規調達）
    const altSupply = getAlternativeSupply(day, altSupplyProfile);
    if (altSupply > 0) {
      oilStock += altSupply;
      if (!altSupplyStarted) {
        altSupplyStarted = true;
        thresholds.push({
          day,
          type: "price_spike",
          resource: "oil",
          stockPercent: Math.round((oilStock / initialOil) * 1000) / 10,
          label: `代替供給 開始（${Math.round(altSupply).toLocaleString()} kL/日）`,
        });
      }
    }

    // #3 SPR: 国家備蓄放出（リードタイム後）
    if (day >= SPR_NATIONAL_LEAD_TIME_DAYS && oilNationalStock > 0) {
      if (!nationalReleaseStarted) {
        nationalReleaseStarted = true;
        thresholds.push({
          day,
          type: "price_spike",
          resource: "oil",
          stockPercent: Math.round((oilStock / initialOil) * 1000) / 10,
          label: "国家備蓄 放出開始",
        });
      }
      const release = Math.min(SPR_NATIONAL_DAILY_MAX_KL, oilNationalStock);
      oilNationalStock -= release;
      // 原油→製品変換ロスを考慮: 精製変換係数(0.82)分のみが実際の製品として流通
      oilStock += release * REFINERY_CONVERSION_RATIO;
    }

    // #5 需要破壊: 在庫残量に応じた動的需要削減
    const oilPercent = (oilStock / initialOil) * 100;
    const lngPercent = (lngStock / initialLng) * 100;
    const oilDemandDestruction = getDemandDestructionFactor(oilPercent);
    const lngDemandDestruction = getDemandDestructionFactor(lngPercent);

    // 石油: 封鎖で輸入が止まり在庫から消費（従来モデル）
    const dailyOil = baseDailyOil * currentBlockadeRate * oilRationFactor * oilDemandDestruction;
    oilStock = Math.max(0, oilStock - dailyOil);

    // LNG: 消費は需要ベース（封鎖率は消費に影響しない）
    // 非ホルムズ供給（93.7%）は継続、ホルムズ分（6.3%）のみ途絶
    // → 在庫減少 = 消費量 - 非ホルムズ供給 × 封鎖解除曲線補正
    const lngConsumption = baseDailyLng * lngRationFactor * lngDemandDestruction;
    const lngContinuingSupply = lngNonHormuzSupply * (1 - s.demandReductionRate);
    // 封鎖解除に伴いホルムズ経由LNGも段階的に復帰
    const lngHormuzRecovery = staticConsumption.lng.dailyConsumption_t
      * staticReserves.lng.hormuzDependencyRate * (1 - currentBlockadeRate) * (1 - s.demandReductionRate);
    const lngNetDraw = Math.max(0, lngConsumption - lngContinuingSupply - lngHormuzRecovery);
    lngStock = Math.max(0, lngStock - lngNetDraw);

    const oilSupply = Math.min(dailyOil, oilStock);
    const lngSupply = Math.min(lngConsumption, lngStock + lngContinuingSupply + lngHormuzRecovery);

    // 物流稼働率: 石油在庫%に連動
    const oilPctForLogistics = (oilStock / initialOil) * 100;
    const logisticsCapacity_pct = oilPctForLogistics > 50 ? 100
      : oilPctForLogistics > 30 ? 70
      : oilPctForLogistics > 10 ? 30
      : oilPctForLogistics > 0 ? 10
      : 0;

    timeline.push({
      day,
      oilStock_kL: Math.round(oilStock),
      lngStock_t: Math.round(lngStock),
      oilSupply_kL: Math.round(oilSupply),
      lngSupply_t: Math.round(lngSupply),
      logisticsCapacity_pct,
    });

    // 閾値判定
    const oilPercentNow = (oilStock / initialOil) * 100;
    const lngPercentNow = (lngStock / initialLng) * 100;

    for (const th of THRESHOLDS) {
      if (oilPercentNow <= th.percent && !oilThresholdHit.has(th.percent)) {
        oilThresholdHit.add(th.percent);
        const isLogistics = th.type === "logistics_limit" || th.type === "logistics_stop";
        thresholds.push({
          day,
          type: th.type,
          resource: isLogistics ? "logistics" : "oil",
          stockPercent: Math.round(oilPercentNow * 10) / 10,
          label: isLogistics ? th.label : `石油 ${th.label}`,
        });
        if (th.type === "rationing") oilRationFactor = 0.7;
        if (th.type === "distribution") oilRationFactor = 0.4;
      }
      if (lngPercentNow <= th.percent && !lngThresholdHit.has(th.percent)) {
        lngThresholdHit.add(th.percent);
        thresholds.push({
          day,
          type: th.type,
          resource: "lng",
          stockPercent: Math.round(lngPercentNow * 10) / 10,
          label: `LNG ${th.label}`,
        });
        if (th.type === "rationing") lngRationFactor = 0.7;
        if (th.type === "distribution") lngRationFactor = 0.4;
      }
    }

    if (oilStock <= 0 && oilDepletionDay === maxDays) {
      oilDepletionDay = day;
    }
    if (lngStock <= 0 && lngDepletionDay === maxDays) {
      lngDepletionDay = day;
    }
  }

  powerCollapseDay = Math.round(lngDepletionDay * staticReserves.electricity.thermalShareRate);

  if (powerCollapseDay < maxDays) {
    thresholds.push({
      day: powerCollapseDay,
      type: "stop",
      resource: "power",
      stockPercent: 0,
      label: "電力 完全停止",
    });

    // 水道崩壊カスケード
    thresholds.push({
      day: powerCollapseDay,
      type: "water_pressure",
      resource: "water",
      stockPercent: 50,
      label: "水道 水圧低下（高層階断水）",
    });
    thresholds.push({
      day: Math.min(powerCollapseDay + 1, maxDays),
      type: "water_cutoff",
      resource: "water",
      stockPercent: 10,
      label: "水道 広域断水（配水池枯渇）",
    });
    thresholds.push({
      day: Math.min(powerCollapseDay + 3, maxDays),
      type: "water_sanitation",
      resource: "water",
      stockPercent: 0,
      label: "下水処理停止（衛生崩壊）",
    });

    // 廃棄物カスケード: 焼却炉は電力停止で即時停止
    thresholds.push({
      day: powerCollapseDay,
      type: "waste_incineration",
      resource: "power",
      stockPercent: 0,
      label: "ごみ焼却炉停止（電力喪失）",
    });
  }

  // 廃棄物カスケード: ゴミ収集は石油供給制限で停止（収集車燃料2-3日分）
  const oilRationingEvent = thresholds.find((e) => e.type === "rationing" && e.resource === "oil");
  if (oilRationingEvent) {
    thresholds.push({
      day: Math.min(oilRationingEvent.day + 3, maxDays),
      type: "waste_collection",
      resource: "oil",
      stockPercent: oilRationingEvent.stockPercent,
      label: "ゴミ収集停止（収集車燃料枯渇）",
    });
  }

  // #10 歴史データ対比マーカー
  for (const marker of HISTORICAL_MARKERS) {
    if (marker.day < maxDays) {
      thresholds.push({
        day: marker.day,
        type: "price_spike",
        resource: "oil",
        stockPercent: -1, // マーカー識別用
        label: `【歴史】${marker.label}`,
      });
    }
  }

  thresholds.sort((a, b) => a.day - b.day);

  const policyEffects = calcPolicyEffects(scenarioId, maxDays, { oilDepletionDay, lngDepletionDay, powerCollapseDay });
  return { timeline, oilDepletionDay, lngDepletionDay, powerCollapseDay, thresholds, policyEffects };
}

// ─── 政策効果計算（枯渇日数のみ、タイムライン不要） ────

interface PolicySimOptions {
  withSpr: boolean;
  withAltSupply: boolean;
  oilDemandMultiplier: number;
  lngDemandMultiplier: number;
  extraLngStock_t: number;
}

function calcDepletionDaysOnly(
  scenarioId: ScenarioId,
  maxDays: number,
  opts: PolicySimOptions,
): { oilDepletionDay: number; lngDepletionDay: number; powerCollapseDay: number } {
  const s = SCENARIOS[scenarioId];
  const blockadeProfile = BLOCKADE_PROFILES[scenarioId];
  const altSupplyProfile = ALT_SUPPLY_PROFILES[scenarioId];

  let oilNationalStock = opts.withSpr ? staticReserves.oil.nationalReserve_kL : 0;
  const oilPrivateStock = staticReserves.oil.privateReserve_kL * SPR_PRIVATE_USABLE_RATIO;
  const oilJointStock = opts.withSpr
    ? staticReserves.oil.jointReserve_kL * (JOINT_STOCK_USABLE_RATIO[scenarioId] ?? 0)
    : 0;
  const oilCommercialStock = staticReserves.oil.privateReserve_kL * (1 - SPR_PRIVATE_USABLE_RATIO);

  let oilStock = oilPrivateStock + oilJointStock + oilCommercialStock;
  let lngStock = staticReserves.lng.inventory_t + opts.extraLngStock_t;

  const initialOil = staticReserves.oil.totalReserve_kL;
  const initialLng = staticReserves.lng.inventory_t + opts.extraLngStock_t;

  const baseDailyOil = staticConsumption.oil.dailyConsumption_kL * (1 - s.demandReductionRate) * opts.oilDemandMultiplier;
  const baseDailyLng = staticConsumption.lng.dailyConsumption_t * (1 - s.demandReductionRate) * opts.lngDemandMultiplier;
  const lngNonHormuzSupply = staticConsumption.lng.dailyConsumption_t * opts.lngDemandMultiplier * (1 - staticReserves.lng.hormuzDependencyRate);

  const oilArrivals = buildArrivalSchedule("VLCC", blockadeProfile.initialRate);
  const lngArrivals = buildArrivalSchedule("LNG", blockadeProfile.initialRate);

  let oilDepletionDay = maxDays;
  let lngDepletionDay = maxDays;
  let oilRationFactor = 1.0;
  let lngRationFactor = 1.0;
  const oilThresholdHit = new Set<number>();
  const lngThresholdHit = new Set<number>();

  for (let day = 0; day < maxDays; day++) {
    const currentBlockadeRate = getBlockadeRate(day, blockadeProfile);

    oilStock += oilArrivals.get(day - REFINING_DELAY_DAYS) ?? 0;
    lngStock += lngArrivals.get(day - LNG_REGAS_DELAY_DAYS) ?? 0;

    if (opts.withAltSupply) {
      oilStock += getAlternativeSupply(day, altSupplyProfile);
    }

    if (opts.withSpr && day >= SPR_NATIONAL_LEAD_TIME_DAYS && oilNationalStock > 0) {
      const release = Math.min(SPR_NATIONAL_DAILY_MAX_KL, oilNationalStock);
      oilNationalStock -= release;
      oilStock += release * REFINERY_CONVERSION_RATIO;
    }

    const oilPercent = (oilStock / initialOil) * 100;
    const lngPercent = (lngStock / initialLng) * 100;
    const oilDemandDestruction = getDemandDestructionFactor(oilPercent);
    const lngDemandDestruction = getDemandDestructionFactor(lngPercent);

    const dailyOil = baseDailyOil * currentBlockadeRate * oilRationFactor * oilDemandDestruction;
    oilStock = Math.max(0, oilStock - dailyOil);

    const lngConsumption = baseDailyLng * lngRationFactor * lngDemandDestruction;
    const lngContinuingSupply = lngNonHormuzSupply * (1 - s.demandReductionRate);
    const lngHormuzRecovery = staticConsumption.lng.dailyConsumption_t
      * opts.lngDemandMultiplier
      * staticReserves.lng.hormuzDependencyRate * (1 - currentBlockadeRate) * (1 - s.demandReductionRate);
    const lngNetDraw = Math.max(0, lngConsumption - lngContinuingSupply - lngHormuzRecovery);
    lngStock = Math.max(0, lngStock - lngNetDraw);

    const oilPercentNow = (oilStock / initialOil) * 100;
    const lngPercentNow = (lngStock / initialLng) * 100;
    for (const th of THRESHOLDS) {
      if (oilPercentNow <= th.percent && !oilThresholdHit.has(th.percent)) {
        oilThresholdHit.add(th.percent);
        if (th.type === "rationing") oilRationFactor = 0.7;
        if (th.type === "distribution") oilRationFactor = 0.4;
      }
      if (lngPercentNow <= th.percent && !lngThresholdHit.has(th.percent)) {
        lngThresholdHit.add(th.percent);
        if (th.type === "rationing") lngRationFactor = 0.7;
        if (th.type === "distribution") lngRationFactor = 0.4;
      }
    }

    if (oilStock <= 0 && oilDepletionDay === maxDays) oilDepletionDay = day;
    if (lngStock <= 0 && lngDepletionDay === maxDays) lngDepletionDay = day;
  }

  const powerCollapseDay = Math.round(lngDepletionDay * staticReserves.electricity.thermalShareRate);
  return { oilDepletionDay, lngDepletionDay, powerCollapseDay };
}

function calcPolicyEffects(
  scenarioId: ScenarioId,
  maxDays: number,
  current: { oilDepletionDay: number; lngDepletionDay: number; powerCollapseDay: number },
): PolicyEffects {
  const clamp = (v: number) => Math.max(0, Math.min(v, maxDays));

  // ベースライン: SPR無し・代替供給無し
  const baseline = calcDepletionDaysOnly(scenarioId, maxDays, {
    withSpr: false, withAltSupply: false,
    oilDemandMultiplier: 1.0, lngDemandMultiplier: 1.0, extraLngStock_t: 0,
  });

  // 燃料消費制限-10%（現行シミュレーションに追加）
  const demandCut = calcDepletionDaysOnly(scenarioId, maxDays, {
    withSpr: true, withAltSupply: true,
    oilDemandMultiplier: 0.90, lngDemandMultiplier: 1.0, extraLngStock_t: 0,
  });

  // 緊急節電-15%（LNG消費を15%削減）
  const emergencyPower = calcDepletionDaysOnly(scenarioId, maxDays, {
    withSpr: true, withAltSupply: true,
    oilDemandMultiplier: 1.0, lngDemandMultiplier: 0.85, extraLngStock_t: 0,
  });

  // LNGスポット調達: 7日分相当の追加在庫
  const lngSpotAddition = Math.round(staticConsumption.lng.dailyConsumption_t * 7);
  const lngSpot = calcDepletionDaysOnly(scenarioId, maxDays, {
    withSpr: true, withAltSupply: true,
    oilDemandMultiplier: 1.0, lngDemandMultiplier: 1.0, extraLngStock_t: lngSpotAddition,
  });

  return {
    baseline: { oilDay: baseline.oilDepletionDay, lngDay: baseline.lngDepletionDay, powerDay: baseline.powerCollapseDay },
    sprRelease: {
      oilDaysGain: clamp(current.oilDepletionDay - baseline.oilDepletionDay),
      lngDaysGain: clamp(current.lngDepletionDay - baseline.lngDepletionDay),
      powerDaysGain: clamp(current.powerCollapseDay - baseline.powerCollapseDay),
    },
    demandCut10pct: {
      oilDaysGain: clamp(demandCut.oilDepletionDay - current.oilDepletionDay),
      lngDaysGain: clamp(demandCut.lngDepletionDay - current.lngDepletionDay),
      powerDaysGain: clamp(demandCut.powerCollapseDay - current.powerCollapseDay),
    },
    emergencyPower15pct: {
      oilDaysGain: clamp(emergencyPower.oilDepletionDay - current.oilDepletionDay),
      lngDaysGain: clamp(emergencyPower.lngDepletionDay - current.lngDepletionDay),
      powerDaysGain: clamp(emergencyPower.powerCollapseDay - current.powerCollapseDay),
    },
    lngSpot: {
      oilDaysGain: 0,
      lngDaysGain: clamp(lngSpot.lngDepletionDay - current.lngDepletionDay),
      powerDaysGain: clamp(lngSpot.powerCollapseDay - current.powerCollapseDay),
    },
  };
}

// ─── タンカー到着スケジュール ─────────────────────────

function buildArrivalSchedule(
  type: "VLCC" | "LNG",
  blockadeRate: number,
): Map<number, number> {
  const schedule = new Map<number, number>();

  for (const vessel of staticTankerData.vessels) {
    if (vessel.type !== type) continue;

    const arrivalDay = Math.ceil(vessel.eta_days);
    const isHormuzRoute =
      vessel.departurePort === "Ras Tanura" ||
      vessel.departurePort === "Jubail" ||
      vessel.departurePort === "Kharg Island" ||
      vessel.departurePort === "Ras Laffan" ||
      vessel.departurePort === "Mina Al Ahmadi" ||
      vessel.departurePort === "Basrah";

    const arrivalProbability = isHormuzRoute ? Math.max(0, 1 - blockadeRate) : 0.95;

    const cargo = type === "VLCC"
      ? vessel.cargo_t * 0.159 * 1000
      : vessel.cargo_t;

    const existing = schedule.get(arrivalDay) ?? 0;
    schedule.set(arrivalDay, existing + cargo * arrivalProbability);
  }

  return schedule;
}
