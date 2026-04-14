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
  TRANSFER_HUBS,
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

  // anonymization（イラン→マレーシア沖の出所偽装ルート）
  if (routeType === "anonymization") {
    if (scenario === "normal") return { stroke: "#a855f7", opacity: 0, strokeDasharray: "3 5" };
    if (scenario === "full") return { stroke: "#a855f7", opacity: isActiveRoute ? 0.70 : 0.55, strokeDasharray: "5 3" };
    // partial
    return { stroke: "#a855f7", opacity: 0.32, strokeDasharray: "4 5" };
  }

  // existing_alt
  return {
    stroke: "#22c55e",
    opacity: isActiveRoute ? 0.52 : 0.28,
    strokeDasharray: isActiveRoute ? "8 4" : "4 5",
  };
}

// ─── 西半球インセット（PCのみ: HTML カード内 SVG）────────────────

const INSET_SVG_W = 200;
const INSET_SVG_H = 131;   // ホーン岬（-56°）表示のため南端拡張
const INSET_BOUNDS = {
  minLon: -105, maxLon: 22,
  minLat: -58,  maxLat: 46, // -43 → -58 に拡張
} as const;

function projectInset(lon: number, lat: number): [number, number] {
  return [
    ((lon - INSET_BOUNDS.minLon) / (INSET_BOUNDS.maxLon - INSET_BOUNDS.minLon)) * INSET_SVG_W,
    ((INSET_BOUNDS.maxLat - lat)  / (INSET_BOUNDS.maxLat  - INSET_BOUNDS.minLat))  * INSET_SVG_H,
  ];
}

// 主要点の SVG 座標（定数として事前計算）
const [USGC_IX, USGC_IY]     = projectInset(-93, 29);
const [PANAMA_IX, PANAMA_IY] = projectInset(-79,  9);
const [CAPE_IX,   CAPE_IY]   = projectInset( 18, -34);
const [HORN_IX,   HORN_IY]   = projectInset(-67, -56);

// 大西洋ルート（米国ガルフ → 喜望峰）
const INSET_ATLANTIC_D = smoothPath(
  ([ [-93,29],[-60,20],[-30,10],[-5,-5],[10,-25],[18,-34] ] as [number,number][])
    .map(([lon, lat]) => projectInset(lon, lat))
);

// パナマルート（米国ガルフ → パナマ運河）
const INSET_PANAMA_D = smoothPath(
  ([ [-93,29],[-79,9] ] as [number,number][])
    .map(([lon, lat]) => projectInset(lon, lat))
);

// ドレーク海峡ルート（米国ガルフ → 大西洋南下 → ホーン岬）
// 南米東海岸より常に東側（Atlantic Ocean）を通るよう設計
const INSET_DRAKE_D = smoothPath(
  ([ [-93,29],[-84,27],[-76,22],[-62,12],[-52,4],[-33,-8],[-36,-22],[-44,-34],[-52,-44],[-58,-52],[-65,-57],[-67,-56] ] as [number,number][])
    .map(([lon, lat]) => projectInset(lon, lat))
);

