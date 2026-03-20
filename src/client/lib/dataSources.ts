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
    source: "資源エネルギー庁 石油備蓄統計 (2024年9月末)",
  },
  oilConsumption: {
    label: "石油消費量",
    confidence: "verified",
    source: "OWID energy-data 2024",
  },
  hormuzOil: {
    label: "石油ホルムズ依存率",
    confidence: "verified",
    source: "2024年中東原油輸入比率",
  },
  lngInventory: {
    label: "LNG在庫",
    confidence: "simulated",
    source: "14日分回転在庫からの概算",
    note: "実在庫はJGA統計で月次公表だが未取得",
  },
  lngConsumption: {
    label: "LNG消費量",
    confidence: "verified",
    source: "OWID energy-data 2024",
  },
  hormuzLng: {
    label: "LNGホルムズ依存率",
    confidence: "estimated",
    source: "カタール・UAE経由LNG比率から推定",
  },
  thermalShare: {
    label: "火力発電依存率",
    confidence: "verified",
    source: "OWID energy-data 2024 fossil_share_energy",
  },
  regionParams: {
    label: "エリア別パラメータ",
    confidence: "simulated",
    source: "手動按分による推定値",
    note: "oilShare, lngShare, winterFactor, isolationRisk は公式データ未反映",
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
    case "verified": return "#00e676";
    case "estimated": return "#ff9100";
    case "simulated": return "#ff1744";
  }
}

/** シミュレーション値が含まれるかどうか */
export function hasSimulatedData(): boolean {
  return Object.values(DATA_SOURCES).some((s) => s.confidence === "simulated");
}
