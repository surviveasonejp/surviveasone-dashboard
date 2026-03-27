export type DataConfidence = "verified" | "estimated" | "simulated";

export interface DataSourceInfo {
  label: string;
  confidence: DataConfidence;
  source: string;
  note?: string;
}

export const DATA_SOURCES: Record<string, DataSourceInfo> = {
  oilReserve: {
    label: "石油備蓄量",
    confidence: "verified",
    source: "経産省 石油備蓄推計量",
    note: "備蓄日数は reserves.json から参照（月次自動更新）",
  },
  oilConsumption: {
    label: "石油消費量",
    confidence: "verified",
    source: "OWID energy-data 2024",
  },
  hormuzOil: {
    label: "石油ホルムズ依存率",
    confidence: "verified",
    source: "2025年貿易統計 中東原油輸入比率94%",
  },
  lngInventory: {
    label: "LNG在庫",
    confidence: "estimated",
    source: "経産省ガス事業統計+電力調査統計(2025年平均)",
    note: "季節変動あり(冬季高・夏季低)。450万t=ガス事業用+発電用の合算推計。経産省公表の発電用在庫(約230万t)とは集計範囲が異なる",
  },
  lngConsumption: {
    label: "LNG消費量",
    confidence: "verified",
    source: "財務省貿易統計 2025年LNG輸入量6,498万t",
  },
  hormuzLng: {
    label: "LNGホルムズ依存率",
    confidence: "verified",
    source: "JETRO 2025年実績 カタール5.3%+UAE1.0%=6.3%",
    note: "主要輸入先: 豪州39.7%、マレーシア14.8%、ロシア8.9%",
  },
  thermalShare: {
    label: "火力発電依存率",
    confidence: "verified",
    source: "ISEP 2024年暦年速報値(電力調査統計ベース) 火力65%",
    note: "LNG29.1%+石炭28.2%+石油1.4%+その他6.3%。原子力8.2%、再エネ26.7%",
  },
  regionPopulation: {
    label: "エリア別人口",
    confidence: "verified",
    source: "総務省統計局 人口推計 (2025年10月1日)",
  },
  regionRefineries: {
    label: "エリア別製油所",
    confidence: "verified",
    source: "石油連盟 製油所一覧(2023年10月末) + 2024年閉鎖反映",
    note: "ENEOS知多・和歌山閉鎖、西部石油山口停止、南西石油精製停止を反映",
  },
  regionInterconnection: {
    label: "連系線容量",
    confidence: "verified",
    source: "OCCTO + 各送配電事業者 (2025年時点)",
    note: "北本90万kW(2019年増強後)、本四120万kW、関門238万kW",
  },
  tankerData: {
    label: "タンカー追跡データ",
    confidence: "estimated",
    source: "ports.com/SeaRoutes航路距離 + 2025年AIS実運航速度データ",
    note: "船名は模擬。距離と速度は公開データ基準。実際の船舶位置はPhase 2でAIS連携",
  },
  foodSupplyChain: {
    label: "食品サプライチェーン",
    confidence: "estimated",
    source: "農水省食料需給表 + 物流・エネルギー依存度推定",
    note: "崩壊日数は物流・包装・冷蔵の依存度から推定",
  },
  familySurvival: {
    label: "家庭サバイバル計算",
    confidence: "estimated",
    source: "内閣府防災ガイドライン + 1人あたり必要量の標準値",
    note: "水3L/日、ガス30分/日、電力50Wh/日の基準値",
  },
  regionParams: {
    label: "エリア別シミュレーションパラメータ",
    confidence: "estimated",
    source: "製油所処理能力・LNG基地規模・OCCTO需給データから按分推定",
    note: "oilShare/lngShareは製油所・LNG基地の処理能力ベースで推定。winterFactor/isolationRiskは気象・地理条件から設定",
  },
  foodSelfSufficiency: {
    label: "食料自給率",
    confidence: "verified",
    source: "農水省 食料需給表(令和5年度確報/令和6年度概算)",
    note: "カロリーベース総合38%。小麦16%、飼料26%、米97%。北海道218%",
  },
  governmentRiceReserve: {
    label: "政府備蓄米",
    confidence: "verified",
    source: "農水省 米穀の需給及び価格の安定に関する基本指針",
    note: "適正水準91-100万tだが、令和コメ騒動(2024-2025)で大量放出。2025年8月時点で約29.5万t",
  },
  simulationCoefficients: {
    label: "シミュレーション係数",
    confidence: "estimated",
    source: "ISEP自然エネルギー白書 + IRENA Statistics + OCCTO需給検証 + IEA Energy Supply Security",
    note: "太陽光CF15%/風力CF22%/水力CF35%(ISEP実績値)。需要破壊係数は1973年石油危機実績+IEA価格弾力性モデル。連系線稼働率70%はOCCTO緊急時運用規程準拠",
  },
  waterSupplyGuideline: {
    label: "水道・防災基準値",
    confidence: "verified",
    source: "内閣府 避難所における良好な生活環境の確保に向けた取組指針(2016年) + 厚労省 水道事業ガイドライン",
    note: "水3L/人日(飲料+調理)。水道崩壊カスケードは配水池重力式貯留(1-3日分)+非常用発電72時間に基づく",
  },
};

export function getConfidenceLabel(confidence: DataConfidence): string {
  switch (confidence) {
    case "verified": return "実績値";
    case "estimated": return "推定値";
    case "simulated": return "開発用";
  }
}

export function getConfidenceColor(confidence: DataConfidence): string {
  switch (confidence) {
    case "verified": return "#22c55e";
    case "estimated": return "#f59e0b";
    case "simulated": return "#ef4444";
  }
}

/** シミュレーション値が含まれるかどうか */
export function hasSimulatedData(): boolean {
  return Object.values(DATA_SOURCES).some((s) => s.confidence === "simulated");
}
