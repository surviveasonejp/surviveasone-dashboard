/**
 * Natural Earth 110m land boundaries → SVG path 文字列を生成
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
  new URL("../node_modules/world-atlas/land-110m.json", import.meta.url),
  "utf-8",
);
const topo = JSON.parse(topoRaw);
const geojson = feature(topo, topo.objects.land);

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

  return filtered
    .map(([lon, lat], i) => {
      const x = projectX(lon).toFixed(1);
      const y = projectY(lat).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
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
// Natural Earth 110m land boundaries (Public Domain)
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
