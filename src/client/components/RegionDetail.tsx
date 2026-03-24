import { type FC, useMemo } from "react";
import type { RegionCollapse } from "../../shared/types";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import { formatDecimal, formatNumber, formatPopulation, formatDepletionDate } from "../lib/formatters";
import { DataBadge } from "./DataBadge";
import staticRegions from "../../worker/data/regions.json";

interface RegionDetailProps {
  region: RegionCollapse | null;
}

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
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-neutral-500 font-mono text-sm">エリアを選択してください</p>
      </div>
    );
  }

  const collapseLevel = getAlertLevel(region.collapseDays);
  const collapseColor = getAlertColor(collapseLevel);
  const rankColor = RANK_COLORS[region.vulnerabilityRank] ?? "#888";

  const logistics = useMemo(() => {
    const r = staticRegions.find((sr) => sr.id === region.id);
    return r?.logistics ?? null;
  }, [region.id]);

  // 配送停止予測日 = 石油枯渇日の手前（配送遅延分だけ早く停止）
  const deliveryStopDay = logistics
    ? Math.max(0, region.oilDepletionDays - logistics.deliveryDelayDays)
    : null;

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-4">
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
        {deliveryStopDay != null && (
          <DetailRow label="配送制限" value={`${formatDecimal(deliveryStopDay)}日`} sub={`石油枯渇の${logistics?.deliveryDelayDays}日前`} />
        )}
      </div>

      {/* ロジスティクス */}
      {logistics && (
        <div className="bg-[#0f1419] rounded p-3 space-y-1.5">
          <div className="text-[10px] font-mono text-neutral-600 tracking-wider">LOGISTICS</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-neutral-500">配送遅延</span>
            <span className="font-mono text-right text-neutral-300">{logistics.deliveryDelayDays}日</span>
            <span className="text-neutral-500">トラック燃料依存</span>
            <span className="font-mono text-right text-neutral-300">{Math.round(logistics.truckFuelDependency * 100)}%</span>
            <span className="text-neutral-500">油槽所数</span>
            <span className="font-mono text-right text-neutral-300">{logistics.depotCount}箇所</span>
          </div>
          <p className="text-[9px] text-neutral-600 leading-relaxed">{logistics.note}</p>
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

      <hr className="border-[#1e2a36]" />

      {/* エリア情報 */}
      <div className="space-y-2 text-sm">
        <DetailRow label="人口" value={formatPopulation(region.population)} />
        <DetailRow
          label="食料自給率"
          value={`${formatNumber(Math.round(region.foodSelfSufficiency * 100))}%`}
        />
      </div>

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
