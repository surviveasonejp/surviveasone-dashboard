/**
 * 居住地タイプ別の備蓄アドバイス
 *
 * foodSelfSufficiency（食料自給率）と deliveryDelayDays（物流遅延日数）を
 * もとに、地域を5タイプに分類し、タイプ別の推奨備蓄量・優先事項を返す。
 *
 * データ根拠: src/worker/data/regions.json の公開値
 * 農水省 都道府県別食料自給率 / 経産省 物流実態調査
 */

export type AreaType = "urban" | "local" | "regional" | "rural" | "island";

interface RegionProfile {
  id: string;
  name: string;
  areaType: AreaType;
  foodSelfSufficiency: number;
  deliveryDelayDays: number;
}

export interface AreaAdvice {
  typeLabel: string;
  typeColor: string;
  typeBg: string;
  summary: string;
  /** 推奨備蓄日数（現状より多く必要な場合は正、余裕がある場合は低め） */
  recommendedDays: { food: number; water: number };
  /** 優先順位（高い順） */
  priorities: { resource: string; reason: string; urgent: boolean }[];
  /** このタイプ固有のリスク */
  risks: string[];
  /** このタイプの強み */
  positives: string[];
}

// 10エリアのプロファイル（foodSelfSufficiency / deliveryDelayDays はregions.jsonと同値）
export const REGION_PROFILES: RegionProfile[] = [
  { id: "hokkaido", name: "北海道",  areaType: "rural",    foodSelfSufficiency: 2.18, deliveryDelayDays: 3 },
  { id: "tohoku",   name: "東北",    areaType: "regional", foodSelfSufficiency: 0.75, deliveryDelayDays: 2 },
  { id: "tokyo",    name: "東京",    areaType: "urban",    foodSelfSufficiency: 0.02, deliveryDelayDays: 1 },
  { id: "chubu",    name: "中部",    areaType: "local",    foodSelfSufficiency: 0.12, deliveryDelayDays: 1 },
  { id: "hokuriku", name: "北陸",    areaType: "regional", foodSelfSufficiency: 0.64, deliveryDelayDays: 4 },
  { id: "kansai",   name: "関西",    areaType: "urban",    foodSelfSufficiency: 0.12, deliveryDelayDays: 2 },
  { id: "chugoku",  name: "中国",    areaType: "regional", foodSelfSufficiency: 0.62, deliveryDelayDays: 2 },
  { id: "shikoku",  name: "四国",    areaType: "local",    foodSelfSufficiency: 0.42, deliveryDelayDays: 3 },
  { id: "kyushu",   name: "九州",    areaType: "regional", foodSelfSufficiency: 0.75, deliveryDelayDays: 2 },
  { id: "okinawa",  name: "沖縄",    areaType: "island",   foodSelfSufficiency: 0.34, deliveryDelayDays: 5 },
];

