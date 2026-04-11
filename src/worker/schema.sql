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

-- ─── 貿易統計（ホルムズ依存率 月次自動更新）────────────────────────
-- 財務省貿易統計（customs.go.jp）または資源エネルギー庁石油輸入統計から取得
CREATE TABLE IF NOT EXISTS trade_statistics (
  month           TEXT NOT NULL,  -- YYYY-MM
  commodity       TEXT NOT NULL,  -- 'crude_oil' | 'lng'
  total_volume_kl INTEGER,        -- 総輸入量（kL）
  mideast_volume_kl INTEGER,      -- 中東諸国（ホルムズ経由）輸入量（kL）
  hormuz_rate     REAL NOT NULL,  -- ホルムズ依存率（0.0〜1.0）
  top_origins     TEXT,           -- JSON: 上位5カ国の内訳 [{"country":"SAU","share":0.38},...]
  source          TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (month, commodity)
);

-- ─── 石油製品在庫（週次）────────────────────────────────────────────
-- 資源エネルギー庁「石油製品需給動態統計」pl007 から週次取得
CREATE TABLE IF NOT EXISTS oil_products_inventory (
  week_ending     TEXT PRIMARY KEY, -- 週末日 YYYY-MM-DD
  gasoline_kl     INTEGER,          -- ガソリン（kL）
  kerosene_kl     INTEGER,          -- 灯油（kL）
  diesel_kl       INTEGER,          -- 軽油（kL）
  fuel_oil_heavy_kl INTEGER,        -- 重油合計（kL）
  naphtha_kl      INTEGER,          -- ナフサ（kL）
  total_kl        INTEGER,          -- 合計（kL）
  source          TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── 石油化学生産実績（月次）────────────────────────────────────────
-- 石油化学工業協会（JPCA）「エチレン等生産実績」から月次取得
CREATE TABLE IF NOT EXISTS petrochem_production (
  month         TEXT NOT NULL,  -- YYYY-MM
  product       TEXT NOT NULL,  -- 'ethylene' | 'propylene' | 'benzene' | 'pe' | 'pp' | 'ps' | 'pvc'
  production_t  INTEGER NOT NULL,  -- 生産量（t）
  inventory_t   INTEGER,           -- 月末在庫量（t）
  source        TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (month, product)
);

-- ─── 冷蔵倉庫在庫（月次）────────────────────────────────────────────
-- 日本冷蔵倉庫協会（JARW）「冷蔵倉庫統計」から月次取得
-- 食料在庫日数の動的計算に使用（foodSupply.jsonの静的値を補完）
CREATE TABLE IF NOT EXISTS food_cold_storage (
  month       TEXT PRIMARY KEY, -- YYYY-MM
  total_t     INTEGER NOT NULL, -- 総在庫量（t）
  seafood_t   INTEGER,          -- 水産物（t）
  meat_t      INTEGER,          -- 食肉（t）
  dairy_t     INTEGER,          -- 乳製品（t）
  other_t     INTEGER,          -- その他（t）
  source      TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_statistics_month    ON trade_statistics(month DESC, commodity);
CREATE INDEX IF NOT EXISTS idx_oil_products_week         ON oil_products_inventory(week_ending DESC);
CREATE INDEX IF NOT EXISTS idx_petrochem_production_month ON petrochem_production(month DESC, product);
CREATE INDEX IF NOT EXISTS idx_food_cold_storage_month   ON food_cold_storage(month DESC);
