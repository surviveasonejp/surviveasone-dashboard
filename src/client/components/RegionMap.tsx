import { type FC, useState, useMemo } from "react";
import type { RegionCollapse } from "../../shared/types";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import prefectureData from "../data/japan-prefectures.json";

interface RegionMapProps {
  regions: RegionCollapse[];
  onSelectRegion: (region: RegionCollapse) => void;
  selectedId: string | null;
  loading?: boolean;
}

interface PrefectureEntry {
  id: number;
  name: string;
  name_en: string;
  region: string;
  d: string;
}

/** 都道府県をエリア別にグループ化 */
function groupByRegion(): Map<string, PrefectureEntry[]> {
  const map = new Map<string, PrefectureEntry[]>();
  for (const pref of Object.values(prefectureData.prefectures) as PrefectureEntry[]) {
    const list = map.get(pref.region) ?? [];
    list.push(pref);
    map.set(pref.region, list);
  }
  return map;
}

/** エリア別のラベル座標（手動調整） */
const LABEL_POSITIONS: Record<string, { x: number; y: number }> = {
  hokkaido: { x: 390, y: 90 },
  tohoku: { x: 340, y: 240 },
  tokyo: { x: 318, y: 330 },
  chubu: { x: 263, y: 350 },
  hokuriku: { x: 240, y: 315 },
  kansai: { x: 213, y: 368 },
  chugoku: { x: 148, y: 374 },
  shikoku: { x: 165, y: 406 },
  kyushu: { x: 101, y: 437 },
  okinawa: { x: 462, y: 520 },
};

function getRegionFill(collapseDays: number, isSelected: boolean, isHovered: boolean): string {
  const level = getAlertLevel(collapseDays);
  const base = getAlertColor(level);
  if (isSelected) return base;
  if (isHovered) return `${base}cc`;
  return `${base}88`;
}

export const RegionMap: FC<RegionMapProps> = ({ regions, onSelectRegion, selectedId, loading = false }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const regionMap = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const prefByRegion = useMemo(() => groupByRegion(), []);

  const isLoading = loading || regions.length === 0;
  const LOADING_FILL = "#1e2a36";

  const renderRegion = (regionId: string, prefs: PrefectureEntry[]) => {
    const region = regionMap.get(regionId);
    const isSelected = selectedId === regionId;
    const isHovered = hoveredId === regionId;
    const fill = !region || isLoading
      ? LOADING_FILL
      : getRegionFill(region.collapseDays, isSelected, isHovered);

    return (
      <g
        key={regionId}
        className="cursor-pointer"
        onMouseEnter={() => setHoveredId(regionId)}
        onMouseLeave={() => setHoveredId(null)}
        onClick={(e) => { e.stopPropagation(); if (region) onSelectRegion(region); }}
      >
        {prefs.map((pref) => (
          <path
            key={pref.id}
            d={pref.d}
            fill={fill}
            stroke={isSelected ? "#ffffff" : "#162029"}
            strokeWidth={isSelected ? 1.2 : 0.5}
            style={{ transition: "fill 0.4s ease, stroke 0.2s ease" }}
          />
        ))}
      </g>
    );
  };

  const renderLabel = (regionId: string) => {
    const region = regionMap.get(regionId);
    if (!region) return null;
    const label = LABEL_POSITIONS[regionId];
    if (!label) return null;

    return (
      <text
        key={`label-${regionId}`}
        x={label.x}
        y={label.y}
        textAnchor="middle"
        dominantBaseline="central"
        className="pointer-events-none select-none"
        fill="white"
        fontSize="13"
        fontWeight="bold"
        fontFamily="'Noto Sans JP', sans-serif"
        stroke="#151c24"
        strokeWidth="3"
        paintOrder="stroke"
      >
        {region.name}
      </text>
    );
  };

  return (
    <svg
      viewBox="14 0 552 600"
      className="w-full h-full max-h-[600px] mx-auto block"
      role="img"
      aria-label="日本地図 — 10電力エリア崩壊順マップ"
    >
      {/* 本州・九州のパス描画 */}
      {Array.from(prefByRegion.entries())
        .filter(([id]) => id !== "okinawa")
        .map(([regionId, prefs]) => renderRegion(regionId, prefs))}

      {/* 沖縄インセット（本島〜先島諸島を含む） */}
      <defs>
        <clipPath id="okinawa-clip">
          <rect x="370" y="455" width="185" height="125" rx="4" />
        </clipPath>
      </defs>
      <rect
        x="370"
        y="455"
        width="185"
        height="125"
        fill="#151c24"
        stroke="#1e2a36"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        rx="4"
      />
      <g clipPath="url(#okinawa-clip)">
        <g transform="translate(143, -89) scale(1.3)">
          {prefByRegion.has("okinawa") &&
            renderRegion("okinawa", prefByRegion.get("okinawa")!)}
        </g>
      </g>

      {/* ラベル描画（本州・九州） */}
      {Array.from(prefByRegion.keys())
        .filter((id) => id !== "okinawa")
        .map(renderLabel)}

      {/* 沖縄ラベル（インセット内） */}
      {renderLabel("okinawa")}
    </svg>
  );
};
