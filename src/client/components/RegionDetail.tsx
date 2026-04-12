import { type FC, useMemo } from "react";
import type { RegionCollapse } from "../../shared/types";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatNumber, formatPopulation, formatDepletionDate } from "../lib/formatters";
import { DataBadge } from "./DataBadge";
import staticRegions from "../../worker/data/regions.json";

interface RegionDetailProps {
  region: RegionCollapse | null;
}

// ─── 再エネ自立率の計算定数 ──────────────────────────
// 全国平均電力需要: ~1,005 TWh/年 ÷ 8760h ≈ 114.7 GW（資源エネルギー庁 2023年度確報）
const NATIONAL_AVG_MW = 115_000;
const SOLAR_CF = 0.15;   // 太陽光 設備利用率（資源エネルギー庁 2023年実績）
const WIND_CF = 0.22;    // 風力 設備利用率（同上）
const HYDRO_CF = 0.35;   // 水力 設備利用率（同上）
const ESSENTIAL_RATIO = 0.30; // 生活必需のみ = 通常需要の30%（暖房・医療・通信・上下水道）

const RANK_COLORS: Record<string, string> = {
  S: "#ef4444",
  A: "#dc2626",
  B: "#f59e0b",
  C: "#94a3b8",
  D: "#22c55e",
};

