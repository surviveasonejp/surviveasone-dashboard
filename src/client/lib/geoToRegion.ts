/**
 * 緯度経度 → 10電力エリアID変換
 *
 * 各エリアの中心座標との最短距離で判定（簡易方式）。
 * 都道府県境界ポリゴンは不要 — 10エリアレベルの精度で十分。
 */

interface RegionCenter {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

const REGION_CENTERS: RegionCenter[] = [
  { id: "hokkaido", name: "北海道", lat: 43.06, lon: 141.35 },
  { id: "tohoku", name: "東北", lat: 38.27, lon: 140.87 },
  { id: "tokyo", name: "東京", lat: 35.68, lon: 139.69 },
  { id: "chubu", name: "中部", lat: 35.18, lon: 136.91 },
  { id: "hokuriku", name: "北陸", lat: 36.59, lon: 136.63 },
  { id: "kansai", name: "関西", lat: 34.69, lon: 135.50 },
  { id: "chugoku", name: "中国", lat: 34.40, lon: 132.46 },
  { id: "shikoku", name: "四国", lat: 33.84, lon: 133.55 },
  { id: "kyushu", name: "九州", lat: 33.59, lon: 130.40 },
  { id: "okinawa", name: "沖縄", lat: 26.34, lon: 127.80 },
];

/** 2点間の距離（度ベース、簡易計算） */
function distanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = lat1 - lat2;
  const dLon = (lon1 - lon2) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** 緯度経度から最寄りの電力エリアIDを返す */
export function geoToRegionId(lat: number, lon: number): string {
  let minDist = Infinity;
  let closest = "tokyo";

  for (const rc of REGION_CENTERS) {
    const d = distanceDeg(lat, lon, rc.lat, rc.lon);
    if (d < minDist) {
      minDist = d;
      closest = rc.id;
    }
  }

  return closest;
}

/** エリアIDからエリア名を返す */
export function regionIdToName(id: string): string {
  return REGION_CENTERS.find((r) => r.id === id)?.name ?? id;
}
