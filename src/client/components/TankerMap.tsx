import { type FC, useState, useMemo } from "react";
import type { TankerInfo } from "../../shared/types";
import {
  estimatePosition,
  estimateHeading,
  getRoutePath,
  getRouteId,
  MAP_BOUNDS,
  isInBounds,
} from "../lib/tankerPosition";
import { DataBadge } from "./DataBadge";
import { WORLD_LAND_PATH } from "../data/world-land";
// ─── 日本の到着港 ────────────────────────────────────

const JAPAN_PORTS: Array<{ id: string; name: string; lat: number; lon: number }> = [
  { id: "Chiba", name: "千葉", lat: 35.61, lon: 140.10 },
  { id: "Yokkaichi", name: "四日市", lat: 34.97, lon: 136.62 },
  { id: "Sakai", name: "堺", lat: 34.57, lon: 135.47 },
  { id: "Mizushima", name: "水島", lat: 34.52, lon: 133.74 },
  { id: "Kiire", name: "喜入", lat: 31.39, lon: 130.58 },
  { id: "Futtsu", name: "富津", lat: 35.30, lon: 139.82 },
  { id: "Chita", name: "知多", lat: 34.97, lon: 136.87 },
  { id: "Kitakyushu", name: "北九州", lat: 33.95, lon: 130.82 },
  { id: "Himeji", name: "姫路", lat: 34.78, lon: 134.67 },
  { id: "Sodegaura", name: "袖ケ浦", lat: 35.43, lon: 139.95 },
];

// ─── 定数 ──────────────────────────────────────────

const W = 1000;
const H = 700;
const LON_SPAN = MAP_BOUNDS.maxLon - MAP_BOUNDS.minLon;
const LAT_SPAN = MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat;

/** 経緯度→SVG座標 */
function project(lon: number, lat: number): [number, number] {
  return [
    ((lon - MAP_BOUNDS.minLon) / LON_SPAN) * W,
    ((MAP_BOUNDS.maxLat - lat) / LAT_SPAN) * H,
  ];
}

// ─── チョークポイント ──────────────────────────────

const CHOKEPOINTS = [
  { id: "hormuz", name: "ホルムズ", lat: 26.567, lon: 56.25, critical: true },
  { id: "malacca", name: "マラッカ", lat: 2.5, lon: 101.8, critical: false },
  { id: "lombok", name: "ロンボク", lat: -8.5, lon: 115.7, critical: false },
  { id: "tsugaru", name: "津軽", lat: 41.65, lon: 140.8, critical: false },
  { id: "panama", name: "パナマ", lat: 9.08, lon: -79.68, critical: false },
  { id: "babel", name: "バベルマンデブ", lat: 12.583, lon: 43.333, critical: false },
];

// ─── コンポーネント ─────────────────────────────────

interface TankerMapProps {
  tankers: TankerInfo[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const TankerMap: FC<TankerMapProps> = ({
  tankers,
  selectedId,
  onSelect,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 各タンカーの推定位置・進行方向を算出
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; pos: { lat: number; lon: number }; heading: number | null }>();
    for (const t of tankers) {
      const pos = estimatePosition(t);
      if (pos && isInBounds(pos)) {
        const [x, y] = project(pos.lon, pos.lat);
        const heading = estimateHeading(t);
        map.set(t.id, { x, y, pos, heading });
      }
    }
    return map;
  }, [tankers]);

