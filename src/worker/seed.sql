-- 初期データ投入: reserves.json + consumption.json + regions.json の内容

-- 備蓄データ (2025年12月末)
INSERT OR REPLACE INTO reserves (date, oil_national_kL, oil_private_kL, oil_joint_kL, oil_total_kL, oil_total_days, oil_hormuz_rate, lng_inventory_t, lng_hormuz_rate, thermal_share, nuclear_share, renewable_share, source)
VALUES ('2025-12-31', 43220000, 29170000, 2070000, 74460000, 254, 0.94, 4500000, 0.063, 0.65, 0.082, 0.267, '資源エネルギー庁 石油備蓄統計(2025年12月末) + ISEP 2024年暦年 + JETRO 2025年');

-- 消費データ (OWID 2024 + 貿易統計 2025)
INSERT OR REPLACE INTO consumption (date, oil_annual_TWh, oil_daily_kL, oil_daily_barrels, lng_annual_t, lng_daily_t, source)
VALUES ('2025-12-31', 1782.89, 469000, 2500000, 64980000, 178000, 'OWID energy-data 2024 + 財務省貿易統計 2025年');

-- 地域データ (10電力エリア)
INSERT OR REPLACE INTO regions (id, name, population, power_demand_share, food_self_sufficiency, oil_share, lng_share, vulnerability_rank, winter_factor, isolation_risk, interconnection_kW, note)
VALUES
  ('hokkaido', '北海道', 5050000, 0.035, 2.18, 0.04, 0.02, 'A', 1.4, 1.2, 900000, '冬季暖房依存極大。北本連系線90万kW(2019年増強済、2028年120万kWへ増強予定)'),
  ('tohoku', '東北', 8550000, 0.075, 0.75, 0.06, 0.07, 'D', 1.3, 1.0, 5000000, '暖房需要高。新潟LNG受入拠点で相対的に有利。東京向け連系線大容量'),
  ('tokyo', '東京', 45800000, 0.31, 0.02, 0.35, 0.38, 'B', 1.1, 1.0, NULL, '最大需要エリア。製油所7基・LNG基地3基集中。消費速度が最速'),
  ('chubu', '中部', 15300000, 0.12, 0.12, 0.14, 0.16, 'C', 1.15, 1.0, NULL, '自動車産業集積。知多LNG基地は国内最大級。ENEOS知多製油所は停止済み'),
  ('hokuriku', '北陸', 2800000, 0.025, 0.64, 0.01, 0.01, 'D', 1.25, 1.0, NULL, '小規模エリア。LNG基地・製油所なく近隣エリアから供給依存。志賀原発停止中'),
  ('kansai', '関西', 20300000, 0.15, 0.12, 0.13, 0.19, 'B', 1.1, 1.0, NULL, '第2の大需要圏。LNG基地3基。ENEOS和歌山製油所は2023年10月閉鎖済み'),
  ('chugoku', '中国', 7000000, 0.055, 0.62, 0.10, 0.04, 'C', 1.1, 1.0, NULL, '瀬戸内工業地帯。水島コンビナート(35万b/d)は国内最大製油所。西部石油山口は2024年3月停止'),
  ('shikoku', '四国', 3620000, 0.025, 0.42, 0.03, 0.03, 'A', 1.05, 1.3, 1200000, '本四連系線120万kW(1回線)。伊方原発3号機稼働中。太陽石油は愛媛県今治市'),
  ('kyushu', '九州', 12600000, 0.09, 0.75, 0.08, 0.08, 'D', 1.05, 1.0, 2380000, '川内・玄海原発稼働で火力依存低。関門連系線238万kW。太陽光導入も多い'),
  ('okinawa', '沖縄', 1470000, 0.009, 0.34, 0.01, 0.01, 'S', 1.0, 1.5, 0, '完全島嶼。南西石油(西原)は2022年精製機能停止、稼働製油所なし。備蓄日数が生存日数に直結');
