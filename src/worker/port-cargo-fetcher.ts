/**
 * 港湾調査月報 海上出入貨物 自動取得（Phase 25-B）
 *
 * e-Stat 港湾調査月報 第3表（statsDataId=0003130476）から
 * 国家備蓄10基地最寄港の原油・石油製品の月次荷揚げ量を取得する。
 *
 * 用途: 基地別残存量（jogmec-fetcher）と並列表示する「補充フロー」代理指標。
 *      実観測の連続在庫データは存在しないため、港湾の出入貨物トン数で
 *      地域別の補充ペースを月次可視化する。
 *
 * Cron: 毎月18日 UTC 6:00（既存月次枠相乗り）
 * 公表ラグ: 約3〜4ヶ月（港湾調査の特性）
 */

import { fetchEStatData, normalizeValues } from "./estat-client";
import { invalidateCache, CACHE_KEYS } from "./kv-cache";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  ESTAT_APP_ID?: string;
}

const ESTAT_PORT_CARGO_ID = "0003130476";

// 品種コード（港湾調査規則別表）
const COMMODITY_CRUDE = "030";          // 原油
const COMMODITY_FUEL_OIL = "041";       // 重油
const COMMODITY_GASOLINE = "042";       // 揮発油
const COMMODITY_OTHER_PETROLEUM = "043"; // その他石油製品
const COMMODITIES_PRODUCTS = [COMMODITY_FUEL_OIL, COMMODITY_GASOLINE, COMMODITY_OTHER_PETROLEUM];

/**
 * 国家備蓄10基地の最寄港マスタ。
 * estat_code は港湾コード5桁（国土交通省告示）。
 */
export const PORT_REGISTRY = [
  { id: "tomakomai",  name: "苫小牧",  estat_code: "01206", nearest_bases: ["tomakomai_higashibu"] },
  { id: "hachinohe",  name: "八戸",    estat_code: "02201", nearest_bases: ["mutsu_ogawara"] },
  { id: "kuji",       name: "久慈",    estat_code: "03207", nearest_bases: ["kuji"] },
  { id: "akita",      name: "秋田",    estat_code: "05202", nearest_bases: ["akita"] },
  { id: "fukui",      name: "福井",    estat_code: "18201", nearest_bases: ["fukui"] },
  { id: "matsuyama",  name: "松山",    estat_code: "38201", nearest_bases: ["kikuma"] },
  { id: "kitakyushu", name: "北九州",  estat_code: "40100", nearest_bases: ["shirashima"] },
  { id: "sasebo",     name: "佐世保",  estat_code: "42202", nearest_bases: ["kamigoto"] },
  { id: "kagoshima",  name: "鹿児島",  estat_code: "46201", nearest_bases: ["kushikino", "shibushi"] },
] as const;

interface PortMonthData {
  port_id: string;
  port_name: string;
  month: string;          // YYYY-MM
  crude_t: number | null;
  products_t: number | null;
}

// ─── エントリポイント ────────────────────────────────

