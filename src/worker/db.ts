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

// ─── 貿易統計 ─────────────────────────────────────────

export interface TradeStatisticsRow {
  month: string;
  commodity: string;
  total_volume_kl: number | null;
  mideast_volume_kl: number | null;
  hormuz_rate: number;
  top_origins: string | null; // JSON
  source: string;
  updated_at: string;
}

export async function getLatestTradeStatistics(
  db: D1Database,
  commodity: "crude_oil" | "lng",
): Promise<TradeStatisticsRow | null> {
  return db
    .prepare(
      "SELECT * FROM trade_statistics WHERE commodity = ? ORDER BY month DESC LIMIT 1",
    )
    .bind(commodity)
    .first<TradeStatisticsRow>();
}

export async function getTradeStatisticsHistory(
  db: D1Database,
  commodity: "crude_oil" | "lng",
  limit: number = 12,
): Promise<TradeStatisticsRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM trade_statistics WHERE commodity = ? ORDER BY month DESC LIMIT ?",
    )
    .bind(commodity, limit)
    .all<TradeStatisticsRow>();
  return result.results;
}

// ─── 石油製品在庫 ────────────────────────────────────

export interface OilProductsInventoryRow {
  week_ending: string;
  gasoline_kl: number | null;
  kerosene_kl: number | null;
  diesel_kl: number | null;
  fuel_oil_heavy_kl: number | null;
  naphtha_kl: number | null;
  total_kl: number | null;
  source: string;
  updated_at: string;
}

export async function getLatestOilProductsInventory(
  db: D1Database,
): Promise<OilProductsInventoryRow | null> {
  return db
    .prepare("SELECT * FROM oil_products_inventory ORDER BY week_ending DESC LIMIT 1")
    .first<OilProductsInventoryRow>();
}

export async function getOilProductsHistory(
  db: D1Database,
  limit: number = 52,
): Promise<OilProductsInventoryRow[]> {
  const result = await db
    .prepare("SELECT * FROM oil_products_inventory ORDER BY week_ending DESC LIMIT ?")
    .bind(limit)
    .all<OilProductsInventoryRow>();
  return result.results;
}

// ─── 石化生産実績 ────────────────────────────────────

export interface PetrochemProductionRow {
  month: string;
  product: string;
  production_t: number;
  inventory_t: number | null;
  source: string;
  updated_at: string;
}

export async function getLatestPetrochemProduction(
  db: D1Database,
  product: string,
): Promise<PetrochemProductionRow | null> {
  return db
    .prepare(
      "SELECT * FROM petrochem_production WHERE product = ? ORDER BY month DESC LIMIT 1",
    )
    .bind(product)
    .first<PetrochemProductionRow>();
}

export async function getPetrochemProductionHistory(
  db: D1Database,
  product: string,
  limit: number = 12,
): Promise<PetrochemProductionRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM petrochem_production WHERE product = ? ORDER BY month DESC LIMIT ?",
    )
    .bind(product, limit)
    .all<PetrochemProductionRow>();
  return result.results;
}

// ─── 冷蔵倉庫在庫 ───────────────────────────────────

export interface FoodColdStorageRow {
  month: string;
  total_t: number;
  seafood_t: number | null;
  meat_t: number | null;
  dairy_t: number | null;
  other_t: number | null;
  source: string;
  updated_at: string;
}

export async function getLatestFoodColdStorage(
  db: D1Database,
): Promise<FoodColdStorageRow | null> {
  return db
    .prepare("SELECT * FROM food_cold_storage ORDER BY month DESC LIMIT 1")
    .first<FoodColdStorageRow>();
}

export async function getFoodColdStorageHistory(
  db: D1Database,
  limit: number = 12,
): Promise<FoodColdStorageRow[]> {
  const result = await db
    .prepare("SELECT * FROM food_cold_storage ORDER BY month DESC LIMIT ?")
    .bind(limit)
    .all<FoodColdStorageRow>();
  return result.results;
}