  // ルートパス（重複排除）
  const routePaths = useMemo(() => {
    const seen = new Set<string>();
    const paths: { routeId: string; d: string; tankerId: string }[] = [];
    for (const t of tankers) {
      const routeId = getRouteId(t.departurePort);
      const key = `${routeId}-${t.departurePort}-${t.destinationPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const coords = getRoutePath(t);
      if (!coords) continue;
      const segments = coords
        .map(([lon, lat]) => project(lon, lat))
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
        .join(" ");
      paths.push({ routeId: routeId ?? "", d: segments, tankerId: t.id });
    }
    return paths;
  }, [tankers]);

  const activeId = hoveredId ?? selectedId;
  const activeTanker = tankers.find((t) => t.id === activeId);

  return (
    <div className="bg-[#0c1018] border border-[#1e2a36] rounded-lg overflow-hidden relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="タンカー推定航跡マップ"
        onClick={() => onSelect(null)}
      >
        <defs>
          <clipPath id="map-clip">
            <rect x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>

        {/* 緯度線グリッド */}
        <g opacity="0.08" stroke="#fff" strokeWidth="0.8">
          {[-30, 0, 30].map((lat) => {
            const [, y] = project(0, lat);
            return <line key={lat} x1="0" y1={y} x2={W} y2={y} />;
          })}
          {[30, 60, 90, 120, 150].map((lon) => {
            const [x] = project(lon, 0);
            return <line key={lon} x1={x} y1="0" x2={x} y2={H} />;
          })}
        </g>

        {/* 大陸（Natural Earth 110m） */}
        <g clipPath="url(#map-clip)">
          <path d={WORLD_LAND_PATH} fill="#1a2332" stroke="#263545" strokeWidth="0.8" />
        </g>

        {/* 航路線 */}
        <g clipPath="url(#map-clip)">
          {routePaths.map(({ routeId, d, tankerId }) => {
            const t = tankers.find((v) => v.id === tankerId);
            const isVLCC = t?.type === "VLCC";
            const color = isVLCC ? "#f59e0b" : "#22c55e";
            const isActive = activeId && (tankerId === activeId || getRouteId(t?.departurePort ?? "") === getRouteId(tankers.find((v) => v.id === activeId)?.departurePort ?? ""));
            return (
              <path
                key={`${routeId}-${tankerId}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={isActive ? "8 4" : "4 5"}
                opacity={isActive ? 0.6 : 0.3}
              />
            );
          })}
        </g>

        {/* チョークポイント */}
        {CHOKEPOINTS.filter((cp) => isInBounds(cp)).map((cp) => {
          const [cx, cy] = project(cp.lon, cp.lat);
          return (
            <g key={cp.id}>
              <rect
                x={cx - 6}
                y={cy - 6}
                width={12}
                height={12}
                transform={`rotate(45 ${cx} ${cy})`}
                fill={cp.critical ? "#ef4444" : "#94a3b8"}
                opacity={0.8}
              />
              <text
                x={cx + 14}
                y={cy + 5}
                fill={cp.critical ? "#ef4444" : "#8899aa"}
                fontSize="14"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {cp.name}
              </text>
            </g>
          );
        })}

        {/* 日本の到着港マーカー */}
        {JAPAN_PORTS.filter((p) => isInBounds(p)).map((port) => {
          const [px, py] = project(port.lon, port.lat);
          const isDestination = activeTanker?.destinationPort === port.id;
          return (
            <g key={port.id}>
              <circle
                cx={px}
                cy={py}
                r={isDestination ? 6 : 3}
                fill={isDestination ? "#ef4444" : "#94a3b8"}
                stroke={isDestination ? "#fff" : "#0f1419"}
                strokeWidth={isDestination ? 1.5 : 0.5}
                opacity={isDestination ? 1 : 0.5}
              />
              {isDestination && (
                <>
                  <circle cx={px} cy={py} r={12} fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.4">
                    <animate attributeName="r" values="8;16" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                  <text
                    x={px}
                    y={py - 10}
                    fill="#ef4444"
                    fontSize="12"
                    fontFamily="monospace"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {port.name}
                  </text>
                </>
              )}
              {/* 常時ホバーで港名表示 */}
              <title>{port.name}</title>
            </g>
          );
        })}

        {/* 船舶マーカー */}
        {tankers.map((t) => {
          const p = positions.get(t.id);
          if (!p) return null;
          const isVLCC = t.type === "VLCC";
          const color = isVLCC ? "#f59e0b" : "#22c55e";
          const isActive = t.id === activeId;
          const isSelected = t.id === selectedId;

          return (
            <g
              key={t.id}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(isSelected ? null : t.id);
              }}
              onMouseEnter={() => setHoveredId(t.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* パルスリング */}
              {isActive && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={18}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.5"
                  opacity="0.3"
                >
                  <animate
                    attributeName="r"
                    values="10;22"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.5;0"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* 本体（進行方向付き三角形） */}
              {p.heading != null ? (
                <polygon
                  points={isActive ? "-7,8 7,8 0,-10" : "-5,6 5,6 0,-8"}
                  transform={`translate(${p.x},${p.y}) rotate(${p.heading})`}
                  fill={color}
                  stroke={isActive ? "#fff" : "#0f1419"}
                  strokeWidth={isActive ? 2 : 1}
                  strokeLinejoin="round"
                  opacity={isActive ? 1 : 0.9}
                />
              ) : (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 8 : 6}
                  fill={color}
                  stroke={isActive ? "#fff" : "#0f1419"}
                  strokeWidth={isActive ? 2 : 1}
                  opacity={isActive ? 1 : 0.9}
                />
              )}
              {/* 船名ラベル（ホバー/選択時） */}
              {isActive && (
                <text
                  x={p.x}
                  y={p.y - 14}
                  fill="#fff"
                  fontSize="13"
                  fontFamily="monospace"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {t.name}
                </text>
              )}
            </g>
          );
        })}

        {/* 赤道ラベル */}
        {(() => {
          const [, eqY] = project(0, 0);
          return (
            <text x="8" y={eqY - 6} fill="#3a4a5a" fontSize="12" fontFamily="monospace">
              EQUATOR
            </text>
          );
        })()}
      </svg>

      {/* ツールチップ（選択/ホバー時） */}
      {activeTanker && positions.has(activeTanker.id) && (
        <div className="absolute bottom-12 left-3 bg-[#151c24]/95 border border-[#1e2a36] rounded px-3 py-2 text-xs font-mono space-y-1 pointer-events-none">
          <div className="flex items-center gap-2">
            <span
              className="px-1 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor:
                  activeTanker.type === "VLCC" ? "#f59e0b20" : "#22c55e20",
                color:
                  activeTanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
              }}
            >
              {activeTanker.type}
            </span>
            <span className="text-neutral-200 font-bold">
              {activeTanker.name}
            </span>
          </div>
          <div className="text-neutral-500">
            {activeTanker.departure} → {activeTanker.destination}
          </div>
          <div className="text-neutral-400">
            到着まで{" "}
            <span
              className="font-bold"
              style={{
                color:
                  activeTanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
              }}
            >
              {activeTanker.eta_days.toFixed(1)}日
            </span>
          </div>
        </div>
      )}

      {/* 凡例 + 精度バッジ */}
      <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] font-mono text-neutral-600">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b]" />
          VLCC
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e]" />
          LNG
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-1.5 h-1.5 bg-[#ef4444] rotate-45"
          />
          封鎖点
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#94a3b8] opacity-50" />
          到着港
        </span>
      </div>
      <div className="absolute bottom-2 right-3">
        <DataBadge confidence="estimated" />
      </div>
    </div>
  );
};
