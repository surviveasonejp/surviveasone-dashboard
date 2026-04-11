import { type FC, useState, useMemo } from "react";
import type { TankerInfo } from "../../shared/types";
import {
  estimatePosition,
  estimateHeading,
  getRoutePath,
  getRouteId,
  MAP_BOUNDS,
  isInBounds,
  ALL_ROUTES,
  type RouteType,
} from "../lib/tankerPosition";
import { DataBadge } from "./DataBadge";
import { WORLD_LAND_PATH } from "../data/world-land";

// ─── 日本の到着港 ────────────────────────────────────

const JAPAN_PORTS: Array<{ id: string; name: string; lat: number; lon: number }> = [
  { id: "Japan", name: "未公表", lat: 33.95, lon: 133.00 },
  { id: "Kawasaki", name: "川崎", lat: 35.52, lon: 139.78 },
  { id: "Hiroshima", name: "広島", lat: 34.35, lon: 132.32 },
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
  { id: "Ehime", name: "菊間", lat: 33.98, lon: 132.97 },
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

/** Catmull-Rom スプライン → SVG cubic Bezier パス文字列
 *  ウェイポイントを全て通りながら自然な曲線を生成する */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
  }
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 10;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 10;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 10;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 10;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** ホルムズ海峡内側の出発港 — 封鎖時に日本到達不可 */
const HORMUZ_PORTS = new Set([
  "Ras Tanura", "Jubail", "Kharg Island",
  "Ras Laffan", "Mina Al Ahmadi", "Basrah",
]);

/** 日本の到着港 */
const JAPAN_DEST_PORTS = new Set([
  "Japan", "Kawasaki", "Hiroshima", "Chiba", "Yokkaichi", "Sakai",
  "Mizushima", "Kiire", "Futtsu", "Chita", "Kitakyushu", "Himeji",
  "Sodegaura", "Sendai", "Naha", "Kashima", "Negishi", "Oita", "Ehime",
]);

const isDimmed = (t: { departurePort: string; destinationPort: string }, scenario: MapScenario) => {
  if (scenario === "normal") return !JAPAN_DEST_PORTS.has(t.destinationPort);
  return HORMUZ_PORTS.has(t.departurePort) || !JAPAN_DEST_PORTS.has(t.destinationPort);
};

/** cargo_t 最大値（TAKASAGO 313,989t）— マーカーサイズ正規化の基準 */
const MAX_CARGO_T = 314000;

/** cargo_t → マーカースケール（0.55〜1.40）*/
function getMarkerScale(cargo_t: number): number {
  const t = Math.min(Math.max(cargo_t, 0), MAX_CARGO_T) / MAX_CARGO_T;
  return 0.55 + t * 0.85;
}

/** cargo_t → サイズ分類ラベル */
function getSizeLabel(cargo_t: number): string {
  if (cargo_t >= 200000) return "超大型";
  if (cargo_t >= 80000) return "大型";
  return "中型";
}

// ─── ルート容量→線幅（誇張スケール: ホルムズ7px、代替1.7〜2.5px）───

function getCapacityStrokeWidth(capacity_mbpd: number, isActive: boolean): number {
  // 視覚的に「ホルムズが圧倒的に太い」ことを示すため非線形スケールを使用
  const mbpd = (typeof capacity_mbpd === "number" && !isNaN(capacity_mbpd)) ? capacity_mbpd : 0;
  const base = mbpd >= 2.0
    ? 7.0                                          // primary (Hormuz 2.3mbpd)
    : 1.6 + (mbpd / 2.0) * 1.4;                   // bypass/existing_alt: 1.6〜2.6px
  return isActive ? base * 1.3 : base;
}

// ─── シナリオ別ルートスタイル ────────────────────────

export type MapScenario = "normal" | "partial" | "full";

interface RouteStyle {
  stroke: string;
  opacity: number;
  strokeDasharray: string;
}

