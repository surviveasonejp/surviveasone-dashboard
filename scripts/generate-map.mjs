/**
 * Natural Earth 50m land boundaries → SVG path 文字列を生成
 * Usage: node scripts/generate-map.mjs
 * Output: src/client/data/world-land.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { feature } from "topojson-client";

const MIN_LON = 10;
const MAX_LON = 170;
const MIN_LAT = -42;
const MAX_LAT = 58;
const W = 1000;
const H = 700;
const LON_SPAN = MAX_LON - MIN_LON;
const LAT_SPAN = MAX_LAT - MIN_LAT;

function projectX(lon) {
  return ((lon - MIN_LON) / LON_SPAN) * W;
}
function projectY(lat) {
  return ((MAX_LAT - lat) / LAT_SPAN) * H;
}

// TopoJSON 読み込み
const topoRaw = readFileSync(
  new URL("../node_modules/world-atlas/land-50m.json", import.meta.url),
  "utf-8",
);
const topo = JSON.parse(topoRaw);
const geojson = feature(topo, topo.objects.land);

// 50mデータは小島が多い。表示スケールで視認できない微小リングを除去してサイズ削減
// 閾値: 投影後の面積がMIN_RING_AREA_PX2未満のリングをスキップ
const MIN_RING_AREA_PX2 = 20; // px^2。ViewBox 1000x700 上で約4.5x4.5px未満の島を除去

function calcRingArea(projected) {
  // Shoelace formula で符号付き面積を算出
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length;
    area += projected[i][0] * projected[j][1];
    area -= projected[j][0] * projected[i][1];
  }
  return Math.abs(area) / 2;
}

// MultiPolygon / Polygon の座標を SVG path に変換
function ringToPath(ring) {
  // ring = [[lon, lat], ...]
  const filtered = [];
  for (const [lon, lat] of ring) {
    // 表示範囲を少し広めにとる（クリッピングはSVG側で行う）
    if (lon >= MIN_LON - 20 && lon <= MAX_LON + 20 && lat >= MIN_LAT - 10 && lat <= MAX_LAT + 10) {
      filtered.push([lon, lat]);
    }
  }
  if (filtered.length < 3) return "";

  // 投影後の座標
  const projected = filtered.map(([lon, lat]) => [projectX(lon), projectY(lat)]);

  // 微小リングの除去（大陸・主要島の海岸線精度は保持）
  if (calcRingArea(projected) < MIN_RING_AREA_PX2) return "";

  // 頂点間引き: 前の出力頂点から距離が MIN_VERTEX_DIST_PX 未満の頂点をスキップ
  // 50mデータは頂点が密すぎるため、表示スケールに合わせて削減
  const MIN_VERTEX_DIST_PX2 = 1.0; // 1px未満の移動は省略
  const simplified = [projected[0]];
  for (let i = 1; i < projected.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const dx = projected[i][0] - prev[0];
    const dy = projected[i][1] - prev[1];
    if (dx * dx + dy * dy >= MIN_VERTEX_DIST_PX2) {
      simplified.push(projected[i]);
    }
  }
  // 最後の頂点は常に保持（閉じたパスのため）
  simplified.push(projected[projected.length - 1]);
  if (simplified.length < 3) return "";

  return simplified
    .map(([x, y], i) => {
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("") + "Z";
}

function geometryToPath(geometry) {
  const paths = [];
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      const p = ringToPath(ring);
      if (p) paths.push(p);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        const p = ringToPath(ring);
        if (p) paths.push(p);
      }
    }
  }
  return paths.join(" ");
}

// フィーチャーを1つのパスに統合
let allPaths = "";
for (const feat of geojson.features ?? [geojson]) {
  const p = geometryToPath(feat.geometry);
  if (p) allPaths += (allPaths ? " " : "") + p;
}

// 出力ファイル生成
const output = `// ─── 自動生成: node scripts/generate-map.mjs ───
// Natural Earth 50m land boundaries (Public Domain)
// 表示範囲: ${MIN_LON}°E〜${MAX_LON}°E, ${MIN_LAT}°S〜${MAX_LAT}°N
// ViewBox: 0 0 ${W} ${H} (equirectangular projection)

export const WORLD_LAND_PATH = "${allPaths}";
`;

const outPath = new URL("../src/client/data/world-land.ts", import.meta.url);
writeFileSync(outPath, output, "utf-8");

// 統計
const sizeKB = (Buffer.byteLength(allPaths, "utf-8") / 1024).toFixed(1);
console.log(`Generated: src/client/data/world-land.ts`);
console.log(`Path data: ${sizeKB} KB`);
console.log(`Rings: ${allPaths.split("M").length - 1}`);
