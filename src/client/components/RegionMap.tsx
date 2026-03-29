import { type FC, useState, useMemo } from "react";
import type { RegionCollapse } from "../../shared/types";
import { getAlertLevel, getAlertColor } from "../lib/alertHelpers";
import prefectureData from "../data/japan-prefectures.json";
import staticRegions from "../../worker/data/regions.json";

interface RegionMapProps {
  regions: RegionCollapse[];
  onSelectRegion: (region: RegionCollapse) => void;
  selectedId: string | null;
  loading?: boolean;
  /** 物流フロー矢印を表示 */
  showLogisticsFlow?: boolean;
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

/** 物流フロールートを構築（regions.jsonのinterRegionSupplyから） */
function buildLogisticsRoutes(): Array<{ from: string; to: string; capacity: number; mode: string }> {
  const routes: Array<{ from: string; to: string; capacity: number; mode: string }> = [];
  for (const region of staticRegions) {
    const supply = region.logistics?.interRegionSupply;
    if (!supply) continue;
    for (const route of supply as Array<{ from: string; mode: string; capacity_kL_per_day: number }>) {
      routes.push({ from: route.from, to: region.id, capacity: route.capacity_kL_per_day, mode: route.mode });
    }
  }
  return routes;
}

const MODE_DASH: Record<string, string> = {
  tanker: "6 3",   // 内航タンカー: 破線
  lorry: "",        // タンクローリー: 実線
  rail: "3 3",      // 鉄道: 細かい破線
};

export const RegionMap: FC<RegionMapProps> = ({ regions, onSelectRegion, selectedId, loading = false, showLogisticsFlow = false }) => {
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
      data-screenshot="collapse-map"
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

      {/* 物流フロー矢印 */}
      {showLogisticsFlow && (() => {
        const routes = buildLogisticsRoutes();
        const maxCap = Math.max(...routes.map((r) => r.capacity), 1);
        return (
          <>
            <defs>
              <marker id="logistics-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L6,3 L0,6 Z" fill="#8b5cf6" opacity="0.7" />
              </marker>
            </defs>
            {routes.map((route, i) => {
              const fromPos = LABEL_POSITIONS[route.from];
              const toPos = LABEL_POSITIONS[route.to];
              if (!fromPos || !toPos) return null;
              const strokeWidth = 1 + (route.capacity / maxCap) * 3;
              const dash = MODE_DASH[route.mode] ?? "";
              // 矢印がラベルに重ならないよう、15px手前で止める
              const dx = toPos.x - fromPos.x;
              const dy = toPos.y - fromPos.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const offset = 15;
              const x1 = fromPos.x + (dx / len) * offset;
              const y1 = fromPos.y + (dy / len) * offset;
              const x2 = toPos.x - (dx / len) * offset;
              const y2 = toPos.y - (dy / len) * offset;
              return (
                <line
                  key={i}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="#8b5cf6"
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  opacity={0.5}
                  markerEnd="url(#logistics-arrow)"
                />
              );
            })}
          </>
        );
      })()}
    </svg>
  );
};
