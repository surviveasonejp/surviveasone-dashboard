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
import { fetchReservesUpdate } from "./reserves-fetcher";
import { fetchLngUpdate } from "./lng-fetcher";
import { fetchAisPositions, applyAisToOverrides } from "./ais-tracker";
import { fetchOilPrice } from "./oil-price-fetcher";
import { fetchTradeUpdate } from "./trade-fetcher";
import { fetchOilProductsUpdate } from "./oil-products-fetcher";
import { fetchJpcaUpdate } from "./jpca-fetcher";
import { fetchJarwUpdate } from "./jarw-fetcher";
import { fetchHjksOutages } from "./hjks-fetcher";
import { fetchVtsArrivals, VTS_ROUTE_IDS } from "./mlit-vts-fetcher";
import { fetchNagoyaArrivals } from "./nagoya-port-fetcher";
import { fetchJogmecUpdate } from "./jogmec-fetcher";
import { fetchPortCargoUpdate } from "./port-cargo-fetcher";
import { fetchBojImportPriceUpdate } from "./boj-fetcher";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ARCHIVE: R2Bucket;
  AISSTREAM_API_KEY?: string;
  EIA_API_KEY?: string;
  ESTAT_APP_ID?: string;
}

// ─── Cron 実行ビーコン ────────────────────────────────
// 月曜枠（OWID + oil-products + HJKS）は2026-03-21以降 D1 に書き込みを残しておらず、
// 「発火していない」のか「発火したが invocation ごと落ちた」のかを外部から切り分けられなかった。
// スロット開始時と終了時に KV へ痕跡を残し、/api/cron-status で観測できるようにする。

const BEACON_PREFIX = "cron:beacon:";
const BEACON_TTL_SECONDS = 60 * 60 * 24 * 60; // 60日

export type CronSlot = "weekly-monday" | "daily-06" | "daily-18" | "monthly-18";

export const CRON_SLOTS: readonly CronSlot[] = ["weekly-monday", "daily-06", "daily-18", "monthly-18"];

export interface CronTaskResult {
  name: string;
  status: "fulfilled" | "rejected";
  durationMs: number;
  error?: string;
}

export interface CronBeacon {
  slot: CronSlot;
  /** started = 開始のみ記録された状態（この値が残っていれば invocation が完走していない） */
  phase: "started" | "finished";
  scheduledAt: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  tasks: string[];
  results?: CronTaskResult[];
}

export const beaconKey = (slot: CronSlot): string => `${BEACON_PREFIX}${slot}`;

async function writeBeacon(cache: KVNamespace, beacon: CronBeacon): Promise<void> {
  try {
    await cache.put(beaconKey(beacon.slot), JSON.stringify(beacon), {
      expirationTtl: BEACON_TTL_SECONDS,
    });
  } catch (err) {
    // ビーコン書き込み失敗でデータ取得本体を止めない
    console.warn(`Cron beacon write failed (${beacon.slot}): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** タスクを実行し、成否を必ず値として返す（reject させない） */
async function runTask(name: string, run: () => Promise<unknown>): Promise<CronTaskResult> {
  const start = Date.now();
  try {
    await run();
    return { name, status: "fulfilled", durationMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Cron task "${name}" failed: ${message}`);
    return { name, status: "rejected", durationMs: Date.now() - start, error: message.slice(0, 200) };
  }
}

const OWID_CSV_URL = "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv";

// OWID CSV → D1 単位換算係数
const TWH_TO_KL = 1 / 0.00001042; // 1 TWh = ~96,000,000 kL ... ではなく年間なので日割り
const TWH_TO_TONNE_LNG = 1 / 0.00001444; // 1 TWh ≈ 69,252 t LNG
const KL_TO_BARRELS = 1 / 0.159; // 1 kL ≈ 6.29 barrels

