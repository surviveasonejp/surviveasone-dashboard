-- surviveasone-db D1 スキーマ
-- Phase 2: 備蓄・消費・地域データの構造化ストレージ

CREATE TABLE IF NOT EXISTS reserves (
  date TEXT PRIMARY KEY,
  oil_national_kL INTEGER NOT NULL,
  oil_private_kL INTEGER NOT NULL,
  oil_joint_kL INTEGER NOT NULL,
  oil_total_kL INTEGER NOT NULL,
  oil_total_days INTEGER NOT NULL,
  oil_hormuz_rate REAL NOT NULL,
  lng_inventory_t INTEGER NOT NULL,
  lng_hormuz_rate REAL NOT NULL,
  thermal_share REAL NOT NULL,
  nuclear_share REAL NOT NULL,
  renewable_share REAL NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consumption (
  date TEXT PRIMARY KEY,
  oil_annual_TWh REAL NOT NULL,
  oil_daily_kL INTEGER NOT NULL,
  oil_daily_barrels INTEGER NOT NULL,
  lng_annual_t INTEGER NOT NULL,
  lng_daily_t INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  population INTEGER NOT NULL,
  power_demand_share REAL NOT NULL,
  food_self_sufficiency REAL NOT NULL,
  oil_share REAL NOT NULL,
  lng_share REAL NOT NULL,
  vulnerability_rank TEXT NOT NULL,
  winter_factor REAL NOT NULL,
  isolation_risk REAL NOT NULL,
  interconnection_kW INTEGER,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reserves_date ON reserves(date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_date ON consumption(date DESC);
