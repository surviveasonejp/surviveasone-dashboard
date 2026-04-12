/**
 * HJKS（発電情報公開システム）フェッチャー
 *
 * 日本卸電力取引所（JEPX）が公開する発電機出力制約等情報を週次取得。
 * 認可出力100万kW以上のユニットの計画外停止・計画停止情報を対象。
 *
 * 取得フロー:
 *   1. GET /hjks/outages → JSESSIONID cookie + _csrf トークンを取得
 *   2. POST /hjks/outages_ajax → w2grid JSON レスポンスをパース
 *   3. バリデーション後に D1 power_outages テーブルへ UPSERT
 *
 * 出典: https://hjks.jepx.or.jp/hjks/
 */

const HJKS_BASE = "https://hjks.jepx.or.jp";
const HJKS_OUTAGES_PAGE = `${HJKS_BASE}/hjks/outages`;
const HJKS_OUTAGES_AJAX = `${HJKS_BASE}/hjks/outages_ajax`;

/** w2grid の標準レスポンス形式 */
interface W2GridResponse {
  status: string;
  total: number;
  records: W2GridRecord[];
}

/** HJKS 停止情報レコード（w2grid フィールド名は実測で確認） */
interface W2GridRecord {
  recid: number;
  [key: string]: unknown;
}

/** DB に格納する停止情報レコード */
export interface PowerOutageRecord {
  id: string;
  area: string;
  operator: string;
  plant_code: string;
  plant_name: string;
  fuel_type: string;
  unit_name: string;
  capacity_kw: number | null;
  outage_type: string | null;
  category: string | null;
  reduction_kw: number | null;
  outage_at: string | null;
  recovery_forecast: string | null;
  recovery_planned_at: string | null;
  cause: string | null;
  source_updated_at: string | null;
  fetched_at: string;
}

interface HjksFetchEnv {
  DB: D1Database;
  CACHE: KVNamespace;
}

// ─── セッション取得 ────────────────────────────────────

interface HjksSession {
  jsessionId: string;
  csrfToken: string;
}

/**
 * HJKSページにアクセスし JSESSIONID と _csrf トークンを取得する。
 */
async function fetchSession(): Promise<HjksSession | null> {
  const res = await fetch(HJKS_OUTAGES_PAGE, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SAO-DataBot/1.0; +https://surviveasonejp.org)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ja,en;q=0.9",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    console.error(`HJKS session fetch failed: HTTP ${res.status}`);
    return null;
  }

  // Set-Cookie から JSESSIONID を抽出
  const setCookie = res.headers.get("set-cookie") ?? "";
  const sessionMatch = setCookie.match(/JSESSIONID=([^;]+)/);
  const jsessionId = sessionMatch?.[1];
  if (!jsessionId) {
    console.error("HJKS: JSESSIONID not found in Set-Cookie");
    return null;
  }

  // HTML から _csrf トークンを抽出
  // 形式: _csrf: '242b4660-7f70-4c7b-b46a-667b0c24713b'
  const html = await res.text();
  const csrfMatch = html.match(/_csrf\s*:\s*['"]([0-9a-f-]{36})['"]/i);
  const csrfToken = csrfMatch?.[1];
  if (!csrfToken) {
    console.error("HJKS: _csrf token not found in HTML");
    return null;
  }

  return { jsessionId, csrfToken };
}

// ─── AJAX データ取得 ────────────────────────────────────

/**
 * outages_ajax エンドポイントから全停止情報を取得する。
 * limit=1000 で一括取得（通常は数十〜数百件）。
 */
async function fetchOutagesAjax(session: HjksSession): Promise<W2GridRecord[]> {
  const body = JSON.stringify({
    _csrf: session.csrfToken,
    limit: 1000,
    offset: 0,
  });

  const res = await fetch(HJKS_OUTAGES_AJAX, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `JSESSIONID=${session.jsessionId}`,
      "User-Agent": "Mozilla/5.0 (compatible; SAO-DataBot/1.0; +https://surviveasonejp.org)",
      "X-Requested-With": "XMLHttpRequest",
      Referer: HJKS_OUTAGES_PAGE,
    },
    body,
  });

  if (!res.ok) {
    console.error(`HJKS AJAX failed: HTTP ${res.status}`);
    return [];
  }

  const json = await res.json() as W2GridResponse;
  if (json.status !== "success" || !Array.isArray(json.records)) {
    console.error(`HJKS AJAX unexpected response: status=${json.status}, total=${json.total}`);
    return [];
  }

  console.log(`HJKS: fetched ${json.records.length} records (total=${json.total})`);
  return json.records;
}

