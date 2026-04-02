/**
 * 各電力会社CSVフェッチャー
 *
 * 10電力エリアの需給実績データを取得しD1に格納する。
 * 毎日 UTC 18:00 (JST 3:00) に実行 → 前日の確定値を取得。
 *
 * Tier 1（リアルタイムCSV/JSON）: TEPCO, Kansai, Chubu, Hokuriku
 * Tier 2（月別CSV）: 北海道, 東北, 中国, 沖縄
 * Tier 3（簡易CSV）: 四国, 九州
 */

interface AreaDemandRecord {
  date: string;
  area_id: string;
  peak_demand_mw: number;
  peak_supply_mw: number | null;
  usage_rate: number | null;
  solar_mw: number | null;
  wind_mw: number | null;
  thermal_mw: number | null;
  nuclear_mw: number | null;
  source: string;
}

interface FetchResult {
  area_id: string;
  record: AreaDemandRecord | null;
  error: string | null;
}

// ─── エリアフェッチャー定義 ──────────────────────────

type AreaFetcher = (targetDate: string) => Promise<FetchResult>;

/** TEPCO: リアルタイム実績CSV */
async function fetchTepco(targetDate: string): Promise<FetchResult> {
  const area_id = "tokyo";
  try {
    const res = await fetch("https://www4.tepco.co.jp/forecast/html/images/AREA_JISEKI.csv");
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };

    const text = await res.text();
    const record = parseTepcoAreaCsv(text, area_id, targetDate);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 中部電力: リアルタイム実績CSV（TEPCOと同形式） */
async function fetchChubu(targetDate: string): Promise<FetchResult> {
  const area_id = "chubu";
  try {
    const res = await fetch("https://powergrid.chuden.co.jp/denki_yoho_content_data/keito_jisseki_cepco003.csv");
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };

    const text = await res.text();
    const record = parseTepcoAreaCsv(text, area_id, targetDate);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 関西電力: JSON API */
async function fetchKansai(targetDate: string): Promise<FetchResult> {
  const area_id = "kansai";
  try {
    const res = await fetch("https://www.kansai-td.co.jp/interchange/denkiyoho/area-performance/jisseki.json");
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };

    const json = await res.json() as {
      date: string;
      list: Array<{ name: string; value: (number | null)[] }>;
    };

    const getValue = (name: string): (number | null)[] =>
      json.list.find((item) => item.name === name)?.value ?? [];

    const demand = getValue("demand").filter((v): v is number => v !== null);
    const nuclear = getValue("nuclear").filter((v): v is number => v !== null);
    const lng = getValue("lng").filter((v): v is number => v !== null);
    const coal = getValue("coal").filter((v): v is number => v !== null);
    const oil = getValue("oil").filter((v): v is number => v !== null);
    const solar = getValue("solar").filter((v): v is number => v !== null);
    const wind = getValue("wind").filter((v): v is number => v !== null);

    if (demand.length === 0) {
      return { area_id, record: null, error: "no demand data" };
    }

    const peakDemand = Math.max(...demand);
    const thermalPeak = Math.max(
      ...lng.map((v, i) => v + (coal[i] ?? 0) + (oil[i] ?? 0)),
    );

    const record: AreaDemandRecord = {
      date: targetDate,
      area_id,
      peak_demand_mw: peakDemand,
      peak_supply_mw: null,
      usage_rate: null,
      solar_mw: solar.length > 0 ? Math.max(...solar) : null,
      wind_mw: wind.length > 0 ? Math.max(...wind) : null,
      thermal_mw: thermalPeak > 0 ? thermalPeak : null,
      nuclear_mw: nuclear.length > 0 ? Math.max(...nuclear) : null,
      source: "関西電力送配電 JSON API",
    };

    return { area_id, record, error: null };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 北陸電力: 日別実績CSV */
async function fetchHokuriku(targetDate: string): Promise<FetchResult> {
  const area_id = "hokuriku";
  const dateStr = targetDate.replace(/-/g, "");
  try {
    const res = await fetch(
      `https://www.rikuden.co.jp/nw/denki-yoho/csv/jukyu_jisseki_${dateStr}_05.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };

    const text = await res.text();
    const record = parseTepcoAreaCsv(text, area_id, targetDate);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

// ─── Tier 2/3: 残り6エリア ───────────────────────────

/** 北海道電力: 日別需要CSV（juyo_01_YYYYMMDD.csv） */
async function fetchHokkaido(targetDate: string): Promise<FetchResult> {
  const area_id = "hokkaido";
  const dateStr = targetDate.replace(/-/g, "");
  try {
    const res = await fetch(
      `https://denkiyoho.hepco.co.jp/area/data/juyo_01_${dateStr}.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const record = parseComplexCsv(text, area_id, targetDate, false);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 東北電力: 年別需要CSV */
async function fetchTohoku(targetDate: string): Promise<FetchResult> {
  const area_id = "tohoku";
  const year = targetDate.slice(0, 4);
  try {
    const res = await fetch(
      `https://setsuden.nw.tohoku-epco.co.jp/common/demand/juyo_${year}_tohoku.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const record = parseSimpleDemandCsv(text, area_id, targetDate);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 中国電力: 月次需給CSV（eria_jukyu_YYYYMM_07.csv、MW単位） */
async function fetchChugoku(targetDate: string): Promise<FetchResult> {
  const area_id = "chugoku";
  const ym = targetDate.slice(0, 7).replace(/-/g, "");
  try {
    const res = await fetch(
      `https://www.energia.co.jp/nw/jukyuu/sys/eria_jukyu_${ym}_07.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const record = parseComplexCsv(text, area_id, targetDate, true);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 四国電力: 年別需要CSV */
async function fetchShikoku(targetDate: string): Promise<FetchResult> {
  const area_id = "shikoku";
  const year = targetDate.slice(0, 4);
  try {
    const res = await fetch(
      `https://www.yonden.co.jp/nw/denkiyoho/csv/juyo_shikoku_${year}.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const record = parseSimpleDemandCsv(text, area_id, targetDate);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 九州電力: 年次需要CSV（juyo-YYYY.csv、万kW単位） */
async function fetchKyushu(targetDate: string): Promise<FetchResult> {
  const area_id = "kyushu";
  const year = targetDate.slice(0, 4);
  try {
    const res = await fetch(
      `https://www.kyuden.co.jp/td_power_usages/csv/juyo-${year}.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const record = parseComplexCsv(text, area_id, targetDate, false);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 沖縄電力: 月次需給CSV（eria_jukyu_YYYYMM_10.csv、MW単位） */
async function fetchOkinawa(targetDate: string): Promise<FetchResult> {
  const area_id = "okinawa";
  const ym = targetDate.slice(0, 7).replace(/-/g, "");
  try {
    const res = await fetch(
      `https://www.okiden.co.jp/business-support/service/supply-and-demand/csv/eria_jukyu_${ym}_10.csv`,
    );
    if (!res.ok) return { area_id, record: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    const record = parseComplexCsv(text, area_id, targetDate, true);
    return { area_id, record, error: record ? null : "no matching date" };
  } catch (e) {
    return { area_id, record: null, error: String(e) };
  }
}

/** 日付文字列の正規化: 2026/4/1 → 2026/04/01 */
function normalizeDateStr(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m?.[1] && m[2] && m[3]) {
    return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  }
  return dateStr;
}

/**
 * 簡易需要CSVパーサー（Tier 2/3共通）
 * 形式: DATE,TIME,実績(万kW)[,供給力(万kW),使用率(%)]
 * ヘッダー行あり。1時間間隔。
 */
function parseSimpleDemandCsv(
  text: string,
  area_id: string,
  targetDate: string,
): AreaDemandRecord | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  let maxDemandManKw = 0;
  let maxSupplyManKw = 0;
  let count = 0;

  const targetYmd = normalizeDateStr(targetDate.replace(/-/g, "/"));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 3) continue;

    const col0 = cols[0] ?? "";
    const dateNorm = normalizeDateStr(col0.trim());
    if (dateNorm !== targetYmd && col0.trim() !== targetDate) continue;

    const demand = parseFloat(cols[2] ?? "") || 0;
    const supply = cols.length >= 4 ? parseFloat(cols[3] ?? "") || 0 : 0;

    if (demand > maxDemandManKw) maxDemandManKw = demand;
    if (supply > maxSupplyManKw) maxSupplyManKw = supply;
    count++;
  }

  if (count === 0) return null;

  // 万kW → MW（1万kW = 10MW）
  const peakDemand = Math.round(maxDemandManKw * 10);
  const peakSupply = maxSupplyManKw > 0 ? Math.round(maxSupplyManKw * 10) : null;

  return {
    date: targetDate,
    area_id,
    peak_demand_mw: peakDemand,
    peak_supply_mw: peakSupply,
    usage_rate: peakSupply ? Math.round((peakDemand / peakSupply) * 1000) / 1000 : null,
    solar_mw: null,
    wind_mw: null,
    thermal_mw: null,
    nuclear_mw: null,
    source: getSourceName(area_id),
  };
}

/**
 * 複合形式CSVパーサー（北海道日別・中国月次・九州年次・沖縄月次）
 * ヘッダー部分（ピーク集計等）をスキップし、DATE,TIME 行以降の時系列データを処理。
 * unitIsMw: true=MW直接、false=万kW×10
 */
function parseComplexCsv(
  text: string,
  area_id: string,
  targetDate: string,
  unitIsMw: boolean,
): AreaDemandRecord | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  // DATE,TIME 行を探す
  let dataStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    if ((cols[0] ?? "").trim() === "DATE" && (cols[1] ?? "").trim() === "TIME") {
      dataStartIdx = i + 1;
      break;
    }
  }
  if (dataStartIdx < 0) return null;

  const targetYmd = normalizeDateStr(targetDate.replace(/-/g, "/"));
  let maxVal = 0;
  let count = 0;

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 3) continue;

    const dateNorm = normalizeDateStr((cols[0] ?? "").trim());
    if (dateNorm !== targetYmd) continue;

    const val = parseFloat(cols[2] ?? "") || 0;
    if (val > maxVal) maxVal = val;
    count++;
  }

  if (count === 0) return null;

  const peakMw = unitIsMw ? Math.round(maxVal) : Math.round(maxVal * 10);

  return {
    date: targetDate,
    area_id,
    peak_demand_mw: peakMw,
    peak_supply_mw: null,
    usage_rate: null,
    solar_mw: null,
    wind_mw: null,
    thermal_mw: null,
    nuclear_mw: null,
    source: getSourceName(area_id),
  };
}

// ─── 共通CSVパーサー ─────────────────────────────────

/**
 * TEPCO/中部/北陸の共通形式をパース。
 * ヘッダー3行 + データ行。
 * カラム: 日付,時間コマ,時間帯_自,時間帯_至,エリア総需要量[kWh],エリア総発電量[kWh],風力太陽光[kWh]
 */
function parseTepcoAreaCsv(
  text: string,
  area_id: string,
  targetDate: string,
): AreaDemandRecord | null {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 4) return null;

  // ヘッダー3行をスキップ、データ行を収集
  const dataLines = lines.slice(3);
  let maxDemandKwh = 0;
  let maxSupplyKwh = 0;
  let maxSolarWindKwh = 0;
  let count = 0;

  const targetYmd = targetDate.replace(/-/g, "/");
  const targetYmdCompact = targetDate.replace(/-/g, ""); // YYYYMMDD形式（TEPCO等）

  for (const line of dataLines) {
    const cols = line.split(",");
    if (cols.length < 5) continue;

    // 日付フィルタ（YYYY/MM/DD または YYYYMMDD 形式）
    const dateCol = (cols[0] ?? "").trim();
    if (dateCol !== targetYmd && dateCol !== targetDate && dateCol !== targetYmdCompact) continue;

    const demand = parseFloat(cols[4] ?? "") || 0;
    const supply = parseFloat(cols[5] ?? "") || 0;
    const solarWind = parseFloat(cols[6] ?? "") || 0;

    if (demand > maxDemandKwh) maxDemandKwh = demand;
    if (supply > maxSupplyKwh) maxSupplyKwh = supply;
    if (solarWind > maxSolarWindKwh) maxSolarWindKwh = solarWind;
    count++;
  }

  if (count === 0) return null;

  // 30分kWhをMWに換算: kWh × 2 / 1000 = MW（30分コマなので×2で時間あたりに換算）
  const kwhToMw = (kwh: number) => (kwh * 2) / 1000;

  return {
    date: targetDate,
    area_id,
    peak_demand_mw: Math.round(kwhToMw(maxDemandKwh)),
    peak_supply_mw: maxSupplyKwh > 0 ? Math.round(kwhToMw(maxSupplyKwh)) : null,
    usage_rate: maxSupplyKwh > 0 ? Math.round((maxDemandKwh / maxSupplyKwh) * 1000) / 1000 : null,
    solar_mw: null,
    wind_mw: null,
    thermal_mw: null,
    nuclear_mw: null,
    source: getSourceName(area_id),
  };
}

function getSourceName(area_id: string): string {
  const names: Record<string, string> = {
    hokkaido: "北海道電力NW juyo_01.csv",
    tohoku: "東北電力NW juyo_tohoku.csv",
    tokyo: "東京電力PG AREA_JISEKI.csv",
    chubu: "中部電力PG keito_jisseki.csv",
    hokuriku: "北陸電力送配電 jukyu_jisseki.csv",
    kansai: "関西電力送配電 jisseki.json",
    chugoku: "中国電力NW juyo_07.csv",
    shikoku: "四国電力送配電 juyo_shikoku.csv",
    kyushu: "九州電力送配電 juyo-hourly.csv",
    okinawa: "沖縄電力 juyo_10.csv",
  };
  return names[area_id] ?? area_id;
}

// ─── メイン: 全エリアフェッチ + D1更新 ──────────────

const FETCHERS: AreaFetcher[] = [
  fetchHokkaido,
  fetchTohoku,
  fetchTepco,
  fetchChubu,
  fetchHokuriku,
  fetchKansai,
  fetchChugoku,
  fetchShikoku,
  fetchKyushu,
  fetchOkinawa,
];

export async function fetchElectricityDemand(db: D1Database): Promise<void> {
  // 前日の日付（JST基準）
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstYesterday = new Date(now.getTime() + jstOffset - 86400000);
  const targetDate = jstYesterday.toISOString().slice(0, 10);

  console.log(`Fetching electricity demand for ${targetDate}`);

  const results = await Promise.allSettled(
    FETCHERS.map((fetcher) => fetcher(targetDate)),
  );

  let successCount = 0;

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`Fetcher rejected: ${result.reason}`);
      continue;
    }
    const { area_id, record, error } = result.value;
    if (error) {
      console.warn(`${area_id}: ${error}`);
      continue;
    }
    if (!record) continue;

    await upsertDemand(db, record);
    successCount++;
  }

  console.log(`Electricity demand: ${successCount}/${FETCHERS.length} areas updated`);
}

async function upsertDemand(db: D1Database, record: AreaDemandRecord): Promise<void> {
  await db
    .prepare(`
      INSERT INTO electricity_demand (date, area_id, peak_demand_mw, peak_supply_mw, usage_rate, solar_mw, wind_mw, thermal_mw, nuclear_mw, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date, area_id) DO UPDATE SET
        peak_demand_mw = excluded.peak_demand_mw,
        peak_supply_mw = excluded.peak_supply_mw,
        usage_rate = excluded.usage_rate,
        solar_mw = excluded.solar_mw,
        wind_mw = excluded.wind_mw,
        thermal_mw = excluded.thermal_mw,
        nuclear_mw = excluded.nuclear_mw,
        source = excluded.source,
        updated_at = datetime('now')
    `)
    .bind(
      record.date,
      record.area_id,
      record.peak_demand_mw,
      record.peak_supply_mw,
      record.usage_rate,
      record.solar_mw,
      record.wind_mw,
      record.thermal_mw,
      record.nuclear_mw,
      record.source,
    )
    .run();

  console.log(`  ${record.area_id}: ${record.peak_demand_mw}MW`);
}