export async function fetchPortCargoUpdate(env: Env): Promise<void> {
  if (!env.ESTAT_APP_ID) {
    console.warn("Port cargo update: ESTAT_APP_ID not set, skipping");
    return;
  }

  console.log("Port cargo update: starting");

  let totalUpserted = 0;
  for (const port of PORT_REGISTRY) {
    try {
      const records = await fetchPortMonthly(env.ESTAT_APP_ID, port.estat_code, port.id, port.name);
      if (records.length === 0) {
        console.warn(`Port cargo: no data for ${port.name} (${port.estat_code})`);
        continue;
      }

      const valid = validateRecords(records);
      const upserted = await upsertPortRecords(env.DB, valid);
      totalUpserted += upserted;
      console.log(`Port cargo: ${port.name} upserted ${upserted}/${records.length} months`);
    } catch (err) {
      console.warn(
        `Port cargo: ${port.name} fetch failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await invalidateCache(env.CACHE, [CACHE_KEYS.OIL_RESERVE_BASES]);
  await env.CACHE.put("port_cargo_last_updated", new Date().toISOString(), {
    expirationTtl: 86400 * 60,
  });
  console.log(`Port cargo update: done (total ${totalUpserted} rows upserted)`);
}

// ─── e-Stat 取得 ──────────────────────────────────────

/**
 * 1港について crude / products を取得し、月次レコード配列を返す。
 * 公表ラグ3〜4ヶ月のため直近12ヶ月を範囲とする。
 */
async function fetchPortMonthly(
  appId: string,
  estatCode: string,
  portId: string,
  portName: string,
): Promise<PortMonthData[]> {
  // 原油（030）
  const crudeMap = await fetchCommodityVolumeByMonth(appId, estatCode, COMMODITY_CRUDE);
  // 石油製品（041+042+043 を合算）
  const productsMap = new Map<string, number>();
  for (const code of COMMODITIES_PRODUCTS) {
    const partial = await fetchCommodityVolumeByMonth(appId, estatCode, code);
    for (const [month, t] of partial) {
      productsMap.set(month, (productsMap.get(month) ?? 0) + t);
    }
  }

  // 月キーをマージして PortMonthData[] 化
  const allMonths = new Set([...crudeMap.keys(), ...productsMap.keys()]);
  const records: PortMonthData[] = [];
  for (const month of allMonths) {
    records.push({
      port_id: portId,
      port_name: portName,
      month,
      crude_t: crudeMap.get(month) ?? null,
      products_t: productsMap.get(month) ?? null,
    });
  }

  // 直近12ヶ月のみ残す
  records.sort((a, b) => b.month.localeCompare(a.month));
  return records.slice(0, 12);
}

/**
 * 1港 × 1品目について、e-Stat レスポンスから月次データを取り出す。
 * cdTime のフォーマット差異を避けるため時間フィルタは付けず、
 * レスポンス側の @time をパースして YYYY-MM に変換する。
 */
async function fetchCommodityVolumeByMonth(
  appId: string,
  estatCode: string,
  commodityCode: string,
): Promise<Map<string, number>> {
  const data = await fetchEStatData(appId, {
    statsDataId: ESTAT_PORT_CARGO_ID,
    cdArea: estatCode,
    cdCat02: commodityCode,
    limit: 500,
  });
  const map = new Map<string, number>();
  if (!data) return map;

  const values = normalizeValues(data);
  for (const v of values) {
    if (!v.$ || v.$ === "-") continue;
    const t = parseFloat(v.$.replace(/,/g, ""));
    if (isNaN(t) || t < 0) continue;

    const month = parseEstatTimeToYearMonth(v["@time"]);
    if (!month) continue;
    map.set(month, t);
  }
  return map;
}

/**
 * e-Stat 港湾調査の時間コードを YYYY-MM に変換する。
 * 既知フォーマット: "YYYY01MM00" / "YYYY00MMNN" / "YYYY-MM" 等揺れがあるため
 * 文字列から年月をパターンマッチで抽出する保守的な実装。
 */
function parseEstatTimeToYearMonth(cdTime: string | undefined): string | null {
  if (!cdTime) return null;

  // パターン1: "2026010100" (year + 01 + month + 00)
  let m = cdTime.match(/^(\d{4})01(\d{2})00$/);
  if (m && m[1] && m[2]) return `${m[1]}-${m[2]}`;

  // パターン2: "2026000101" (year + 00 + 01 + month)
  m = cdTime.match(/^(\d{4})0001(\d{2})$/);
  if (m && m[1] && m[2]) return `${m[1]}-${m[2]}`;

  // パターン3: "2026-01" 直接
  m = cdTime.match(/^(\d{4})-(\d{2})$/);
  if (m && m[1] && m[2]) return `${m[1]}-${m[2]}`;

  // パターン4: "2026/01" や "202601"
  m = cdTime.match(/^(\d{4})[/\-]?(\d{2})$/);
  if (m && m[1] && m[2]) {
    const month = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) return `${m[1]}-${m[2]}`;
  }

  return null;
}

// ─── バリデーション ──────────────────────────────────

function validateRecords(records: PortMonthData[]): PortMonthData[] {
  return records.filter((r) => {
    // 絶対範囲: 港湾原油荷揚げは月数千〜数百万トン。0〜2000万tに制限
    const ABSOLUTE_MAX_T = 20_000_000;
    if (r.crude_t !== null && (r.crude_t < 0 || r.crude_t > ABSOLUTE_MAX_T)) {
      console.warn(`Port cargo validation: ${r.port_id} ${r.month} crude=${r.crude_t}t out of range`);
      return false;
    }
    if (r.products_t !== null && (r.products_t < 0 || r.products_t > ABSOLUTE_MAX_T)) {
      console.warn(`Port cargo validation: ${r.port_id} ${r.month} products=${r.products_t}t out of range`);
      return false;
    }
    return true;
  });
}

// ─── D1 UPSERT ───────────────────────────────────────

async function upsertPortRecords(
  db: D1Database,
  records: PortMonthData[],
): Promise<number> {
  let count = 0;
  for (const r of records) {
    await db
      .prepare(`
        INSERT INTO port_oil_throughput
          (port_id, port_name, month, crude_t, products_t, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(port_id, month) DO UPDATE SET
          crude_t    = excluded.crude_t,
          products_t = excluded.products_t,
          source     = excluded.source,
          updated_at = datetime('now')
      `)
      .bind(
        r.port_id,
        r.port_name,
        r.month,
        r.crude_t,
        r.products_t,
        "e-Stat 港湾調査月報 第3表 (statsDataId=0003130476)",
      )
      .run();
    count++;
  }
  return count;
}