function getRouteStyle(
  routeType: RouteType,
  scenario: MapScenario,
  isActiveRoute: boolean,
): RouteStyle {
  if (routeType === "primary") {
    // 封鎖時も太さを見せるためopacityを高めに維持（「これだけ太い管が止まった」を視覚化）
    if (scenario === "full") return { stroke: "#ef4444", opacity: 0.42, strokeDasharray: "6 6" };
    if (scenario === "partial") return { stroke: "#f97316", opacity: 0.50, strokeDasharray: "5 4" };
    // normal: Hormuzルートはアクティブ
    return { stroke: "#f59e0b", opacity: isActiveRoute ? 0.55 : 0.35, strokeDasharray: isActiveRoute ? "8 4" : "4 5" };
  }

  if (routeType === "bypass") {
    if (scenario === "full") return { stroke: "#3b82f6", opacity: isActiveRoute ? 0.72 : 0.45, strokeDasharray: isActiveRoute ? "8 3" : "6 4" };
    if (scenario === "partial") return { stroke: "#60a5fa", opacity: isActiveRoute ? 0.55 : 0.32, strokeDasharray: "6 4" };
    // normal: バイパスルートは背景扱い
    return { stroke: "#94a3b8", opacity: 0.18, strokeDasharray: "3 6" };
  }

  // existing_alt
  return {
    stroke: "#22c55e",
    opacity: isActiveRoute ? 0.52 : 0.28,
    strokeDasharray: isActiveRoute ? "8 4" : "4 5",
  };
}

// ─── チョークポイント ──────────────────────────────

const CHOKEPOINTS = [
  { id: "hormuz", name: "ホルムズ海峡", lat: 26.567, lon: 56.25, critical: true },
  { id: "malacca", name: "マラッカ海峡", lat: 2.5, lon: 101.8, critical: false },
  { id: "lombok", name: "ロンボク海峡", lat: -8.5, lon: 115.7, critical: false },
  { id: "tsugaru", name: "津軽海峡", lat: 41.65, lon: 140.8, critical: false },
  { id: "panama", name: "パナマ運河", lat: 9.08, lon: -79.68, critical: false },
  { id: "babel", name: "バベルマンデブ海峡", lat: 12.583, lon: 43.333, critical: false },
  { id: "good-hope", name: "喜望峰", lat: -34.357, lon: 18.474, critical: false },
];

// ─── コンポーネント ─────────────────────────────────

