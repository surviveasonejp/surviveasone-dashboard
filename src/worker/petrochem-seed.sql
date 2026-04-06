-- 石化樹形図 D1シード（差分アップサート）
-- 実行: npx wrangler d1 execute surviveasone-db --file=src/worker/petrochem-seed.sql --remote
-- ローカル: npx wrangler d1 execute surviveasone-db --file=src/worker/petrochem-seed.sql --local

-- ─── 既存ノードの説明更新 ───────────────────────────────────

UPDATE petrochem_nodes
SET description = '封鎖7日目から減産開始。エチレンセンター12拠点（化学日報 2026-03-21）。2024年稼働率79.8%・33カ月連続90%割れ（石化工業協会）。2030年までに175万トン設備削減予定'
WHERE id = 'naphtha_cracker';

UPDATE petrochem_nodes
SET description = '石化製品の基幹モノマー。2024年生産498万トン（37年ぶり500万トン割れ）。設備能力616万トンのうち約130万トンが過剰。生産量はナフサに直結'
WHERE id = 'ethylene';

UPDATE petrochem_nodes
SET description = 'PPの原料。食品容器・医療器具に使用。ナフサクラッカー収率約16%（Duncan Seddon標準値）'
WHERE id = 'propylene';

UPDATE petrochem_nodes
SET description = '合成ゴムの原料。タイヤ・医療チューブ。ナフサクラッカー収率約4%（C4留分全体の約半分）'
WHERE id = 'butadiene';

UPDATE petrochem_nodes
SET description = 'スチレン・フェノールの原料。BTX合計収率10〜13%のうちベンゼン分約6%'
WHERE id = 'benzene';

-- ─── 新規ノード追加（代替フィード） ────────────────────────

INSERT OR IGNORE INTO petrochem_nodes (id, label, category, depth, parent_id, naptha_factor, description)
VALUES
  (
    'alt_feedstock',
    '代替フィード（輸入）',
    'feedstock',
    4,
    'naphtha_cracker',
    0.1,
    '輸入による代替エチレン調達バッファ。世界シェア: ナフサ45%・エタン37%・石炭MTO8%（BCG 2023）。日本はエタン受入インフラなし。封鎖長期化で代替調達も困難化'
  ),
  (
    'ethane_cracking',
    'エタン分解',
    'feedstock',
    5,
    'alt_feedstock',
    0,
    'エタン分解によるエチレン生産（米国/中東主導）。世界シェア37%。日本は液化エタン受入端末なし・輸送コスト+$200/t。導入に5〜10年のリードタイムが必要'
  ),
  (
    'coal_mto',
    '石炭MTO（中国）',
    'feedstock',
    5,
    'alt_feedstock',
    0,
    '石炭→メタノール→オレフィン（MTO）。中国国内シェア16%・世界8%（BCG 2023）。2023〜2025年は過剰供給・稼働率悪化・採算割れ多数。2025年4月現在は価格圧迫要因'
  );

-- ─── 既存エッジのflow_label更新（収率%付き） ──────────────

UPDATE petrochem_edges SET flow_label = '分解(30%)' WHERE id = 'naphtha_cracker->ethylene';
UPDATE petrochem_edges SET flow_label = '分解(16%)' WHERE id = 'naphtha_cracker->propylene';
UPDATE petrochem_edges SET flow_label = '分解(4%)'  WHERE id = 'naphtha_cracker->butadiene';
UPDATE petrochem_edges SET flow_label = '分解(6%)'  WHERE id = 'naphtha_cracker->benzene';

-- ─── 新規エッジ追加 ─────────────────────────────────────────

INSERT OR IGNORE INTO petrochem_edges (id, source_id, target_id, flow_label)
VALUES
  ('naphtha_cracker->alt_feedstock', 'naphtha_cracker', 'alt_feedstock',   '代替調達'),
  ('alt_feedstock->ethane_cracking', 'alt_feedstock',   'ethane_cracking', 'エタン分解'),
  ('alt_feedstock->coal_mto',        'alt_feedstock',   'coal_mto',        '石炭MTO');