export async function handleScheduled(
  controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  // 毎週月曜 UTC 3:00: OWIDデータ取得 + D1更新
  // 毎日 UTC 18:00: 電力需給データ取得
  const scheduledDate = new Date(controller.scheduledTime);
  const hour = scheduledDate.getUTCHours();
  const dayOfWeek = scheduledDate.getUTCDay();
  const dayOfMonth = scheduledDate.getUTCDate();

  // タスクは ctx.waitUntil に投げず、ハンドラ内で完了まで await する。
  // waitUntil だとハンドラ return 後 約30秒で強制キャンセルされ、
  // 月曜枠（OWID 9.2MB取得 + HJKS 1,000件UPSERT）は毎回途中終了していた。
  // Cron Trigger 自体の実行時間上限は15分あるため await で問題ない。
  const tasks: Array<[name: string, run: () => Promise<unknown>]> = [];
  let slot: CronSlot | null = null;
  // 月曜枠のみ直列実行する。OWID は 9.2MB の decode/split で CPU・メモリを最も食うため、
  // ここで invocation ごと打ち切られても軽量な HJKS / 石油製品在庫は書き込み済みにする。
  let sequential = false;

  if (hour === 3 && dayOfWeek === 1) {
    slot = "weekly-monday";
    sequential = true;
    // HJKS 発電機停止情報（週次）— 大型火力・原子力の出力制約を追跡
    tasks.push(["hjks", () => fetchHjksOutages({ DB: env.DB, CACHE: env.CACHE })]);
    // 石油製品在庫（週次）
    tasks.push(["oil-products", () => fetchOilProductsUpdate({ DB: env.DB, CACHE: env.CACHE })]);
    // OWID（最重量）は最後に回す
    tasks.push(["owid", () => fetchArchiveAndUpdate(env)]);
  }

  if (hour === 18) {
    slot = "daily-18";
    tasks.push(["electricity", () => fetchElectricityDemand(env.DB)]);
    // AISタンカー位置取得 → overrides自動同期（電力需給と並行実行）
    if (env.AISSTREAM_API_KEY) {
      tasks.push(["ais", () => fetchAisPositions(env).then(() => applyAisToOverrides(env.CACHE))]);
    }
    // WTI原油価格取得（日次）
    // thunk 化でクロージャ内の再参照になるため、ナローイング済みの値をローカルに束縛する
    const eiaApiKey = env.EIA_API_KEY;
    if (eiaApiKey) {
      tasks.push(["oil-price", () => fetchOilPrice({ DB: env.DB, CACHE: env.CACHE, EIA_API_KEY: eiaApiKey })]);
    }
    // MLIT VTS 3ルート（浦賀水道/明石海峡/関門海峡）+ 名古屋港EDI
    tasks.push(["vts", () => fetchAllVtsArrivalsSafe(env)]);
    tasks.push(["nagoya", () => fetchNagoyaArrivalsSafe(env)]);
  }

  // 毎日 UTC 6:00 (JST 15:00): AIS 2回目取得 → overrides自動同期（月18日は備蓄更新と相乗り）
  if (hour === 6 && dayOfMonth !== 18) {
    slot = "daily-06";
    if (env.AISSTREAM_API_KEY) {
      tasks.push(["ais", () => fetchAisPositions(env).then(() => applyAisToOverrides(env.CACHE))]);
    }
    // MLIT VTS 3ルート（2回目）— AIS と並行して実行
    tasks.push(["vts", () => fetchAllVtsArrivalsSafe(env)]);
  }

  // 毎月18日 UTC 6:00 (JST 15:00): 石油備蓄 + LNG在庫 + 貿易統計 + JPCA + JARW + JOGMEC放出 + 日銀輸入物価 自動更新
  if (hour === 6 && dayOfMonth === 18) {
    slot = "monthly-18";
    tasks.push(["reserves", () => fetchReservesUpdate(env)]);
    tasks.push(["lng", () => fetchLngUpdate(env)]);
    tasks.push(["trade", () => fetchTradeUpdate({ DB: env.DB, CACHE: env.CACHE, ESTAT_APP_ID: env.ESTAT_APP_ID })]);
    tasks.push(["jpca", () => fetchJpcaUpdate({ DB: env.DB, CACHE: env.CACHE })]);
    tasks.push(["jarw", () => fetchJarwUpdate({ DB: env.DB, CACHE: env.CACHE })]);
    // Phase 25-A: 基地別放出イベント seed + 新規リリース探索
    tasks.push(["jogmec", () => fetchJogmecUpdate(env)]);
    // Phase 25-B: 港湾原油・石油製品 月次海上出入貨物（10基地最寄港）
    tasks.push(["port-cargo", () => fetchPortCargoUpdate({ DB: env.DB, CACHE: env.CACHE, ESTAT_APP_ID: env.ESTAT_APP_ID })]);
    // 日銀 輸入物価指数（円ベース・契約通貨ベース）月次取得
    tasks.push(["boj", () => fetchBojImportPriceUpdate({ DB: env.DB, CACHE: env.CACHE })]);
  }

  if (!slot || tasks.length === 0) return;

  const startedAt = new Date();
  const beacon: CronBeacon = {
    slot,
    phase: "started",
    scheduledAt: scheduledDate.toISOString(),
    startedAt: startedAt.toISOString(),
    tasks: tasks.map(([name]) => name),
  };
  // 開始時点で先に書く。これが "started" のまま残っていれば invocation が完走していない証跡になる
  await writeBeacon(env.CACHE, beacon);

  const results: CronTaskResult[] = [];
  if (sequential) {
    for (const [name, run] of tasks) {
      results.push(await runTask(name, run));
    }
  } else {
    results.push(...(await Promise.all(tasks.map(([name, run]) => runTask(name, run)))));
  }

  const finishedAt = new Date();
  await writeBeacon(env.CACHE, {
    ...beacon,
    phase: "finished",
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    results,
  });
}

