import portsData from "../data/ports.json";
import routesData from "../data/sea-routes.json";
import type { TankerInfo } from "../../shared/types";

interface Position {
  lat: number;
  lon: number;
}

const PORTS = portsData as Record<string, Position>;

const ROUTES = routesData as Record<
  string,
  {
    waypoints: [number, number][];
    chokepoints: string[];
    partialRoute?: boolean;
    visibleStartProgress?: number;
  }
>;

const PORT_ROUTE_MAP: Record<string, string> = {
  "Ras Tanura": "hormuz-malacca",
  "Jubail": "hormuz-malacca",
  "Kharg Island": "hormuz-malacca",
  "Basrah": "hormuz-malacca",
  "Ras Laffan": "hormuz-malacca",
  "Fujairah": "fujairah-malacca",
  "Gladstone": "australia-east",
  "Dampier": "australia-west",
  "Bintulu": "southeast-asia",
  "Bontang": "southeast-asia",
  "Prigorodnoye": "sakhalin",
  "Sabine Pass": "us-pacific",
};

/** 航路上のウェイポイント列に沿って t (0〜1) の位置を補間 */
function interpolateAlongPath(
  path: [number, number][],
  t: number,
): Position {
  if (path.length === 0) return { lon: 0, lat: 0 };
  if (t <= 0) return { lon: path[0][0], lat: path[0][1] };
  if (t >= 1) {
    const last = path[path.length - 1];
    return { lon: last[0], lat: last[1] };
  }

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0];
    const dy = path[i][1] - path[i - 1][1];
    lengths.push(Math.sqrt(dx * dx + dy * dy));
    total += lengths[i - 1];
  }

  let target = t * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const segT = target / lengths[i];
      return {
        lon: path[i][0] + (path[i + 1][0] - path[i][0]) * segT,
        lat: path[i][1] + (path[i + 1][1] - path[i][1]) * segT,
      };
    }
    target -= lengths[i];
  }

  const last = path[path.length - 1];
  return { lon: last[0], lat: last[1] };
}

/** マップ表示範囲内かどうか */
export const MAP_BOUNDS = {
  minLon: 10,
  maxLon: 170,
  minLat: -42,
  maxLat: 58,
};

export function isInBounds(pos: Position): boolean {
  return (
    pos.lon >= MAP_BOUNDS.minLon &&
    pos.lon <= MAP_BOUNDS.maxLon &&
    pos.lat >= MAP_BOUNDS.minLat &&
    pos.lat <= MAP_BOUNDS.maxLat
  );
}

/** タンカーの推定位置を算出 */
export function estimatePosition(tanker: TankerInfo): Position | null {
  const dep = PORTS[tanker.departurePort];
  const dest = PORTS[tanker.destinationPort];
  if (!dep || !dest) return null;

  const routeId = PORT_ROUTE_MAP[tanker.departurePort];
  if (!routeId) return null;

  const route = ROUTES[routeId];
  if (!route) return null;

  const totalVoyageDays =
    tanker.distanceToJapan_nm / (tanker.speed_knots * 24);
  const progress = Math.max(
    0,
    Math.min(1, 1 - tanker.eta_days / totalVoyageDays),
  );

  // 部分航路（US太平洋ルートなど）: 可視範囲外ならnull
  if (route.partialRoute && route.visibleStartProgress != null) {
    if (progress < route.visibleStartProgress) return null;
    const visibleT =
      (progress - route.visibleStartProgress) /
      (1 - route.visibleStartProgress);
    const fullPath: [number, number][] = [
      ...route.waypoints,
      [dest.lon, dest.lat],
    ];
    return interpolateAlongPath(fullPath, visibleT);
  }

  // 通常航路: 出発港→ウェイポイント→到着港
  const fullPath: [number, number][] = [
    [dep.lon, dep.lat],
    ...route.waypoints,
    [dest.lon, dest.lat],
  ];

  return interpolateAlongPath(fullPath, progress);
}

/** 航路の全ウェイポイントを取得（地図描画用） */
export function getRoutePath(tanker: TankerInfo): [number, number][] | null {
  const dep = PORTS[tanker.departurePort];
  const dest = PORTS[tanker.destinationPort];
  if (!dep || !dest) return null;

  const routeId = PORT_ROUTE_MAP[tanker.departurePort];
  if (!routeId) return null;

  const route = ROUTES[routeId];
  if (!route) return null;

  if (route.partialRoute) {
    return [...route.waypoints, [dest.lon, dest.lat]];
  }

  return [[dep.lon, dep.lat], ...route.waypoints, [dest.lon, dest.lat]];
}

/** ルートIDを取得 */
export function getRouteId(departurePort: string): string | null {
  return PORT_ROUTE_MAP[departurePort] ?? null;
}
