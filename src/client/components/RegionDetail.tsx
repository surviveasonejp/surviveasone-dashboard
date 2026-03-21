import { type FC } from "react";
import { type RegionCollapse, getAlertLevel, getAlertColor } from "../lib/calculations";
import { formatDecimal, formatNumber, formatPopulation, formatDepletionDate } from "../lib/formatters";
import { DataBadge } from "./DataBadge";

interface RegionDetailProps {
  region: RegionCollapse | null;
}

const RANK_COLORS: Record<string, string> = {
  S: "#ff1744",
  A: "#ff5252",
  B: "#ff9100",
  C: "#ffea00",
  D: "#00e676",
};

export const RegionDetail: FC<RegionDetailProps> = ({ region }) => {
  if (!region) {
    return (
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-6 flex items-center justify-center min-h-[300px]">
        <p className="text-neutral-500 font-mono text-sm">エリアを選択してください</p>
      </div>
    );
  }

  const collapseLevel = getAlertLevel(region.collapseDays);
  const collapseColor = getAlertColor(collapseLevel);
  const rankColor = RANK_COLORS[region.vulnerabilityRank] ?? "#888";

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-6 space-y-4">
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
          崩壊予測 <DataBadge confidence="estimated" />
        </div>
        <div className="font-mono font-bold text-4xl" style={{ color: collapseColor }}>
          {formatDecimal(region.collapseDays)}
        </div>
        <div className="text-neutral-500 font-mono text-sm">日</div>
        <div className="text-neutral-500 font-mono text-xs mt-1">
          {formatDepletionDate(region.collapseDays)}
        </div>
      </div>

      {/* 詳細ブレイクダウン */}
      <div className="space-y-2 text-sm">
        <DetailRow label="石油枯渇" value={`${formatDecimal(region.oilDepletionDays)}日`} sub={formatDepletionDate(region.oilDepletionDays)} />
        <DetailRow label="LNG枯渇" value={`${formatDecimal(region.lngDepletionDays)}日`} sub={formatDepletionDate(region.lngDepletionDays)} />
        <DetailRow label="電力崩壊" value={`${formatDecimal(region.powerCollapseDays)}日`} sub={formatDepletionDate(region.powerCollapseDays)} />
      </div>

      <hr className="border-[#2a2a2a]" />

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
      {sub && <div className="text-xs font-mono text-neutral-600">{sub}</div>}
    </div>
  </div>
);
