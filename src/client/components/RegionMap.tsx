import { type FC, useState, useMemo } from "react";
import { type RegionCollapse, getAlertLevel, getAlertColor } from "../lib/calculations";
import prefectureData from "../data/japan-prefectures.json";

interface RegionMapProps {
  regions: RegionCollapse[];
  onSelectRegion: (region: RegionCollapse) => void;
  selectedId: string | null;
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
  hokkaido: { x: 390, y: 110 },
  tohoku: { x: 340, y: 240 },
  tokyo: { x: 350, y: 330 },
  chubu: { x: 290, y: 350 },
  hokuriku: { x: 270, y: 300 },
  kansai: { x: 250, y: 390 },
  chugoku: { x: 190, y: 390 },
  shikoku: { x: 205, y: 440 },
  kyushu: { x: 140, y: 450 },
  okinawa: { x: 120, y: 610 },
};

function getRegionFill(collapseDays: number, isSelected: boolean, isHovered: boolean): string {
  const level = getAlertLevel(collapseDays);
  const base = getAlertColor(level);
  if (isSelected) return base;
  if (isHovered) return `${base}cc`;
  return `${base}88`;
}

export const RegionMap: FC<RegionMapProps> = ({ regions, onSelectRegion, selectedId }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const regionMap = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const prefByRegion = useMemo(() => groupByRegion(), []);

  return (
    <svg
      viewBox="14 0 552 680"
      className="w-full h-full max-h-[600px] mx-auto block"
      role="img"
      aria-label="日本地図 — 10電力エリア崩壊順マップ"
    >

      {Array.from(prefByRegion.entries()).map(([regionId, prefs]) => {
        const region = regionMap.get(regionId);
        if (!region) return null;
        const isSelected = selectedId === regionId;
        const isHovered = hoveredId === regionId;
        const fill = getRegionFill(region.collapseDays, isSelected, isHovered);
        const label = LABEL_POSITIONS[regionId];

        return (
          <g
            key={regionId}
            className="cursor-pointer"
            onMouseEnter={() => setHoveredId(regionId)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onSelectRegion(region)}
          >
            {prefs.map((pref) => (
              <path
                key={pref.id}
                d={pref.d}
                fill={fill}
                stroke={isSelected ? "#ffffff" : "#1a1a1a"}
                strokeWidth={isSelected ? 1.2 : 0.5}
                className="transition-colors duration-200"
              />
            ))}
            {label && (
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none select-none"
                fill="white"
                fontSize="13"
                fontWeight="bold"
                fontFamily="'Noto Sans JP', sans-serif"
                stroke="#0a0a0a"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {region.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
