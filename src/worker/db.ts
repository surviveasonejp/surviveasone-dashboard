/**
 * D1クエリヘルパー
 * 全D1操作はプリペアドステートメント経由で実行（SQLインジェクション防止）
 */

export interface ReservesRow {
  date: string;
  oil_national_kL: number;
  oil_private_kL: number;
  oil_joint_kL: number;
  oil_total_kL: number;
  oil_total_days: number;
  oil_hormuz_rate: number;
  lng_inventory_t: number;
  lng_hormuz_rate: number;
  thermal_share: number;
  nuclear_share: number;
  renewable_share: number;
  source: string;
  updated_at: string;
}

export interface ConsumptionRow {
  date: string;
  oil_annual_TWh: number;
  oil_daily_kL: number;
  oil_daily_barrels: number;
  lng_annual_t: number;
  lng_daily_t: number;
  source: string;
  updated_at: string;
}

export interface RegionRow {
  id: string;
  name: string;
  population: number;
  power_demand_share: number;
  food_self_sufficiency: number;
  oil_share: number;
  lng_share: number;
  vulnerability_rank: string;
  winter_factor: number;
  isolation_risk: number;
  interconnection_kW: number | null;
  note: string;
  updated_at: string;
}

export async function getLatestReserves(db: D1Database): Promise<ReservesRow | null> {
  const result = await db
    .prepare("SELECT * FROM reserves ORDER BY date DESC LIMIT 1")
    .first<ReservesRow>();
  return result;
}

export async function getReservesHistory(db: D1Database, limit: number = 30): Promise<ReservesRow[]> {
  const result = await db
    .prepare("SELECT * FROM reserves ORDER BY date DESC LIMIT ?")
    .bind(limit)
    .all<ReservesRow>();
  return result.results;
}

export async function getLatestConsumption(db: D1Database): Promise<ConsumptionRow | null> {
  const result = await db
    .prepare("SELECT * FROM consumption ORDER BY date DESC LIMIT 1")
    .first<ConsumptionRow>();
  return result;
}

export async function getAllRegions(db: D1Database): Promise<RegionRow[]> {
  const result = await db
    .prepare("SELECT * FROM regions ORDER BY vulnerability_rank ASC, name ASC")
    .all<RegionRow>();
  return result.results;
}

// ─── 原油価格 ────────────────────────────────────────

export interface OilPriceRow {
  date: string;
  wti_usd: number;
  source: string;
  updated_at: string;
}

export async function getLatestOilPrice(db: D1Database): Promise<OilPriceRow | null> {
  return db
    .prepare("SELECT * FROM oil_prices ORDER BY date DESC LIMIT 1")
    .first<OilPriceRow>();
}

// ─── 電力需給 ────────────────────────────────────────

export interface ElectricityDemandRow {
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
  updated_at: string;
}

export async function getLatestElectricityDemand(db: D1Database): Promise<ElectricityDemandRow[]> {
  const result = await db
    .prepare(`
      SELECT * FROM electricity_demand
      WHERE date = (SELECT MAX(date) FROM electricity_demand)
      ORDER BY area_id
    `)
    .all<ElectricityDemandRow>();
  return result.results;
}

export async function getElectricityHistory(db: D1Database, area_id: string, limit: number = 30): Promise<ElectricityDemandRow[]> {
  const result = await db
    .prepare("SELECT * FROM electricity_demand WHERE area_id = ? ORDER BY date DESC LIMIT ?")
    .bind(area_id, limit)
    .all<ElectricityDemandRow>();
  return result.results;
}
