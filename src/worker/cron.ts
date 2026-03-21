/**
 * Cron Trigger ハンドラー
 *
 * 毎週月曜 UTC 3:00 (JST 12:00) に実行
 * 1. OWID energy-data CSVをGitHubからfetch → R2にアーカイブ
 * 2. CSVから日本データを抽出 → D1のconsumption/reservesを更新
 * 3. KVキャッシュを無効化
 */

import { invalidateCache, CACHE_KEYS } from "./kv-cache";
import { fetchElectricityDemand } from "./electricity";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
}

const OWID_CSV_URL = "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv";

// OWID CSV → D1 単位換算係数
const TWH_TO_KL = 1 / 0.00001042; // 1 TWh = ~96,000,000 kL ... ではなく年間なので日割り
const TWH_TO_TONNE_LNG = 1 / 0.00001444; // 1 TWh ≈ 69,252 t LNG
const KL_TO_BARRELS = 1 / 0.159; // 1 kL ≈ 6.29 barrels

export async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  // 毎週月曜 UTC 3:00: OWIDデータ取得 + D1更新
  // 毎日 UTC 18:00: 電力需給データ取得
  const hour = new Date(event.scheduledTime).getUTCHours();
  const dayOfWeek = new Date(event.scheduledTime).getUTCDay();

  if (hour === 3 && dayOfWeek === 1) {
    ctx.waitUntil(fetchArchiveAndUpdate(env));
  }

  if (hour === 18) {
    ctx.waitUntil(fetchElectricityDemand(env.DB));
  }
}

async function fetchArchiveAndUpdate(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const archiveKey = `owid/energy-data-${today}.csv`;

  // R2に既に存在する場合はアーカイブスキップ（パイプラインは実行）
  const existing = await env.ARCHIVE.head(archiveKey);
  let csvText: string;

  if (existing) {
    console.log(`OWID CSV already archived: ${archiveKey}, running pipeline only`);
    const obj = await env.ARCHIVE.get("owid/energy-data-latest.csv");
    if (!obj) {
      console.error("Latest CSV not found in R2");
      return;
    }
    csvText = await obj.text();
  } else {
    // GitHubからCSVをfetch
    const response = await fetch(OWID_CSV_URL);
    if (!response.ok) {
      console.error(`Failed to fetch OWID CSV: ${response.status}`);
      return;
    }

    const csvBody = await response.arrayBuffer();
    csvText = new TextDecoder().decode(csvBody);

    // R2にアーカイブ
    await env.ARCHIVE.put(archiveKey, csvBody, {
      httpMetadata: { contentType: "text/csv" },
      customMetadata: {
        source: "owid/energy-data",
        fetchedAt: new Date().toISOString(),
      },
    });

    await env.ARCHIVE.put("owid/energy-data-latest.csv", csvBody, {
      httpMetadata: { contentType: "text/csv" },
      customMetadata: {
        source: "owid/energy-data",
        fetchedAt: new Date().toISOString(),
        originalKey: archiveKey,
      },
    });

    console.log(`OWID CSV archived: ${archiveKey} (${csvBody.byteLength} bytes)`);
  }

  // CSVから日本データを抽出してD1に投入
  await updateD1FromOwid(env.DB, csvText);

  // KVキャッシュを無効化して最新データを反映
  await invalidateCache(env.CACHE, [
    CACHE_KEYS.RESERVES_LATEST,
    CACHE_KEYS.RESERVES_HISTORY,
    CACHE_KEYS.CONSUMPTION_LATEST,
  ]);
  console.log("KV cache invalidated");
}

// ─── CSVパース + D1更新 ──────────────────────────────

/** CSVから日本の最新年データを抽出し、D1を更新 */
async function updateD1FromOwid(db: D1Database, csvText: string): Promise<void> {
  const japanData = extractJapanLatest(csvText);
  if (!japanData) {
    console.error("Japan data not found in OWID CSV");
    return;
  }

  console.log(`OWID Japan data: year=${japanData.year}`);

  // consumption テーブル更新
  await upsertConsumption(db, japanData);

  // reserves テーブルの電力シェアのみ更新（備蓄量はOWIDに含まれない）
  await updatePowerShares(db, japanData);

  console.log("D1 updated from OWID data");
}

interface OwidJapanRecord {
  year: number;
  oil_consumption: number; // TWh
  gas_consumption: number; // TWh
  coal_electricity: number; // TWh
  gas_electricity: number; // TWh
  oil_electricity: number; // TWh
  nuclear_electricity: number; // TWh
  renewables_electricity: number; // TWh
  electricity_generation: number; // TWh
}