// ─── レコードパース ─────────────────────────────────────

/**
 * w2grid のフィールド名は実装時のログ確認が必要なため、
 * 複数の候補キーを試みるフォールバック方式で取得する。
 */
function getString(record: W2GridRecord, ...keys: string[]): string {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return "";
}

function getNumber(record: W2GridRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
      const n = parseInt(val.replace(/,/g, ""), 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/**
 * w2grid レコードを PowerOutageRecord に変換する。
 * フィールド名が判明していない段階では候補名を複数指定し、
 * ログ出力でキーを確認する。
 */
function parseRecord(record: W2GridRecord, fetchedAt: string): PowerOutageRecord | null {
  // 初回実行時のフィールド名確認用ログ（最初の1件のみ）
  if (record.recid === 1) {
    console.log("HJKS record fields:", JSON.stringify(Object.keys(record)));
  }

  const area = getString(record, "area", "エリア", "area_name", "areaName");
  const operator = getString(record, "operator", "事業者", "company", "operatorName");
  const plantCode = getString(record, "plant_code", "発電所コード", "plantCode", "code");
  const plantName = getString(record, "plant_name", "発電所名", "plantName", "name");
  const fuelType = getString(record, "fuel_type", "発電形式", "fuelType", "type");
  const unitName = getString(record, "unit_name", "ユニット名", "unitName", "unit");

  // 最低限 エリア + 発電所名 が取れなければスキップ
  if (!area || !plantName) {
    return null;
  }

  // ID: 発電所コード + ユニット名 + 停止日時 でユニーク
  const outageAt = getString(record, "outage_at", "停止日時", "outageAt", "outage_date", "stop_at");
  const idSource = `${plantCode || plantName}_${unitName}_${outageAt}`;
  const id = idSource.replace(/[^a-zA-Z0-9\u3000-\u9fff\u0021-\u007e]/g, "_").slice(0, 100);

  return {
    id,
    area,
    operator,
    plant_code: plantCode,
    plant_name: plantName,
    fuel_type: fuelType,
    unit_name: unitName,
    capacity_kw: getNumber(record, "capacity_kw", "認可出力", "capacity", "capacityKw"),
    outage_type: getString(record, "outage_type", "停止区分", "outageType") || null,
    category: getString(record, "category", "種別", "kind") || null,
    reduction_kw: getNumber(record, "reduction_kw", "出力低下量", "reductionKw", "reduction"),
    outage_at: outageAt || null,
    recovery_forecast: getString(record, "recovery_forecast", "復旧見通し", "recoveryForecast") || null,
    recovery_planned_at: getString(record, "recovery_planned_at", "復旧予定日", "recoveryPlannedAt") || null,
    cause: getString(record, "cause", "停止原因", "reason") || null,
    source_updated_at: getString(record, "source_updated_at", "最終更新日時", "updatedAt") || null,
    fetched_at: fetchedAt,
  };
}

// ─── D1 UPSERT ─────────────────────────────────────────

async function upsertOutage(db: D1Database, record: PowerOutageRecord): Promise<void> {
  await db
    .prepare(`
      INSERT INTO power_outages (
        id, area, operator, plant_code, plant_name, fuel_type, unit_name,
        capacity_kw, outage_type, category, reduction_kw,
        outage_at, recovery_forecast, recovery_planned_at, cause,
        source_updated_at, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        area = excluded.area,
        operator = excluded.operator,
        plant_name = excluded.plant_name,
        fuel_type = excluded.fuel_type,
        unit_name = excluded.unit_name,
        capacity_kw = excluded.capacity_kw,
        outage_type = excluded.outage_type,
        category = excluded.category,
        reduction_kw = excluded.reduction_kw,
        outage_at = excluded.outage_at,
        recovery_forecast = excluded.recovery_forecast,
        recovery_planned_at = excluded.recovery_planned_at,
        cause = excluded.cause,
        source_updated_at = excluded.source_updated_at,
        fetched_at = excluded.fetched_at
    `)
    .bind(
      record.id,
      record.area,
      record.operator,
      record.plant_code,
      record.plant_name,
      record.fuel_type,
      record.unit_name,
      record.capacity_kw,
      record.outage_type,
      record.category,
      record.reduction_kw,
      record.outage_at,
      record.recovery_forecast,
      record.recovery_planned_at,
      record.cause,
      record.source_updated_at,
      record.fetched_at,
    )
    .run();
}

// ─── バリデーション ────────────────────────────────────

/** 前回取得件数との比較で異常な増減を検知（±80%超で警告） */
async function validateRecordCount(db: D1Database, newCount: number): Promise<boolean> {
  const prev = await db
    .prepare(`
      SELECT COUNT(*) as cnt FROM power_outages
      WHERE fetched_at = (SELECT MAX(fetched_at) FROM power_outages)
    `)
    .first<{ cnt: number }>();

  if (!prev || prev.cnt === 0) {
    console.log(`HJKS: first fetch, ${newCount} records`);
    return true;
  }

  const changeRate = Math.abs(newCount - prev.cnt) / prev.cnt;
  if (changeRate > 0.8 && newCount > 50) {
    console.warn(`HJKS: record count change ${prev.cnt} → ${newCount} (${(changeRate * 100).toFixed(0)}%) exceeds 80%`);
    // 警告のみ、取り込みは続行
  }
  return true;
}

// ─── メインエクスポート ─────────────────────────────────

export async function fetchHjksOutages(env: HjksFetchEnv): Promise<void> {
  console.log("HJKS: starting power outages fetch");

  // セッション取得
  const session = await fetchSession();
  if (!session) {
    console.error("HJKS: session acquisition failed, skipping");
    return;
  }

  // AJAX でデータ取得
  const rawRecords = await fetchOutagesAjax(session);
  if (rawRecords.length === 0) {
    console.warn("HJKS: no records returned");
    return;
  }

  const fetchedAt = new Date().toISOString();

  // パース
  const parsed: PowerOutageRecord[] = [];
  for (const raw of rawRecords) {
    const record = parseRecord(raw, fetchedAt);
    if (record) parsed.push(record);
  }

  console.log(`HJKS: parsed ${parsed.length}/${rawRecords.length} records`);

  // バリデーション
  await validateRecordCount(env.DB, parsed.length);

  // D1 UPSERT
  let upsertCount = 0;
  for (const record of parsed) {
    try {
      await upsertOutage(env.DB, record);
      upsertCount++;
    } catch (e) {
      console.error(`HJKS: upsert failed for ${record.plant_name}: ${e}`);
    }
  }

  // KVにサマリをキャッシュ（APIレスポンス高速化）
  const summary = {
    total: parsed.length,
    lngCount: parsed.filter((r) => r.fuel_type.includes("LNG") || r.fuel_type.includes("ガス")).length,
    nuclearCount: parsed.filter((r) => r.fuel_type.includes("原子") || r.fuel_type.includes("核")).length,
    totalReductionKw: parsed.reduce((sum, r) => sum + (r.reduction_kw ?? 0), 0),
    fetchedAt,
  };
  await env.CACHE.put("hjks:summary", JSON.stringify(summary), { expirationTtl: 86400 * 8 });

  console.log(`HJKS: ${upsertCount} records upserted. LNG停止: ${summary.lngCount}件, 原子力: ${summary.nuclearCount}件, 制約合計: ${summary.totalReductionKw.toLocaleString()}kW`);
}