const AREA_ADVICE: Record<AreaType, AreaAdvice> = {
  urban: {
    typeLabel: "大都市型",
    typeColor: "#dc2626",
    typeBg: "#fef2f2",
    summary: "食料の98%以上を域外に依存。物流が止まると店頭在庫は1〜3日で消失します。備蓄は最も多く必要な居住タイプです。",
    recommendedDays: { food: 14, water: 14 },
    priorities: [
      { resource: "飲料水", reason: "断水は停電翌日から始まる可能性あり。1人3L×人数×14日分を目安に", urgent: true },
      { resource: "食料", reason: "自給できる農地ゼロ。物流停止後は買い足し不可。2週間分以上を確保", urgent: true },
      { resource: "カセットボンベ", reason: "オール電化住宅は停電即日で調理不能。最低30本", urgent: true },
      { resource: "現金", reason: "停電でATM・電子決済が機能しない。5万円以上の現金を手元に", urgent: false },
    ],
    risks: [
      "食料自給率2%以下 — 域外依存で物流途絶が即食料危機に",
      "人口密度が高く配給時の混雑・競合が激化する",
      "集合住宅は停電時の断水が早い（ポンプ停止）",
      "コンビニ・スーパーの在庫は1〜3日で消失する見込み",
    ],
    positives: [
      "病院・透析施設が近くにある場合が多い",
      "公的支援（配給拠点）が早期に整備される傾向",
    ],
  },

  local: {
    typeLabel: "地方都市型",
    typeColor: "#d97706",
    typeBg: "#fffbeb",
    summary: "食料の大半を域外に依存しますが、近隣農家や直売所へのアクセスが大都市より容易な場合があります。",
    recommendedDays: { food: 10, water: 10 },
    priorities: [
      { resource: "飲料水", reason: "1人3L×人数×10日分を確保。井戸・湧水の場所を事前に把握", urgent: true },
      { resource: "食料", reason: "10日分を目安に。近隣農家・直売所へのアクセスルートも確認", urgent: true },
      { resource: "燃料", reason: "カセットボンベ20本以上。車の燃料は常に半分以上を維持", urgent: false },
      { resource: "自転車・移動手段", reason: "ガソリン制限下での近距離移動手段を確保", urgent: false },
    ],
    risks: [
      "物流の主要拠点から離れており、配送遅延が大都市より長い",
      "医療施設が少なく、遠距離通院が必要な場合がある",
    ],
    positives: [
      "農地・漁港が近い地域では直接調達の可能性がある",
      "地域コミュニティの相互扶助が機能しやすい",
      "庭・プランターがあれば簡易的な自家栽培が可能",
    ],
  },

  regional: {
    typeLabel: "地方型",
    typeColor: "#ca8a04",
    typeBg: "#fefce8",
    summary: "食料自給率50〜80%台。農林漁業が身近にあり、供給制約時でも地元調達の余地があります。",
    recommendedDays: { food: 7, water: 7 },
    priorities: [
      { resource: "飲料水", reason: "7日分を確保。近隣の湧水・河川水の浄水方法を把握しておく", urgent: false },
      { resource: "燃料", reason: "農機・暖房・車。地方ほど燃料依存度が高い。カセットボンベ15本以上", urgent: true },
      { resource: "食料", reason: "7日分を目安。農家の知人・直売所との関係を作っておくと有利", urgent: false },
      { resource: "薬・衛生用品", reason: "近隣薬局が少ない。常備薬は90日分を目標に", urgent: false },
    ],
    risks: [
      "冬季は暖房燃料の消費が急増（北陸・東北は特に注意）",
      "配送拠点まで距離があり、物流途絶時の影響が長引く",
    ],
    positives: [
      "農地・漁港が近く、地域内での食料融通が期待できる",
      "一戸建て比率が高く、太陽光・雨水タンクの導入余地がある",
      "地域の相互扶助ネットワークが都市より強固な傾向",
    ],
  },

  rural: {
    typeLabel: "農山村型",
    typeColor: "#16a34a",
    typeBg: "#f0fdf4",
    summary: "北海道など食料自給率200%超の地域。食料そのものより、燃料と輸送手段の確保が最重要課題です。",
    recommendedDays: { food: 5, water: 5 },
    priorities: [
      { resource: "燃料（暖房・農機）", reason: "冬季暖房なしでは命に関わる。灯油・薪の備蓄を最優先", urgent: true },
      { resource: "車・移動手段", reason: "公共交通がなく、ガソリン制限は即座に孤立につながる", urgent: true },
      { resource: "種・農業資材", reason: "長期化時の自給継続に備え、種子・肥料の備蓄を検討", urgent: false },
      { resource: "通信手段", reason: "停電＋基地局停止でスマホが機能しない地域が多い。衛星通信・無線を検討", urgent: false },
    ],
    risks: [
      "冬季の暖房燃料枯渇は生命直結リスク（凍死）",
      "広大な移動距離で医療アクセスが最も難しい地域",
      "孤立集落化した場合の救援到達が最も遅れる",
    ],
    positives: [
      "食料自給率200%超 — 地元産食料へのアクセスは最も容易",
      "井戸・湧水が使える家庭が多い",
      "薪・バイオマスなど代替エネルギー資源が身近にある",
    ],
  },

  island: {
    typeLabel: "離島型",
    typeColor: "#7c3aed",
    typeBg: "#faf5ff",
    summary: "沖縄など離島は本土からの物流が唯一の補給線。フェリー・航空便の停止で即座に物資不足になります。",
    recommendedDays: { food: 14, water: 14 },
    priorities: [
      { resource: "食料", reason: "フェリー停止で補給がゼロになる。14日分以上を絶対確保", urgent: true },
      { resource: "飲料水", reason: "ダム・地下水源が限られる。断水リスクが最も高い。最優先", urgent: true },
      { resource: "薬・医療消耗品", reason: "島内に在庫がなければ本土から取り寄せ不可。90日分を目標", urgent: true },
      { resource: "燃料", reason: "発電機燃料・車両燃料。海上輸送停止で補給不能になる", urgent: true },
    ],
    risks: [
      "本土との輸送ルートが1本（フェリー/航空）に依存",
      "台風・封鎖で同時に孤立するリスクが最も高い",
      "医療施設・透析施設が少なく、本土への搬送が不可能になる",
      "物資不足が他のどの地域より早く始まる（配送遅延5日）",
    ],
    positives: [
      "地域の相互扶助・助け合い文化が強い",
      "漁業が盛んな島では魚の現地調達が可能",
    ],
  },
};

export function getRegionProfile(regionId: string): RegionProfile | null {
  return REGION_PROFILES.find((r) => r.id === regionId) ?? null;
}

export function getAreaAdvice(areaType: AreaType): AreaAdvice {
  return AREA_ADVICE[areaType];
}