interface TankerMapProps {
  tankers: TankerInfo[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  scenario?: MapScenario;
}

export const TankerMap: FC<TankerMapProps> = ({
  tankers,
  selectedId,
  onSelect,
  scenario = "full",
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);

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

  // アクティブなルートID集合（タンカーがいるルート）
  const activeRouteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tankers) {
      const routeId = getRouteId(t.departurePort);
      if (routeId) ids.add(routeId);
    }
    return ids;
  }, [tankers]);

  // 全ルート基底レイヤー（sea-routes.jsonの全ルートをウェイポイントで描画）
  const allRoutePaths = useMemo(() => {
    return Object.entries(ALL_ROUTES).map(([routeId, route]) => {
      const wpts = route.waypoints;
      if (wpts.length < 2) return null;
      const d = smoothPath(wpts.map(([lon, lat]) => project(lon, lat)));
      return {
        routeId,
        d,
        capacity_mbpd: route.capacity_mbpd,
        route_type: route.route_type,
        label: route.label,
        transit_days: route.transit_days,
        risk_note: route.risk_note,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, []);

  // ルート中間点（日数ラベル表示位置）
  const routeMidpoints = useMemo(() => {
    return Object.entries(ALL_ROUTES).map(([routeId, route]) => {
      const wpts = route.waypoints;
      if (wpts.length === 0) return null;
      const mid = wpts[Math.floor(wpts.length / 2)];
      if (!mid) return null;
      const [x, y] = project(mid[0], mid[1]);
      return {
        routeId,
        x,
        y,
        transit_days: route.transit_days,
        route_type: route.route_type,
        label: route.label,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, []);

  // タンカー別ルートパス（重複排除、アクティブ船のハイライト用）
  const tankerRoutePaths = useMemo(() => {
    const seen = new Set<string>();
    const paths: { routeId: string; d: string; tankerId: string }[] = [];
    for (const t of tankers) {
      const routeId = getRouteId(t.departurePort);
      const key = `${routeId}-${t.departurePort}-${t.destinationPort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const coords = getRoutePath(t);
      if (!coords) continue;
      const segments = smoothPath(coords.map(([lon, lat]) => project(lon, lat)));
      paths.push({ routeId: routeId ?? "", d: segments, tankerId: t.id });
    }
    return paths;
  }, [tankers]);

  const activeId = hoveredId ?? selectedId;
  const activeTanker = tankers.find((t) => t.id === activeId);
  const hoveredRoute = hoveredRouteId !== null
    ? ALL_ROUTES[hoveredRouteId] ?? null
    : null;

  return (
    <div className="bg-[#0c1018] border border-border rounded-lg overflow-hidden relative">
      <svg
        data-screenshot="tanker-map"
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

        {/* ── 全ルート基底レイヤー（容量比例線幅・シナリオ別色）── */}
        <g clipPath="url(#map-clip)">
          {allRoutePaths.map(({ routeId, d, capacity_mbpd, route_type }) => {
            const isActive = activeRouteIds.has(routeId);
            const isHovered = hoveredRouteId === routeId;
            const style = getRouteStyle(route_type, scenario, isActive);
            const sw = getCapacityStrokeWidth(capacity_mbpd, isActive || isHovered);
            return (
              <path
                key={`base-${routeId}`}
                d={d}
                fill="none"
                stroke={style.stroke}
                strokeWidth={sw}
                strokeDasharray={style.strokeDasharray}
                opacity={isHovered ? Math.min(style.opacity + 0.25, 0.95) : style.opacity}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredRouteId(routeId)}
                onMouseLeave={() => setHoveredRouteId(null)}
              />
            );
          })}
        </g>

        {/* ── タンカー個別ルート（アクティブ船のハイライト）── */}
        <g clipPath="url(#map-clip)">
          {tankerRoutePaths.map(({ routeId, d, tankerId }) => {
            const t = tankers.find((v) => v.id === tankerId);
            const dimmed = t ? isDimmed(t, scenario) : false;
            const isVLCC = t?.type === "VLCC";
            const isActiveShip = activeId !== null && (
              tankerId === activeId ||
              getRouteId(t?.departurePort ?? "") === getRouteId(tankers.find((v) => v.id === activeId)?.departurePort ?? "")
            );
            if (!isActiveShip) return null; // 基底レイヤーで描画済み
            const color = dimmed ? "#525252" : isVLCC ? "#f59e0b" : "#22c55e";
            return (
              <path
                key={`tanker-${routeId}-${tankerId}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.8}
                strokeDasharray="8 4"
                opacity={dimmed ? 0.15 : 0.65}
                style={{ pointerEvents: "none" }}
              />
            );
          })}
        </g>

        {/* ── 完全封鎖時: ホルムズ×マーク ── */}
        {scenario === "full" && (() => {
          const [cx, cy] = project(56.25, 26.567);
          const s = 14;
          return (
            <g style={{ pointerEvents: "none" }}>
              <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} stroke="#ef4444" strokeWidth={2.5} opacity={0.7} />
              <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} stroke="#ef4444" strokeWidth={2.5} opacity={0.7} />
            </g>
          );
        })()}

        {/* ── ルート所要日数ラベル（部分/完全封鎖時）── */}
        {(scenario === "full" || scenario === "partial") && (
          <g clipPath="url(#map-clip)" style={{ pointerEvents: "none" }}>
            {routeMidpoints.map(({ routeId, x, y, transit_days, route_type }) => {
              // primaryは「XX日」、bypass/existing_altは「約XX日」で表示
              const isBypass = route_type === "bypass";
              const isExisting = route_type === "existing_alt";
              const isPrimary = route_type === "primary";
              if (!isBypass && !isExisting && !isPrimary) return null;
              // 画面外はスキップ
              if (x < 20 || x > W - 20 || y < 20 || y > H - 20) return null;

              const color = isPrimary ? "#ef4444" : isBypass ? "#60a5fa" : "#4ade80";
              const text = isPrimary ? `${transit_days}日` : `約${transit_days}日`;
              const fontSize = isBypass ? "12" : "10";
              const bgOpacity = isBypass ? 0.75 : 0.55;
              const textLen = text.length;

              return (
                <g key={`label-${routeId}`}>
                  <rect
                    x={x - textLen * 4}
                    y={y - 10}
                    width={textLen * 8}
                    height={14}
                    rx={3}
                    fill="#0a0f1a"
                    opacity={bgOpacity}
                  />
                  <text
                    x={x}
                    y={y + 1}
                    textAnchor="middle"
                    fill={color}
                    fontSize={fontSize}
                    fontFamily="monospace"
                    fontWeight={isBypass ? "bold" : "normal"}
                    opacity={isBypass ? 0.9 : 0.65}
                  >
                    {text}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* チョークポイント */}
        {CHOKEPOINTS.filter((cp) => isInBounds(cp)).map((cp) => {
          const [cx, cy] = project(cp.lon, cp.lat);
          // malaccaとbabelは封鎖シナリオで代替ルートが通過するため重要度が上がる
          const isCritical = cp.critical
            || ((cp.id === "babel" || cp.id === "malacca") && (scenario === "partial" || scenario === "full"));
          const size = isCritical ? 8 : 5;
          return (
            <g key={cp.id}>
              {/* criticalは外側リング追加 */}
              {isCritical && (
                <rect
                  x={cx - size - 4}
                  y={cy - size - 4}
                  width={(size + 4) * 2}
                  height={(size + 4) * 2}
                  transform={`rotate(45 ${cx} ${cy})`}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={1}
                  opacity={0.4}
                />
              )}
              <rect
                x={cx - size}
                y={cy - size}
                width={size * 2}
                height={size * 2}
                transform={`rotate(45 ${cx} ${cy})`}
                fill={isCritical ? "#ef4444" : "#64748b"}
                opacity={isCritical ? 0.9 : 0.6}
              />
              <text
                x={cx + size + 8}
                y={cy + 5}
                fill={isCritical ? "#ef4444" : "#64748b"}
                fontSize={isCritical ? "13" : "11"}
                fontFamily="monospace"
                fontWeight={isCritical ? "bold" : "normal"}
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
          const isPortHovered = hoveredPortId === port.id;
          const showLabel = isDestination || isPortHovered;
          return (
            <g
              key={port.id}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredPortId(port.id)}
              onMouseLeave={() => setHoveredPortId(null)}
            >
              <circle cx={px} cy={py} r={12} fill="transparent" />
              <circle
                cx={px}
                cy={py}
                r={showLabel ? 5 : 3}
                fill={isDestination ? "#ef4444" : isPortHovered ? "#fff" : "#94a3b8"}
                stroke={showLabel ? "#fff" : "#0f1419"}
                strokeWidth={showLabel ? 1.5 : 0.5}
                opacity={showLabel ? 1 : 0.5}
              />
              {isDestination && (
                <circle cx={px} cy={py} r={12} fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.4">
                  <animate attributeName="r" values="8;16" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {showLabel && (
                <>
                  <rect
                    x={px - port.name.length * 7}
                    y={py - 21}
                    width={port.name.length * 14}
                    height={16}
                    rx={3}
                    fill="#0f1419"
                    opacity={0.85}
                  />
                  <text
                    x={px}
                    y={py - 9}
                    fill={isDestination ? "#ef4444" : "#fff"}
                    fontSize="12"
                    fontFamily="monospace"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {port.name}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* 船舶マーカー */}
        {tankers.map((t) => {
          const p = positions.get(t.id);
          if (!p) return null;
          const dimmed2 = isDimmed(t, scenario);
          const isVLCC = t.type === "VLCC";
          const isReturnShip = t.status === "引き返し";
          const color = isReturnShip ? "#f59e0b" : dimmed2 ? "#525252" : isVLCC ? "#f59e0b" : "#22c55e";
          const isActive = t.id === activeId;
          const isSelected = t.id === selectedId;

          const scale = getMarkerScale(t.cargo_t);
          const tw = (w: number) => +(w * scale).toFixed(1);

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
                  <animate attributeName="r" values={`${tw(10)};${tw(22)}`} dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {p.heading != null ? (
                <polygon
                  points={
                    isActive
                      ? `${-tw(7)},${tw(8)} ${tw(7)},${tw(8)} 0,${-tw(10)}`
                      : `${-tw(5)},${tw(6)} ${tw(5)},${tw(6)} 0,${-tw(8)}`
                  }
                  transform={`translate(${p.x},${p.y}) rotate(${p.heading})`}
                  fill={color}
                  stroke={isActive ? "#fff" : "#0f1419"}
                  strokeWidth={isActive ? 2 : 1}
                  strokeLinejoin="round"
                  opacity={dimmed2 ? 0.35 : isActive ? 1 : 0.9}
                />
              ) : (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? tw(8) : tw(6)}
                  fill={color}
                  stroke={isActive ? "#fff" : "#0f1419"}
                  strokeWidth={isActive ? 2 : 1}
                  opacity={dimmed2 ? 0.35 : isActive ? 1 : 0.9}
                />
              )}
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

      {/* ルートホバートゥールチップ */}
      {hoveredRoute !== null && hoveredRouteId !== null && activeTanker === undefined && (
        <div className="absolute top-3 left-3 bg-[#0f1419]/95 border border-[#263545] rounded px-3 py-2 text-xs font-mono space-y-1 pointer-events-none">
          <div className="text-neutral-200 font-bold">{hoveredRoute.label}</div>
          <div className="flex gap-3">
            <span className="text-neutral-500">
              容量 <span className="text-neutral-300">{hoveredRoute.capacity_mbpd.toFixed(1)} mbpd</span>
            </span>
            <span className="text-neutral-500">
              所要 <span className="text-neutral-300">約{hoveredRoute.transit_days}日</span>
            </span>
          </div>
          {hoveredRoute.risk_note !== undefined && (
            <div className="text-amber-400">⚠ {hoveredRoute.risk_note}</div>
          )}
        </div>
      )}

      {/* 船舶ツールチップ（選択/ホバー時） */}
      {activeTanker !== undefined && positions.has(activeTanker.id) && (
        <div className="absolute bottom-12 left-3 bg-panel/95 border border-border rounded px-3 py-2 text-xs font-mono space-y-1 pointer-events-none">
          <div className="flex items-center gap-2">
            <span
              className="px-1 py-0.5 rounded text-[10px]"
              style={{
                backgroundColor: activeTanker.type === "VLCC" ? "#f59e0b20" : "#22c55e20",
                color: activeTanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
              }}
            >
              {activeTanker.type}
            </span>
            <span className="text-neutral-200 font-bold">{activeTanker.name}</span>
          </div>
          <div className="text-neutral-500">
            {activeTanker.departure} → {activeTanker.destination}
          </div>
          <div className="text-neutral-500">
            積載量{" "}
            <span className="text-neutral-300">
              {new Intl.NumberFormat("ja-JP").format(activeTanker.cargo_t)}t
            </span>
            <span className="ml-1.5 text-neutral-600">
              ({getSizeLabel(activeTanker.cargo_t)})
            </span>
          </div>
          {HORMUZ_PORTS.has(activeTanker.departurePort) ? (
            <div className="text-red-400 font-bold">封鎖時到達不可</div>
          ) : !JAPAN_DEST_PORTS.has(activeTanker.destinationPort) ? (
            <div className="text-neutral-400 font-bold badge-not-japan-text">日本向けでない</div>
          ) : (
            <div className="text-neutral-400">
              到着まで{" "}
              <span
                className="font-bold"
                style={{
                  color: activeTanker.type === "VLCC" ? "#f59e0b" : "#22c55e",
                }}
              >
                {activeTanker.eta_days.toFixed(1)}日
              </span>
            </div>
          )}
        </div>
      )}

      {/* 凡例 + 精度バッジ */}
      <div className="absolute bottom-2 left-3 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] font-mono text-neutral-600">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b]" />
          VLCC
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-[#22c55e]" />
          LNG
        </span>
        <span className="flex items-center gap-1 text-[#ef4444]">
          <span className="inline-block w-1.5 h-1.5 bg-[#ef4444] rotate-45" />
          封鎖点
        </span>
        <span className="flex items-center gap-1 text-[#3b82f6]">
          <span className="inline-block w-5 border-t-2 border-[#3b82f6] border-dashed" />
          代替
        </span>
        <span className="text-neutral-700">線幅∝輸送容量</span>
      </div>
      <div className="absolute bottom-2 right-3">
        <DataBadge confidence="estimated" />
      </div>
    </div>
  );
};