// 大陸ポリゴン（polygon points 文字列として事前計算）
const _toInsetPts = (pts: [number, number][]) =>
  pts.map(([lon, lat]) => {
    const [x, y] = projectInset(lon, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

// 北米+中米: 大西洋岸→メキシコ湾岸→ユカタン→中米カリブ岸→太平洋岸→左端で閉じる
const N_AMERICA_PTS = _toInsetPts([
  [-105, 46],              // 左上隅
  [-65,  46], [-67, 43],  // ノバスコシア
  [-70,  42],             // ケープコッド
  [-72,  41],             // ロングアイランド
  [-74,  39],             // ニュージャージー
  [-76,  37],             // チェサピーク湾
  [-77,  35],             // ケープハッテラス
  [-79,  33],             // ノースカロライナ
  [-80,  32],             // ジョージア
  [-81,  30],             // フロリダ北東
  [-81,  28],             // ケープカナベラル
  [-80,  26],             // マイアミ
  [-81,  25],             // フロリダ南端
  [-82,  27],             // フロリダ西岸
  [-84,  29],             // ビッグベンド
  [-87,  30],             // ペンサコーラ
  [-88,  30],             // モービル
  [-89,  29],             // ミシシッピデルタ
  [-90,  29],             // ニューオーリンズ
  [-91,  29],             // ルイジアナ西部
  [-95,  29],             // ガルベストン
  [-97,  28],             // コーパスクリスティ
  [-98,  22],             // タンピコ（メキシコ）
  [-96,  19],             // ベラクルス
  [-90,  19],             // カンペチェ
  [-87,  21],             // カンクン（ユカタン北東）
  [-87,  17],             // ベリーズ
  [-87,  15],             // ホンジュラス
  [-84,  12],             // ニカラグア（カリブ側）
  [-83,  10],             // コスタリカ（カリブ側）
  [-80,   9],             // パナマ（カリブ側）
  [-79,   8],             // パナマ（太平洋側）
  [-85,   9],             // コスタリカ（太平洋側）
  [-87,  12],             // ニカラグア（太平洋側）
  [-90,  13],             // エルサルバドル
  [-92,  15],             // グアテマラ
  [-94,  16],             // チアパス（メキシコ）
  [-100, 18],             // ゲレロ（メキシコ太平洋岸）
  [-105, 21],             // 左端で閉じる
]);

// 南米: パナマ太平洋岸→南端→大西洋岸→カリブ→パナマで閉じる
const S_AMERICA_PTS = _toInsetPts([
  [-79,   9],             // パナマ（太平洋側）
  [-77,   3],             // コロンビア太平洋岸
  [-80,  -2],             // エクアドル
  [-80,  -5],             // ペルー北部
  [-77, -12],             // リマ
  [-70, -18],             // タクナ
  [-70, -24],             // アントファガスタ
  [-71, -33],             // バルパライソ
  [-73, -41],             // プエルトモント
  [-74, -50],             // パタゴニア南部
  [-68, -54],             // マゼラン海峡付近
  [-67, -56],             // ホーン岬（最南端）
  [-63, -53],             // フォークランド方向
  [-62, -43],             // パタゴニア大西洋側
  [-62, -39],             // ブエノスアイレス周辺
  [-57, -36],             // ラプラタ川河口
  [-51, -30],             // ポルトアレグレ
  [-48, -27],             // フロリアノポリス
  [-46, -24],             // サントス
  [-43, -23],             // リオデジャネイロ
  [-40, -20],             // ビトーリア
  [-38, -13],             // サルバドール
  [-35,  -8],             // レシフェ
  [-35,  -5],             // ナタル（ブラジル最東端）
  [-38,  -3],             // フォルタレザ
  [-48,  -1],             // ベレン
  [-51,   0],             // マカパ
  [-55,   4],             // スリナム
  [-58,   7],             // ガイアナ
  [-61,  10],             // トリニダード
  [-62,  11],             // ベネズエラ東部
  [-67,  11],             // カラカス
  [-72,  11],             // マラカイボ
  [-75,  11],             // コロンビア（カリブ側）
  [-80,   9],             // カリブ沿岸→パナマで閉じる
]);

// アフリカ大陸西岸: モロッコ→ギニア湾→喜望峰→右端で閉じる
const AFRICA_PTS = _toInsetPts([
  [ -5,  46],             // 上端（モロッコ/ジブラルタル）
  [ 22,  46], [22, -58], // 右端で外枠（ホーン岬緯度まで）
  [ 18, -34],             // 喜望峰（ケープオブグッドホープ）
  [ 17, -29],             // 南アフリカ南岸
  [ 16, -23],             // ナミビア（リューデリッツ）
  [ 13,  -9],             // アンゴラ（ルアンダ）
  [ 12,  -5],             // コンゴ/カビンダ
  [ 10,  -1],             // ガボン（ポルジャンティール）
  [  9,   2],             // カメルーン
  [  7,   5],             // ナイジェリア（ポートハーコート）
  [  3,   6],             // ラゴス
  [  0,   6],             // アクラ（ガーナ）
  [ -2,   5],             // ケープスリーポインツ
  [ -5,   5],             // コートジボワール
  [ -8,   5],             // リベリア
  [-11,   7],             // シエラレオネ
  [-15,  11],             // ギニアビサウ
  [-17,  14],             // セネガル/ガンビア
  [-17,  21],             // 西サハラ（ダフラ）
  [-13,  28],             // モロッコ南部（アガディール）
  [ -5,  36],             // モロッコ北（タンジェ）
]);

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
  /** PCのみ: 西半球インセット表示 */
  showInset?: boolean;
  /** 非日本向け・ホルムズ封鎖時到達不可タンカーを表示するか（デフォルト: 非表示） */
  showDimmed?: boolean;
  /** 選択中のルートID（外部から管理） */
  selectedRouteId?: string | null;
  /** ルート選択コールバック */
  onRouteSelect?: (id: string | null) => void;
  /** ルートホバーコールバック */
  onRouteHover?: (id: string | null) => void;
}

export const TankerMap: FC<TankerMapProps> = ({
  tankers,
  selectedId,
  onSelect,
  scenario = "full",
  showInset = false,
  showDimmed = false,
  selectedRouteId = null,
  onRouteSelect,
  onRouteHover,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [hoveredHubId, setHoveredHubId] = useState<string | null>(null);

  // 表示対象タンカー（showDimmed=false のとき非日本向け・ホルムズ船を除外）
  const visibleTankers = useMemo(
    () => (showDimmed ? tankers : tankers.filter((t) => !isDimmed(t, scenario))),
    [tankers, showDimmed, scenario],
  );

  // 各タンカーの推定位置・進行方向を算出
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; pos: { lat: number; lon: number }; heading: number | null }>();
    for (const t of visibleTankers) {
      const pos = estimatePosition(t);
      if (pos && isInBounds(pos)) {
        const [x, y] = project(pos.lon, pos.lat);
        const heading = estimateHeading(t);
        map.set(t.id, { x, y, pos, heading });
      }
    }
    return map;
  }, [visibleTankers]);

  // アクティブなルートID集合（タンカーがいるルート）
  const activeRouteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of visibleTankers) {
      const routeId = getRouteId(t.departurePort);
      if (routeId) ids.add(routeId);
    }
    return ids;
  }, [visibleTankers]);

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
    for (const t of visibleTankers) {
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
  const activeTanker = visibleTankers.find((t) => t.id === activeId);

  return (
    <div className="bg-[#0c1018] border border-border rounded-lg overflow-hidden relative">
      <svg
        data-screenshot="tanker-map"
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="タンカー推定航跡マップ"
        onClick={() => { onSelect(null); onRouteSelect?.(null); }}
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
            const isSelected = selectedRouteId === routeId;
            return (
              <path
                key={`base-${routeId}`}
                d={d}
                fill="none"
                stroke={isSelected ? "#e2e8f0" : style.stroke}
                strokeWidth={isSelected ? sw * 1.6 : sw}
                strokeDasharray={isSelected ? "none" : style.strokeDasharray}
                opacity={isSelected ? 0.9 : isHovered ? Math.min(style.opacity + 0.25, 0.95) : style.opacity}
                className="cursor-pointer"
                style={{ transition: "opacity 350ms ease-out, stroke 350ms ease-out, stroke-width 200ms ease-out" }}
                onMouseEnter={() => { setHoveredRouteId(routeId); onRouteHover?.(routeId); }}
                onMouseLeave={() => { setHoveredRouteId(null); onRouteHover?.(null); }}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = selectedRouteId === routeId ? null : routeId;
                  onRouteSelect?.(next);
                }}
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

        {/* ── 完全封鎖時: ホルムズ×マーク（ポップインアニメーション）── */}
        {scenario === "full" && (() => {
          const [cx, cy] = project(56.25, 26.567);
          const s = 14;
          return (
            <g style={{ pointerEvents: "none" }} transform={`translate(${cx},${cy})`}>
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`${cx},${cy}`}
                dur="0s"
              />
              <g style={{ animation: "tanker-x-pop 300ms cubic-bezier(0.34,1.56,0.64,1) forwards" }}>
                <line x1={-s} y1={-s} x2={s} y2={s} stroke="#ef4444" strokeWidth={2.5} opacity={0.7} />
                <line x1={s} y1={-s} x2={-s} y2={s} stroke="#ef4444" strokeWidth={2.5} opacity={0.7} />
              </g>
            </g>
          );
        })()}

        {/* ── ルート所要日数ラベル（ホバー中ルートのみ）── */}
        {hoveredRouteId !== null && (
          <g clipPath="url(#map-clip)" style={{ pointerEvents: "none" }}>
            {routeMidpoints.filter(({ routeId }) => routeId === hoveredRouteId).map(({ routeId, x, y, transit_days, route_type }) => {
              // primaryは「XX日」、bypass/existing_alt/anonymizationは「約XX日」で表示
              const isBypass = route_type === "bypass";
              const isExisting = route_type === "existing_alt";
              const isPrimary = route_type === "primary";
              const isAnonymization = route_type === "anonymization";
              if (!isBypass && !isExisting && !isPrimary && !isAnonymization) return null;
              // 画面外はスキップ
              if (x < 20 || x > W - 20 || y < 20 || y > H - 20) return null;

              const color = isPrimary ? "#ef4444" : isBypass ? "#60a5fa" : isAnonymization ? "#a855f7" : "#4ade80";
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

        {/* チョークポイント: ホルムズは常時表示。他は封鎖シナリオ時のみ */}
        {CHOKEPOINTS
          .filter((cp) => isInBounds(cp))
          .filter((cp) => cp.id === "hormuz" || scenario !== "normal")
          .map((cp) => {
          const [cx, cy] = project(cp.lon, cp.lat);
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

        {/* ── TransferHub（STS積替 / 匿名化ハブ）: partial/full封鎖時に表示 ── */}
        {(scenario === "full" || scenario === "partial") && TRANSFER_HUBS.filter((h) => isInBounds(h)).map((hub) => {
          const [hx, hy] = project(hub.lon, hub.lat);
          const isAnon = hub.type === "anonymization";
          const isHovered = hoveredHubId === hub.id;
          // full封鎖時にアノニマイゼーションハブを強調（partial時は控えめ）
          const isHighlighted = isAnon && scenario === "full";
          const baseColor = isAnon ? "#a855f7" : "#f97316";
          const opacity = isHighlighted ? 0.95 : isHovered ? 0.85 : scenario === "partial" ? 0.38 : 0.55;
          const r = 7;
          // 正六角形の頂点（半径r）
          const hexPoints = Array.from({ length: 6 }, (_, i) => {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            return `${(hx + r * Math.cos(angle)).toFixed(1)},${(hy + r * Math.sin(angle)).toFixed(1)}`;
          }).join(" ");
          return (
            <g
              key={hub.id}
              className="cursor-pointer"
              style={{ animation: "tanker-fade-in 400ms ease-out forwards" }}
              onMouseEnter={() => setHoveredHubId(hub.id)}
              onMouseLeave={() => setHoveredHubId(null)}
            >
              {/* 強調時の外側リング */}
              {isHighlighted && (
                <circle
                  cx={hx}
                  cy={hy}
                  r={r + 8}
                  fill="none"
                  stroke={baseColor}
                  strokeWidth={1}
                  opacity={0.35}
                >
                  <animate attributeName="r" values={`${r + 5};${r + 14}`} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <polygon
                points={hexPoints}
                fill={baseColor}
                stroke={isHovered || isHighlighted ? "#fff" : "#0f1419"}
                strokeWidth={isHovered || isHighlighted ? 1.5 : 0.8}
                opacity={opacity}
              />
              {/* 匿名化ハブは「?」アイコン、STSは「⇄」 */}
              <text
                x={hx}
                y={hy + 4}
                textAnchor="middle"
                fill="#fff"
                fontSize="8"
                fontFamily="monospace"
                fontWeight="bold"
                style={{ pointerEvents: "none" }}
              >
                {isAnon ? "?" : "⇄"}
              </text>
              {/* ラベル（ホバー時 or 強調時） */}
              {(isHovered || isHighlighted) && (
                <text
                  x={hx + r + 6}
                  y={hy + 4}
                  fill={baseColor}
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                  style={{ pointerEvents: "none" }}
                >
                  {hub.name}
                </text>
              )}
            </g>
          );
        })}

        {/* 日本の到着港マーカー: タンカー選択時に目的港のみ表示 */}
        {activeTanker !== undefined && JAPAN_PORTS.filter(
          (p) => isInBounds(p) && p.id === activeTanker.destinationPort
        ).map((port) => {
          const [px, py] = project(port.lon, port.lat);
          return (
            <g key={port.id} style={{ pointerEvents: "none" }}>
              <circle cx={px} cy={py} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />
              <circle cx={px} cy={py} r={12} fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.4">
                <animate attributeName="r" values="8;16" dur="1.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0" dur="1.5s" repeatCount="indefinite" />
              </circle>
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
                fill="#ef4444"
                fontSize="12"
                fontFamily="monospace"
                textAnchor="middle"
                fontWeight="bold"
              >
                {port.name}
              </text>
            </g>
          );
        })}

        {/* 船舶マーカー */}
        {visibleTankers.map((t) => {
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

      {/* TransferHub ホバーツールチップ（SVG外HTMLオーバーレイ） */}
      {hoveredHubId !== null && (() => {
        const hub = TRANSFER_HUBS.find((h) => h.id === hoveredHubId);
        if (!hub) return null;
        const [hx, hy] = project(hub.lon, hub.lat);
        const leftPct = (hx / W) * 100;
        const topPct = (hy / H) * 100;
        const accentColor = hub.type === "anonymization" ? "#a855f7" : "#f97316";
        return (
          <div
            className="absolute z-20 bg-panel border border-border rounded-lg shadow-lg px-3 py-2 pointer-events-none"
            style={{
              left: `${Math.min(leftPct + 3, 60)}%`,
              top: `${Math.max(topPct - 12, 5)}%`,
              maxWidth: "230px",
            }}
          >
            <div className="text-[11px] font-mono font-bold mb-1" style={{ color: accentColor }}>
              {hub.name}
            </div>
            {hub.description.split("\n").map((line, i) => (
              <div key={i} className="text-[10px] font-mono text-text-muted leading-snug">{line}</div>
            ))}
            <div className="text-[9px] font-mono text-neutral-500 mt-1.5">出典: {hub.source}</div>
          </div>
        );
      })()}

      {/* 西半球インセット（PCのみ: HTML カード・テーマ自動対応）*/}
      {showInset && (
        <div className="absolute top-2 left-2 bg-panel/95 border border-border rounded-lg shadow-sm pointer-events-none z-10">
          <div className="px-2 pt-1.5 pb-0 text-[9px] font-mono text-neutral-400 font-bold tracking-wider">
            西半球ルート（地図外）
          </div>
          <svg viewBox={`0 0 ${INSET_SVG_W} ${INSET_SVG_H}`} width={INSET_SVG_W} height={INSET_SVG_H}>
            {/* ─ 海（背景）─ */}
            <rect x={0} y={0} width={INSET_SVG_W} height={INSET_SVG_H} className="inset-ocean" />
            {/* ─ 大陸ポリゴン（CSS で海陸の色をテーマ別制御）─ */}
            <polygon className="inset-land" points={N_AMERICA_PTS} />
            <polygon className="inset-land" points={S_AMERICA_PTS} />
            <polygon className="inset-land" points={AFRICA_PTS} />

            {/* ─ 航路線 ─ */}
            {/* 大西洋ルート（喜望峰経由）*/}
            <path d={INSET_ATLANTIC_D} fill="none" stroke="#94a3b8" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.85} />
            {/* パナマルート（米国ガルフ→パナマ運河）*/}
            <path d={INSET_PANAMA_D}   fill="none" stroke="#16a34a" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.85} />
            {/* ドレーク海峡ルート（米国ガルフ→ホーン岬・VLCC専用）*/}
            <path d={INSET_DRAKE_D}    fill="none" stroke="#a78bfa" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.85} />
            {/* パナマ → 太平洋（左端へ続く：パナマ運河通過後の太平洋航行）*/}
            <line
              x1={PANAMA_IX} y1={PANAMA_IY} x2={1} y2={PANAMA_IY}
              stroke="#16a34a" strokeWidth={1.8} strokeDasharray="3 2" opacity={0.95}
            />
            {/* 太平洋方向の矢印（左端・パナマ）*/}
            <polygon
              points={`3,${PANAMA_IY - 5} 3,${PANAMA_IY + 5} -5,${PANAMA_IY}`}
              fill="#16a34a" opacity={0.95}
            />
            {/* ホーン岬 → 太平洋（左端へ続く）*/}
            <line
              x1={HORN_IX} y1={HORN_IY} x2={1} y2={HORN_IY}
              stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.9}
            />
            {/* 太平洋方向の矢印（左端・ホーン岬）*/}
            <polygon
              points={`2,${HORN_IY - 4} 2,${HORN_IY + 4} -4,${HORN_IY}`}
              fill="#a78bfa" opacity={0.9}
            />

            {/* ─ マーカー ─ */}
            {/* 米国ガルフ */}
            <circle cx={USGC_IX} cy={USGC_IY} r={3} fill="#94a3b8" opacity={0.9} />
            <text x={USGC_IX + 4} y={USGC_IY + 4} fill="#94a3b8" fontSize="7" fontFamily="monospace">米国ガルフ</text>
            {/* パナマ運河 */}
            <rect
              x={PANAMA_IX - 3} y={PANAMA_IY - 3} width={6} height={6}
              transform={`rotate(45 ${PANAMA_IX} ${PANAMA_IY})`}
              fill="#d97706" opacity={0.95}
            />
            <text x={PANAMA_IX + 5} y={PANAMA_IY - 1} fill="#d97706" fontSize="7" fontFamily="monospace" fontWeight="bold">パナマ運河</text>
            {/* 喜望峰 */}
            <circle cx={CAPE_IX} cy={CAPE_IY} r={2.5} fill="#94a3b8" opacity={0.8} />
            <text x={CAPE_IX - 34} y={CAPE_IY - 5} fill="#94a3b8" fontSize="7" fontFamily="monospace">喜望峰</text>
            {/* ホーン岬 */}
            <circle cx={HORN_IX} cy={HORN_IY} r={2.5} fill="#a78bfa" opacity={0.9} />
            <text x={HORN_IX + 4} y={HORN_IY - 4} fill="#a78bfa" fontSize="7" fontFamily="monospace">ホーン岬</text>

            {/* ─ 方向ラベル ─ */}
            {/* 太平洋（左端・緑）: パナマ経由の太平洋航行を明示 */}
            <text x={3} y={PANAMA_IY - 9} fill="#16a34a" fontSize="8" fontFamily="monospace" fontWeight="bold">← 太平洋</text>
            <text x={3} y={PANAMA_IY + 14} fill="#16a34a" fontSize="6.5" fontFamily="monospace" opacity={0.8}>経由→日本</text>
            {/* 太平洋（左端・紫）: ホーン岬経由 */}
            <text x={3} y={HORN_IY - 7} fill="#a78bfa" fontSize="7" fontFamily="monospace" fontWeight="bold">← 太平洋</text>
            <text x={3} y={HORN_IY + 10} fill="#a78bfa" fontSize="6" fontFamily="monospace" opacity={0.8}>(55日・VLCC)</text>
            {/* インド洋（喜望峰から右へ）*/}
            <text x={CAPE_IX - 38} y={CAPE_IY + 10} fill="#94a3b8" fontSize="6.5" fontFamily="monospace" opacity={0.8}>→インド洋</text>
            {/* 大西洋（中央）*/}
            <text x={125} y={55} fill="#94a3b8" fontSize="8" fontFamily="monospace">大西洋</text>
          </svg>
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
        {(scenario === "partial" || scenario === "full") && (
          <span className="flex items-center gap-1 text-[#3b82f6]">
            <span className="inline-block w-5 border-t-2 border-[#3b82f6] border-dashed" />
            代替
          </span>
        )}
        {(scenario === "partial" || scenario === "full") && (
          <span className="flex items-center gap-1 text-[#a855f7]">
            <span className="inline-block w-5 border-t-2 border-[#a855f7] border-dashed" />
            匿名化
          </span>
        )}
        {scenario === "full" && (
          <>
            <span className="flex items-center gap-1 text-[#f97316]">
              <svg width="10" height="10" viewBox="-5 -5 10 10"><polygon points="0,-5 4.3,-2.5 4.3,2.5 0,5 -4.3,2.5 -4.3,-2.5" fill="#f97316" /></svg>
              STS積替
            </span>
            <span className="flex items-center gap-1 text-[#a855f7]">
              <svg width="10" height="10" viewBox="-5 -5 10 10"><polygon points="0,-5 4.3,-2.5 4.3,2.5 0,5 -4.3,2.5 -4.3,-2.5" fill="#a855f7" /></svg>
              匿名化ハブ
            </span>
          </>
        )}
        <span className="text-neutral-700">線幅∝輸送容量</span>
      </div>
      <div className="absolute bottom-2 right-3">
        <DataBadge confidence="estimated" />
      </div>
    </div>
  );
};
