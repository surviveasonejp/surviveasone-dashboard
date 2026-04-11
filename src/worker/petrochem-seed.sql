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

-- ─── Phase A: PETボトルチェーン追加 ──────────────────────────────

INSERT OR IGNORE INTO petrochem_nodes (id, label, category, depth, parent_id, naptha_factor, description)
VALUES
  (
    'ethylene_oxide',
    'エチレンオキサイド(EO)',
    'monomer',
    5,
    'ethylene',
    0.9,
    'エチレンを酸素で酸化して製造。EGの前駆体。世界需要の約25%が界面活性剤、20%がPET原料EGに'
  ),
  (
    'paraxylene',
    'パラキシレン(PX)',
    'monomer',
    5,
    'benzene',
    0.7,
    'BTXキシレン異性化で製造。PTA（テレフタル酸）の前駆体。世界生産約5,000万t/年'
  ),
  (
    'ethylene_glycol',
    'エチレングリコール(EG)',
    'polymer',
    6,
    'ethylene_oxide',
    0.9,
    'EOを水和して製造。PET樹脂の原料（EG30%+PTA70%）。日本は約90%輸入依存'
  ),
  (
    'pta',
    'テレフタル酸(PTA)',
    'polymer',
    6,
    'paraxylene',
    0.7,
    'PXを酸化して製造。PET樹脂の主原料（重量比70%）。国内生産能力が限定的で輸入依存率45%'
  ),
  (
    'pet_resin',
    'PET樹脂',
    'polymer',
    7,
    'ethylene_glycol',
    0.8,
    'EG+PTAを重縮合。国内生産25万t/年。PETボトル・フィルム・繊維に使用。輸入品との競合激しく封鎖時は輸入途絶リスク'
  ),
  (
    'pet_bottle',
    'PETボトル',
    'end_use',
    8,
    'pet_resin',
    0.8,
    '飲料水・お茶・醤油・ソースボトル。年間約200億本消費。代替容器（紙・ガラス・缶）への切替に時間を要する'
  ),
  (
    'pet_film',
    'PETフィルム',
    'end_use',
    8,
    'pet_resin',
    0.7,
    '食品包装・太陽電池バックシート・磁気テープ基材。食品包装分野では牛乳・ハム・チーズの袋に使用'
  );

INSERT OR IGNORE INTO petrochem_edges (id, source_id, target_id, flow_label)
VALUES
  ('ethylene->ethylene_oxide',       'ethylene',        'ethylene_oxide',   '酸化'),
  ('ethylene_oxide->ethylene_glycol','ethylene_oxide',   'ethylene_glycol',  '水和'),
  ('benzene->paraxylene',            'benzene',          'paraxylene',       '異性化'),
  ('paraxylene->pta',                'paraxylene',       'pta',              '酸化'),
  ('ethylene_glycol->pet_resin',     'ethylene_glycol',  'pet_resin',        '重縮合(30%)'),
  ('pta->pet_resin',                 'pta',              'pet_resin',        '重縮合(70%)'),
  ('pet_resin->pet_bottle',          'pet_resin',        'pet_bottle',       '延伸成形'),
  ('pet_resin->pet_film',            'pet_resin',        'pet_film',         '二軸延伸');