/**
 * MLIT VTS 全ルートの取得を安全に実行（失敗してもCron全体を止めない）
 * uraga / akashi / kanmon の3ルート・取得結果をログ出力
 */
async function fetchAllVtsArrivalsSafe(env: Env): Promise<void> {
  for (const routeId of VTS_ROUTE_IDS) {
    try {
      const result = await fetchVtsArrivals({ CACHE: env.CACHE }, routeId);
      console.log(
        `VTS ${routeId}: ${result.tankerArrivals.length} tanker(s) scheduled` +
        ` (total ${result.totalArrivals} vessels)`,
      );
    } catch (err) {
      console.warn(
        `VTS ${routeId} fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * 名古屋港 入港予定の取得を安全に実行
 */
async function fetchNagoyaArrivalsSafe(env: Env): Promise<void> {
  try {
    const result = await fetchNagoyaArrivals({ CACHE: env.CACHE });
    console.log(
      `Nagoya port update: ${result.tankerArrivals.length} tanker(s) scheduled` +
      ` (total ${result.totalArrivals} vessels)`,
    );
  } catch (err) {
    console.warn(
      `Nagoya port fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    );
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
  const headerLine = lines[0];
  if (!headerLine) return null;
  const headers = parseCSVLine(headerLine);
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
    if (!line || !line.startsWith("Japan,")) continue;

    const cols = parseCSVLine(line);
    const col = (idx: number): string => cols[idx] ?? "";
    const year = parseInt(col(iYear), 10);
    if (isNaN(year)) continue;

    const record: OwidJapanRecord = {
      year,
      oil_consumption: parseFloat(col(iOilConsumption)) || 0,
      gas_consumption: parseFloat(col(iGasConsumption)) || 0,
      coal_electricity: parseFloat(col(iCoalElectricity)) || 0,
      gas_electricity: parseFloat(col(iGasElectricity)) || 0,
      oil_electricity: parseFloat(col(iOilElectricity)) || 0,
      nuclear_electricity: parseFloat(col(iNuclearElectricity)) || 0,
      renewables_electricity: parseFloat(col(iRenewablesElectricity)) || 0,
      electricity_generation: parseFloat(col(iElectricityGeneration)) || 0,
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

/** consumption テーブルをUPSERT（バリデーション付き） */
async function upsertConsumption(db: D1Database, data: OwidJapanRecord): Promise<void> {
  const date = `${data.year}-12-31`;
  const oilAnnualTWh = data.oil_consumption;
  const oilDailyKL = Math.round(oilAnnualTWh / 365 * TWH_TO_KL);
  const oilDailyBarrels = Math.round(oilDailyKL * KL_TO_BARRELS);
  const lngAnnualT = Math.round(data.gas_consumption * TWH_TO_TONNE_LNG);
  const lngDailyT = Math.round(lngAnnualT / 365);

  // バリデーション: 絶対範囲チェック
  if (oilDailyKL < 200000 || oilDailyKL > 800000) {
    console.error(`Consumption validation failed: oilDailyKL=${oilDailyKL} outside 200K-800K range`);
    return;
  }
  if (lngDailyT < 50000 || lngDailyT > 400000) {
    console.error(`Consumption validation failed: lngDailyT=${lngDailyT} outside 50K-400K range`);
    return;
  }

  // バリデーション: 前回値との乖離チェック（±30%）
  const prev = await db
    .prepare("SELECT oil_daily_kL, lng_daily_t FROM consumption ORDER BY date DESC LIMIT 1")
    .first<{ oil_daily_kL: number; lng_daily_t: number }>();
  if (prev) {
    const oilChange = Math.abs(oilDailyKL - prev.oil_daily_kL) / prev.oil_daily_kL;
    const lngChange = Math.abs(lngDailyT - prev.lng_daily_t) / prev.lng_daily_t;
    if (oilChange > 0.3) {
      console.error(`Consumption validation failed: oil change ${(oilChange * 100).toFixed(1)}% exceeds 30% (prev=${prev.oil_daily_kL}, new=${oilDailyKL})`);
      return;
    }
    if (lngChange > 0.3) {
      console.error(`Consumption validation failed: LNG change ${(lngChange * 100).toFixed(1)}% exceeds 30% (prev=${prev.lng_daily_t}, new=${lngDailyT})`);
      return;
    }
  }

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
