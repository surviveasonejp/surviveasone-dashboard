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

CREATE TABLE IF NOT EXISTS electricity_demand (
  date TEXT NOT NULL,
  area_id TEXT NOT NULL,
  peak_demand_mw REAL NOT NULL,
  peak_supply_mw REAL,
  usage_rate REAL,
  solar_mw REAL,
  wind_mw REAL,
  thermal_mw REAL,
  nuclear_mw REAL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, area_id)
);

CREATE TABLE IF NOT EXISTS oil_prices (
  date TEXT PRIMARY KEY,
  wti_usd REAL NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reserves_date ON reserves(date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_date ON consumption(date DESC);
CREATE INDEX IF NOT EXISTS idx_electricity_date ON electricity_demand(date DESC, area_id);
CREATE INDEX IF NOT EXISTS idx_oil_prices_date ON oil_prices(date DESC);

-- 石化ノードテーブル
CREATE TABLE IF NOT EXISTS petrochem_nodes (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  category      TEXT NOT NULL,
  depth         INTEGER NOT NULL,
  parent_id     TEXT,
  naptha_factor REAL,
  description   TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 石化エッジテーブル
CREATE TABLE IF NOT EXISTS petrochem_edges (
  id         TEXT PRIMARY KEY,
  source_id  TEXT NOT NULL REFERENCES petrochem_nodes(id),
  target_id  TEXT NOT NULL REFERENCES petrochem_nodes(id),
  flow_label TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_petrochem_nodes_category ON petrochem_nodes(category);
CREATE INDEX IF NOT EXISTS idx_petrochem_edges_source   ON petrochem_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_petrochem_edges_target   ON petrochem_edges(target_id);