/** CSVテキストから日本の最新年データを抽出（ヘッダー解析 + Japan行フィルタ） */
function extractJapanLatest(csvText: string): OwidJapanRecord | null {
  const lines = csvText.split("\n");
  if (lines.length < 2) return null;

  // ヘッダー解析
  const headers = parseCSVLine(lines[0]);
  const colIndex = (name: string): number => headers.indexOf(name);

  const iCountry = colIndex("country");
  const iYear = colIndex("year");
  const iOilConsumption = colIndex("oil_consumption");
  const iGasConsumption = colIndex("gas_consumption");
  const iCoalElectricity = colIndex("coal_electricity");
  const iGasElectricity = colIndex("gas_electricity");
  const iOilElectricity = colIndex("oil_electricity");
  const iNuclearElectricity = colIndex("nuclear_electricity");
  const iRenewablesElectricity = colIndex("renewables_electricity");
  const iElectricityGeneration = colIndex("electricity_generation");

  if (iCountry < 0 || iYear < 0) {
    console.error("Required columns not found in OWID CSV");
    return null;
  }

  // Japan行のうち最新年を取得
  let latest: OwidJapanRecord | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // 高速フィルタ: Japan で始まる行のみパース
    if (!line.startsWith("Japan,")) continue;

    const cols = parseCSVLine(line);
    const year = parseInt(cols[iYear], 10);
    if (isNaN(year)) continue;

    const record: OwidJapanRecord = {
      year,
      oil_consumption: parseFloat(cols[iOilConsumption]) || 0,
      gas_consumption: parseFloat(cols[iGasConsumption]) || 0,
      coal_electricity: parseFloat(cols[iCoalElectricity]) || 0,
      gas_electricity: parseFloat(cols[iGasElectricity]) || 0,
      oil_electricity: parseFloat(cols[iOilElectricity]) || 0,
      nuclear_electricity: parseFloat(cols[iNuclearElectricity]) || 0,
      renewables_electricity: parseFloat(cols[iRenewablesElectricity]) || 0,
      electricity_generation: parseFloat(cols[iElectricityGeneration]) || 0,
    };

    // 主要カラムが0でない最新年を採用
    if (record.oil_consumption > 0 && record.electricity_generation > 0) {
      if (!latest || record.year > latest.year) {
        latest = record;
      }
    }
  }

  return latest;
}

/** CSV行をパース（引用符対応） */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** consumption テーブルをUPSERT */
async function upsertConsumption(db: D1Database, data: OwidJapanRecord): Promise<void> {
  const date = `${data.year}-12-31`;
  const oilAnnualTWh = data.oil_consumption;
  const oilDailyKL = Math.round(oilAnnualTWh / 365 * TWH_TO_KL);
  const oilDailyBarrels = Math.round(oilDailyKL * KL_TO_BARRELS);
  const lngAnnualT = Math.round(data.gas_consumption * TWH_TO_TONNE_LNG);
  const lngDailyT = Math.round(lngAnnualT / 365);

  await db
    .prepare(`
      INSERT INTO consumption (date, oil_annual_TWh, oil_daily_kL, oil_daily_barrels, lng_annual_t, lng_daily_t, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        oil_annual_TWh = excluded.oil_annual_TWh,
        oil_daily_kL = excluded.oil_daily_kL,
        oil_daily_barrels = excluded.oil_daily_barrels,
        lng_annual_t = excluded.lng_annual_t,
        lng_daily_t = excluded.lng_daily_t,
        source = excluded.source,
        updated_at = datetime('now')
    `)
    .bind(date, oilAnnualTWh, oilDailyKL, oilDailyBarrels, lngAnnualT, lngDailyT, `OWID energy-data ${data.year}`)
    .run();

  console.log(`consumption upserted: ${date} (oil=${oilAnnualTWh}TWh, lng=${lngAnnualT}t)`);
}

/** reserves テーブルの電力シェアのみ更新（最新行） */
async function updatePowerShares(db: D1Database, data: OwidJapanRecord): Promise<void> {
  if (data.electricity_generation <= 0) return;

  const thermalShare =
    (data.coal_electricity + data.gas_electricity + data.oil_electricity) /
    data.electricity_generation;
  const nuclearShare = data.nuclear_electricity / data.electricity_generation;
  const renewableShare = data.renewables_electricity / data.electricity_generation;

  // 最新のreserves行の電力シェアを更新
  const result = await db
    .prepare("SELECT date FROM reserves ORDER BY date DESC LIMIT 1")
    .first<{ date: string }>();

  if (!result) {
    console.log("No reserves row to update power shares");
    return;
  }

  await db
    .prepare(`
      UPDATE reserves
      SET thermal_share = ?, nuclear_share = ?, renewable_share = ?, updated_at = datetime('now')
      WHERE date = ?
    `)
    .bind(
      Math.round(thermalShare * 1000) / 1000,
      Math.round(nuclearShare * 1000) / 1000,
      Math.round(renewableShare * 1000) / 1000,
      result.date,
    )
    .run();

  console.log(`reserves power shares updated: thermal=${(thermalShare * 100).toFixed(1)}%, nuclear=${(nuclearShare * 100).toFixed(1)}%, renewable=${(renewableShare * 100).toFixed(1)}%`);
}
