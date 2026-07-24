/**
 * 危機連動の派生数字を単一ロジックで算出する（Single Source of Truth）。
 *
 * 石油備蓄日数・LNG在庫日数・火力比率・中東/ホルムズ依存率などは、
 * これまで index.html（meta/OGP/JSON-LD/FAQ/noscript）や各コンポーネントに
 * 独立してハードコードされ、更新のたび手動同期が必要だった。
 *
 * 算出元は reserves.json / consumption.json の実データのみ。
 * - ビルド時: vite.config の transformIndexHtml が keyFactTokens() で index.html に注入
 * - 将来（層C）: コンポーネントのハードコード置換にも computeKeyFacts() を再利用できる
 *
 * ここに集約することで「reserves.json を1本更新すれば表示面すべてが追随する」を保証する。
 */

/** 算出に必要な reserves.json の部分構造（構造的部分型で受ける） */
export interface KeyFactReserves {
  oil: {
    totalReserveDays: number;
    nationalReserveDays: number;
    privateReserveDays: number;
    jointReserveDays: number;
    hormuzDependencyRate: number;
  };
  lng: {
    inventory_t: number;
    hormuzDependencyRate: number;
  };
  electricity: {
    thermalShareRate: number;
  };
}

/** 算出に必要な consumption.json の部分構造 */
export interface KeyFactConsumption {
  lng: {
    dailyConsumption_t: number;
  };
}

/** index.html・UI 双方が参照する危機連動の表示値 */
export interface KeyFacts {
  /** 石油備蓄 合計日数 */
  oilReserveDays: number;
  /** 石油備蓄 国家日数 */
  oilNationalDays: number;
  /** 石油備蓄 民間日数 */
  oilPrivateDays: number;
  /** 石油備蓄 産油国共同日数 */
  oilJointDays: number;
  /** LNG在庫日数 = 在庫t ÷ 日量消費t */
  lngReserveDays: number;
  /** 火力発電比率(%) */
  thermalPct: number;
  /** 石油 中東依存率(%) */
  oilHormuzPct: number;
  /** LNG ホルムズ直接依存率(%・小数第1位) */
  lngHormuzPct: number;
  /** LNG 非ホルムズ継続率(%・小数第1位) */
  lngNonHormuzPct: number;
}

/** 小数第1位で丸める（6.3% 等の依存率表記用） */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * reserves.json / consumption.json から危機連動の表示値を算出する。
 */
export function computeKeyFacts(
  reserves: KeyFactReserves,
  consumption: KeyFactConsumption,
): KeyFacts {
  const lngHormuzPct = round1(reserves.lng.hormuzDependencyRate * 100);
  return {
    oilReserveDays: reserves.oil.totalReserveDays,
    oilNationalDays: reserves.oil.nationalReserveDays,
    oilPrivateDays: reserves.oil.privateReserveDays,
    oilJointDays: reserves.oil.jointReserveDays,
    lngReserveDays: Math.round(reserves.lng.inventory_t / consumption.lng.dailyConsumption_t),
    thermalPct: Math.round(reserves.electricity.thermalShareRate * 100),
    oilHormuzPct: Math.round(reserves.oil.hormuzDependencyRate * 100),
    lngHormuzPct,
    lngNonHormuzPct: round1(100 - lngHormuzPct),
  };
}

/**
 * KeyFacts を index.html のプレースホルダトークン（{{NAME}}）→ 置換文字列のマップに変換する。
 * vite.config の transformIndexHtml が利用する。
 */
export function keyFactTokens(facts: KeyFacts): Record<string, string> {
  return {
    OIL_RESERVE_DAYS: String(facts.oilReserveDays),
    OIL_NATIONAL_DAYS: String(facts.oilNationalDays),
    OIL_PRIVATE_DAYS: String(facts.oilPrivateDays),
    OIL_JOINT_DAYS: String(facts.oilJointDays),
    LNG_RESERVE_DAYS: String(facts.lngReserveDays),
    THERMAL_PCT: String(facts.thermalPct),
    OIL_HORMUZ_PCT: String(facts.oilHormuzPct),
    LNG_HORMUZ_PCT: String(facts.lngHormuzPct),
    LNG_NONHORMUZ_PCT: String(facts.lngNonHormuzPct),
  };
}