export const RegionDetail: FC<RegionDetailProps> = ({ region }) => {
  if (!region) {
    return (
      <div className="bg-panel border border-border rounded-lg p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-neutral-500 font-mono text-sm">エリアを選択してください</p>
      </div>
    );
  }

  const collapseLevel = getAlertLevel(region.collapseDays);
  const collapseColor = getAlertColor(collapseLevel);
  const rankColor = RANK_COLORS[region.vulnerabilityRank] ?? "#888";

  const regionData = useMemo(() => {
    return staticRegions.find((sr) => sr.id === region.id) ?? null;
  }, [region.id]);

  const logistics = regionData?.logistics ?? null;
  const stockpileBases = regionData?.stockpileBases ?? [];

  // 再エネ自立率
  const renewableAvgMW = regionData
    ? (regionData.solarCapacity_MW ?? 0) * SOLAR_CF
      + (regionData.windCapacity_MW ?? 0) * WIND_CF
      + (regionData.hydroCapacity_MW ?? 0) * HYDRO_CF
    : 0;
  const minEssentialMW = NATIONAL_AVG_MW * (regionData?.powerDemandShare ?? 0) * ESSENTIAL_RATIO;
  const selfSufficiencyRate = minEssentialMW > 0 ? (renewableAvgMW / minEssentialMW) * 100 : 0;
  const nuclearMW = regionData?.nuclearCapacity_MW ?? 0;
  const withNuclearRate = minEssentialMW > 0 ? ((renewableAvgMW + nuclearMW) / minEssentialMW) * 100 : 0;
  const rateColor = selfSufficiencyRate >= 100 ? "#22c55e" : selfSufficiencyRate >= 70 ? "#f59e0b" : selfSufficiencyRate >= 40 ? "#94a3b8" : "#ef4444";
  const jointStockpile = "jointStockpile" in (regionData ?? {})
    ? (regionData as Record<string, unknown>).jointStockpile as { partner: string; location: string; capacity_kL: number; note: string } | undefined
    : undefined;

  // 配送停止予測日 = 石油枯渇日の手前（配送遅延分だけ早く停止）
  const deliveryStopDay = logistics
    ? Math.max(0, region.oilDepletionDays - logistics.deliveryDelayDays)
    : null;

  return (
    <div className="bg-panel border border-border rounded-lg p-6 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">{region.name}</h3>
        <span
          className="px-2 py-0.5 rounded font-mono text-xs font-bold"
          style={{ backgroundColor: `${rankColor}20`, color: rankColor, border: `1px solid ${rankColor}` }}
        >
          RANK {region.vulnerabilityRank}
        </span>
      </div>

      {/* 崩壊予測日数 */}
      <div className="text-center py-3">
        <div className="text-xs font-mono text-neutral-500 tracking-wider mb-1 flex items-center justify-center gap-2">
          崩壊予測 <DataBadge confidence={region.hasLiveData ? "verified" : "estimated"} />
        </div>
        <div className="font-mono font-bold text-4xl" style={{ color: collapseColor }}>
          {formatDecimal(region.collapseDays)}
        </div>
        <div className="text-neutral-500 font-mono text-sm">日</div>
        <div className="text-neutral-400 font-mono text-xs mt-1">
          {formatDepletionDate(region.collapseDays)}
        </div>
      </div>

      {/* 詳細ブレイクダウン */}
      <div className="space-y-2 text-sm">
        <DetailRow label="石油枯渇" value={`${formatDecimal(region.oilDepletionDays)}日`} sub={formatDepletionDate(region.oilDepletionDays)} />
        <DetailRow label="LNG枯渇" value={`${formatDecimal(region.lngDepletionDays)}日`} sub={formatDepletionDate(region.lngDepletionDays)} />
        <DetailRow label="電力崩壊" value={`${formatDecimal(region.powerCollapseDays)}日`} sub={formatDepletionDate(region.powerCollapseDays)} />
        <DetailRow label="物流崩壊" value={`${formatDecimal(region.logisticsCollapseDays)}日`} sub={formatDepletionDate(region.logisticsCollapseDays)} />
      </div>

      {/* 国家石油備蓄基地 */}
      <div className="bg-bg rounded p-3 space-y-1.5">
        <div className="text-[10px] font-mono text-neutral-600 tracking-wider">国家石油備蓄基地</div>
        {stockpileBases.length > 0 ? (
          <div className="space-y-1">
            {stockpileBases.map((base) => (
              <div key={base.name} className="flex justify-between items-baseline text-xs">
                <span className="text-neutral-300">{base.name}</span>
                <span className="font-mono text-neutral-400">
                  {(base.capacity_kL / 10000).toLocaleString()}万kL
                  <span className="text-neutral-600 ml-1.5">{base.type}</span>
                </span>
              </div>
            ))}
            <div className="text-[10px] text-neutral-500 font-mono pt-0.5">
              合計: {(stockpileBases.reduce((s, b) => s + b.capacity_kL, 0) / 10000).toLocaleString()}万kL
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">国家備蓄基地なし（民間備蓄に依存）</p>
        )}
        {jointStockpile && (
          <div className="text-xs text-neutral-400 border-t border-border pt-1.5 mt-1.5">
            <span className="text-neutral-500">産油国共同備蓄: </span>
            {jointStockpile.partner} / {jointStockpile.location} ({(jointStockpile.capacity_kL / 10000).toLocaleString()}万kL)
          </div>
        )}
        <p className="text-[8px] text-neutral-700">出典: JOGMEC 石油備蓄基地一覧</p>
      </div>

      {/* ロジスティクス */}
      {logistics && (
        <div className="bg-bg rounded p-3 space-y-1.5">
          <div className="text-[10px] font-mono text-neutral-600 tracking-wider">LOGISTICS</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-neutral-500">配送遅延</span>
            <span className="font-mono text-right text-neutral-300">{logistics.deliveryDelayDays}日</span>
            <span className="text-neutral-500">トラック燃料依存</span>
            <span className="font-mono text-right text-neutral-300">{Math.round(logistics.truckFuelDependency * 100)}%</span>
            <span className="text-neutral-500">給油所数</span>
            <span className="font-mono text-right text-neutral-300">{logistics.gasStationCount.toLocaleString()}箇所</span>
            {"fuelConsumption_kL_per_day" in logistics && (
              <>
                <span className="text-neutral-500">物流用軽油</span>
                <span className="font-mono text-right text-neutral-300">{(logistics.fuelConsumption_kL_per_day as number).toLocaleString()} kL/日</span>
              </>
            )}
            {"truckFleetCount" in logistics && (
              <>
                <span className="text-neutral-500">営業トラック</span>
                <span className="font-mono text-right text-neutral-300">{(logistics.truckFleetCount as number).toLocaleString()}台</span>
              </>
            )}
          </div>
          {"interRegionSupply" in logistics && (
            <div className="text-[10px] text-neutral-500 space-y-0.5 border-t border-border pt-1.5 mt-1">
              <div className="text-neutral-600 tracking-wider">供給元</div>
              {(logistics.interRegionSupply as Array<{ from: string; mode: string; capacity_kL_per_day: number; note: string }>).map((route, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-neutral-400">{route.note}</span>
                  <span className="font-mono text-neutral-500">{route.capacity_kL_per_day.toLocaleString()} kL/日</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-neutral-600 leading-relaxed">{logistics.note}</p>
          <p className="text-[8px] text-neutral-700">給油所数出典: 資源エネルギー庁 2023年度末</p>
        </div>
      )}

      {/* データソース */}
      <div className="text-[10px] font-mono text-neutral-600 flex items-center gap-1.5">
        {region.hasLiveData ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            電力需給: 実測データ
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            電力需給: 推定値（静的パラメータ）
          </>
        )}
      </div>

      <hr className="border-border" />

      {/* エリア情報 */}
      <div className="space-y-2 text-sm">
        <DetailRow label="人口" value={formatPopulation(region.population)} />
        <DetailRow
          label="食料自給率"
          value={`${formatNumber(Math.round(region.foodSelfSufficiency * 100))}%`}
        />
      </div>

      {/* 再エネ自立率（マイクログリッド指標） */}
      {regionData && (
        <div className="bg-bg rounded p-3 space-y-2">
          <div className="text-[10px] font-mono text-neutral-600 tracking-wider">再エネ自立率（生活必需比）</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">再エネのみ</span>
              <span className="font-mono text-sm font-bold" style={{ color: rateColor }}>
                {selfSufficiencyRate >= 100 ? "自立可能" : `${Math.round(selfSufficiencyRate)}%`}
              </span>
            </div>
            {/* バー */}
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, selfSufficiencyRate)}%`, backgroundColor: rateColor }}
              />
            </div>
            {nuclearMW > 0 && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] text-neutral-500">原子力含む場合</span>
                <span className="font-mono text-[10px] text-[#94a3b8]">
                  {withNuclearRate >= 100 ? "自立可能" : `${Math.round(withNuclearRate)}%`}
                  <span className="text-neutral-600 ml-1">（+{Math.round(nuclearMW / 100) / 10} GW）</span>
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-neutral-600 pt-1 border-t border-border">
            <div>太陽光 {regionData.solarCapacity_MW?.toLocaleString() ?? 0} MW</div>
            <div>風力 {regionData.windCapacity_MW?.toLocaleString() ?? 0} MW</div>
            <div>水力 {regionData.hydroCapacity_MW?.toLocaleString() ?? 0} MW</div>
          </div>
          <p className="text-[8px] text-neutral-700">
            出典: 資源エネルギー庁 再エネ設備容量 2023年度確報 / 設備利用率: 太陽光15%・風力22%・水力35%
          </p>
        </div>
      )}

      {/* ノート */}
      <p className="text-xs text-neutral-500 leading-relaxed">{region.note}</p>
    </div>
  );
};

interface DetailRowProps {
  label: string;
  value: string;
  sub?: string;
}

const DetailRow: FC<DetailRowProps> = ({ label, value, sub }) => (
  <div className="flex justify-between">
    <span className="text-neutral-500">{label}</span>
    <div className="text-right">
      <span className="font-mono">{value}</span>
      {sub && <div className="text-xs font-mono text-neutral-400">{sub}</div>}
    </div>
  </div>
);
