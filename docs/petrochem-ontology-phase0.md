# PETROCHEM オントロジ拡充 Phase 0 調査テンプレ

PX-F Phase 0 の研究成果物。UI非依存の紙作業。完成後 `src/worker/data/petrochem.json` v2 スキーマへ投入。

## 現状ベースライン（2026-04-24）

- ファイル: `src/worker/data/petrochem.json`
- ノード58 / エッジ61 / 多親4箇所
- カテゴリ分布: feedstock(9) / refinery(1) / cracker(2) / monomer(11) / polymer(11) / product(3) / intermediate(1) / end_use(20)
- 深さ: 0〜8（9階層）

## 拡充目標

- ノード 500〜800 / エッジ 1,500前後（約10倍）
- 用途は「意思決定支援のDAG」、unit8の知識エディタ的網羅は目指さない

## v2 スキーマ案（各ノードに追加する属性）

| 属性 | 型 | 意味 | 一次ソース候補 |
|---|---|---|---|
| `bufferDays` | number \| null | 川下在庫バッファ日数 | JPCA統計・業界誌・業界団体在庫報告 |
| `hormuzDependency` | number (0-1) | ホルムズ経由原油への依存度 | 経産省貿易統計・国別原油輸入シェア |
| `altRoutes[]` | string[] | 代替供給ルート（ノードID） | Fujairah/Yanbu/非中東/国内再生 |
| `recoveryDays` | number \| null | 停戦後の復旧リードタイム | 既存 `project_ceasefire_scenario_plan.md` と整合 |
| `scenarioStatus` | `{optimistic, realistic, pessimistic, ceasefire}` | シナリオ別ステータス（normal/tight/restricted/unavailable） | flowSimulation.ts 計算値 |
| `sources[]` | string[] | 一次ソースURL/書誌 | 各ノード調査時に追記 |

## 拡充対象カテゴリ（Batchごと）

### Batch 1: 自動車チェーン（最優先・日本経済インパクト大）

- [ ] タイヤ（合成ゴム SBR/BR/EPDM） — ソース: JSR/旭化成IR、日本ゴム工業会
- [ ] タイヤ（天然ゴム補助系・カーボンブラック・シリカ）
- [ ] 燃料（ガソリン/軽油/重油/ジェット） — 既存だが精製装置ごとの細分化未了
- [ ] 潤滑油 — ソース: 出光/ENEOS IR、潤滑油協会。Phase 20 で重点化決定済
- [ ] 内装樹脂（PP/ABS/PC/TPO）
- [ ] 外装樹脂（PU/PP コンポジット）
- [ ] 電装部品（ワイヤーハーネス PVC/PE）
- [ ] バッテリー関連化学品（LiPF6/電解液/セパレータ PE）

### Batch 2: 食品包装チェーン

- [ ] PE系フィルム（既存 food_film_pe を展開：LDPE/LLDPE/HDPE）
- [ ] PP系（OPP/CPP フィルム・食品容器）
- [ ] PET系（既存 pet_film/pet_bottle を展開：ボトル/シート/テキスタイル）
- [ ] 紙系複合材（牛乳パック/紙コップ PEラミネート層）
- [ ] 段ボール（段ボール・石化依存は接着剤・防水コーティング部分）
- [ ] 物流系（コンテナ・パレット・ストレッチフィルム）
- [ ] 食品添加物・保存料（BHT/BHA 合成系）
- [ ] 食用油（精製油・植物油ベース）

### Batch 3: 医療・衛生チェーン

- [ ] 透析系（既存 dialysis_pvc を展開：ダイアライザー中空糸 PS/PES、回路 PVC）
- [ ] 輸液・静脈系（既存 iv_bag を展開）
- [ ] 医薬品（主要医薬品中間体・原薬 API のナフサ依存）
- [ ] 医療機器樹脂（PC/PEEK/シリコーン）
- [ ] 衛生用品（紙おむつ SAP、マスク不織布 PP）— realEvents の紙おむつSAP危機と連動
- [ ] 消毒・洗浄剤（エタノール・界面活性剤）
- [ ] 医療ガス（医療用酸素・窒素・亜酸化窒素のエネルギー依存）

### Batch 4: 建設・農業・電機・繊維

- [ ] 建設: 塩ビパイプ（既存 water_pipe_pvc 展開）/断熱材 XPS・EPS/塗料/接着剤/シーリング材
- [ ] 農業: 肥料（既存）/農薬/マルチフィルム/ハウスビニール/灌漑チューブ
- [ ] 電機: 家電筐体（既存 electronics_housing 展開：ABS/PC/PBT）/半導体フォトレジスト（石化系）
- [ ] 繊維: ポリエステル繊維/ナイロン/アクリル繊維/不織布

### Batch 5: インフラ・エネルギー（川上側）

- [ ] 発電（既存 power_plant 展開：LNG火力/石油火力/石炭火力）
- [ ] 水道（給水管 既存 / ポンプ潤滑油）
- [ ] 通信（光ファイバー保護被覆 PE/PVC、ケーブル被覆）

## 調査ワークフロー

1. 各 Batch で **10〜30ノード目安**に分解
2. 親ノード（例: PP ポリマー → 食品容器 → 個別製品）を特定。**多親を遠慮しない**（DAGである理由）
3. `bufferDays` は一次ソース明記。推定値なら `(est)` タグ付き
4. `hormuzDependency` は親から継承（原油→ナフサ→石化製品は 93.7%継承、電力経由は別計算）
5. 一次ソースがない項目は **ノード追加せず**。推測で埋めない
6. 1 Batch 完了時点で Phase 1 スキーマへの投入 PR を切る

## Phase 1 移行時の整合性チェック

- [ ] すべてのノードに `parent_id` または `edges[]` の to エントリが存在
- [ ] 孤立ノード 0
- [ ] depth は 0〜12 程度に収まる（深すぎると自動レイアウトが破綻）
- [ ] `hormuzDependency` と `bufferDays` の整合性（依存高・バッファ低が「逼迫」ノード）

## Out of scope（Phase 0）

- ノードの可視化優先順位・レイアウト座標（Phase 2でauto-layoutに任せる）
- 色・アイコン（Phase 2 カスタムノード設計時）
- シナリオ別ステータスの計算ロジック（flowSimulation.ts 既存拡張で対応）

## 進捗トラッキング

| Batch | 対象ノード数（目標） | 完了ノード | 一次ソース収集 | 着手日 | 完了日 |
|---|---|---|---|---|---|
| 1 自動車 | 80 | 0 | | | |
| 2 食品包装 | 60 | 0 | | | |
| 3 医療・衛生 | 60 | 0 | | | |
| 4 建設/農業/電機/繊維 | 150 | 0 | | | |
| 5 インフラ・エネルギー | 40 | 0 | | | |
| **合計** | **390** + 既存58 = **~450** | | | | |

目標500〜800の下限付近。完了後に必要に応じて細分化拡張。

---

# 一次ソース検証ログ（2026-04-24 初回調査）

## 検証状況

| ソース | URL | 状態 | 備考 |
|---|---|---|---|
| JPCA 年次生産 | `jpca.or.jp/statistics/annual/seisan.html` | ✅ 取得 | 2024年数値テーブルあり、11製品 |
| JPCA 年次需要分布 | `jpca.or.jp/statistics/annual/juyou.html` | 🟡 限定 | 画像(juyou-img01.png)に詳細、テキストは集約値のみ |
| JPCA 月次 | `jpca.or.jp/statistics/monthly/mainpd.html` | 🟡 限定 | 月次PDFインデックスのみ、中身は個別PDFダウンロード要 |
| ENEOS 石油便覧 | `eneos.co.jp/binran/part01/chapter04/section02.html` | ✅ 取得 | 基礎製品→中間体→最終製品の系統記述あり |
| ENEOS 石油化学事業 | `eneos.co.jp/business/chemical/` | ✅ 取得 | ENEOS固有製品（オレフィン/芳香族/溶剤/バイオパラキシレン） |
| 三井化学 製品 | `jp.mitsuichemicals.com/jp/products/` | ❌ 404 | 全パス404（CloudFront経由）。SPA化/URL変更の可能性 |
| 三菱ケミカル 製品 | `mcgc.com/products/` | ✅ 取得（リダイレクト先 `m-chemical.co.jp`） | 9事業分野の構造取得 |
| Honeywell UOP | `uop.honeywell.com/en/industries/petrochemicals` | ❌ 404 | Honeywell UOP事業部構造変更？URL要再調査 |
| Lummus Olefins | `lummustechnology.com/technologies/olefins` | ❌ 404 | サイトマップに olefins 固有ページなし、要再調査 |
| 国立科学博物館 094.pdf | `sts.kahaku.go.jp/.../094.pdf` | ✅ 取得（真URL発見） | **144頁の本格系統化調査**。真URL: `/albums/abm.php?d=5029&f=abm00010805.pdf` |

## 取得済み検証データ

### JPCA 年次生産実績（2024年）

| 製品 | 生産量（トン） | 備考 |
|---|---:|---|
| エチレン | 4,988,597 | オレフィン主系列 |
| プロピレン | 4,123,256 | オレフィン |
| ブタジエン | 682,508 | オレフィン（合成ゴム原料） |
| ベンゼン | 2,749,742 | 芳香族 |
| トルエン | 1,207,758 | 芳香族 |
| キシレン | 4,003,346 | 芳香族（混合） |
| 低密度ポリエチレン（LDPE） | 1,160,003 | 高分子 |
| ポリプロピレン（PP） | 1,934,738 | 高分子 |
| ポリスチレン（成形用） | 521,375 | 高分子 |
| 塩化ビニル樹脂（PVC） | 1,463,872 | 高分子 |
| メタクリル樹脂（PMMA） | 124,275 | 高分子 |

**出典**: JPCA `statistics/annual/seisan.html` 2026-04-24 取得

※ PET/PC/PE（高密度・直鎖状低密度）は同ページに明示数値なし。別ページ or 月次要確認

### JPCA 年次需要分布（全体構成比・数量ベース）

| カテゴリ | 比率 |
|---|---:|
| 合成樹脂 | 62% |
| 合成繊維 | 10% |
| 塗料 | 6% |
| 合成ゴム | 4% |
| 合成洗剤・界面活性剤 | 3% |
| その他 | 15% |

**出典**: JPCA `statistics/annual/juyou.html` 2026-04-24 取得

### 国立科学博物館「石油化学技術の系統化調査」（田島慶三, 2016, Vol.23）

#### 定義と範囲

- 石油化学工業の定義: 「石油・天然ガスを原料に石油化学基礎製品、有機工業薬品、高分子を製造する化学工業」
- **石油化学製品の3区分**: 石油化学基礎製品 / 有機工業薬品 / 高分子

#### 表2.1 有機工業薬品（官能基別分類・16カテゴリ）

| 種類 | 官能基 | 代表製品 |
|---|---|---|
| 炭化水素類 | アルキル基 | シクロヘキサン, エチルベンゼン, クメン, アルキルベンゼン類, スチレン, αオレフィン類, プロピレンオリゴマー, アルキレート |
| アルコール類 | ヒドロキシ基 | メタノール, エタノール, IPA, tert-ブチルアルコール, 2-エチルヘキサノール, EG, DEG, 1,3-プロパンジオール, 1,4-ブタンジオール, グリセリン, PG, PPG, シクロヘキサノール, ペンタエリトリトール |
| アルデヒド類 | アルデヒド基 | ホルムアルデヒド, アセトアルデヒド, アクロレイン, n-ブチルアルデヒド, イソブチルアルデヒド |
| ケトン類 | カルボニル基 | アセトン, MEK, MIBK, シクロヘキサノン, アントラキノン |
| エポキシド類 | エポキシ基 | エチレンオキサイド, プロピレンオキサイド, エピクロルヒドリン |
| エーテル類 | エーテル結合 | ジメチルエーテル, ジエチルエーテル, グリコールエーテル, MTBE, THF |
| カルボン酸類 | カルボキシ基 | 酢酸, アクリル酸, フマル酸, アジピン酸, テレフタル酸（PTA）, EDTA |
| エステル類 | エステル基 | 酢酸エステル類, 酢酸ビニル, アクリル酸エステル類, メタクリル酸メチル（MMA）, エチレンカーボネート, フタル酸エステル類, リン酸エステル類 |
| 酸無水物類 | — | 無水マレイン酸, 無水フタル酸, 無水酢酸 |
| アミド類 | アミド基 | DMF, DMAc, アクリルアミド, カプロラクタム, N-メチルピロリドン |
| アミン類 | アミン基 | MEA, エチレンジアミン, HMDA, アニリン, フェニレンジアミン類 |
| ニトリル類 | シアノ基 | アクリロニトリル, アジポニトリル, アセトニトリル |
| イソシアネート類 | イソシアン酸エステル基 | TDI, MDI, HMDI, イソホロンジイソシアネート |
| フェノール類 | ヒドロキシ基 | フェノール, ビスフェノールA, アルキルフェノール類, ヒドロキノン, レゾルシン |
| 塩素系有機化合物 | 塩素基 | クロロメタン類, 二塩化エチレン（EDC）, 塩化ビニル（VCM）, 塩化ビニリデン, トリクロロエチレン, テトラクロロエチレン, アリルクロライド, クロロプレン |
| 含硫黄有機化合物 | — | アルキルベンゼンスルホン酸類, DMSO, スルホラン |

**出典**: 田島慶三「石油化学技術の系統化調査」国立科学博物館技術の系統化調査報告 Vol.23 (2016) p.120 表2.1

#### 表2.3 高分子の用途別分類

| 用途区分 | 製品例 |
|---|---|
| 熱可塑性プラスチック | PE, PP, スチレン系樹脂, 塩化ビニル樹脂, PET, メタクリル樹脂, エンジニアリングプラスチック類 |
| 熱硬化性プラスチック | ポリウレタン, エポキシ樹脂, フェノール樹脂, 不飽和ポリエステル樹脂, アクリル酸系樹脂, ケイ素樹脂, フッ素樹脂 |
| 合成繊維 | ナイロン, ポリエステル, アクリル, PE, PP, ポリウレタン, アラミド |
| ゴム（加硫） | SBR, BR, EPDM, NBR, IR, ブチルゴム, 特殊ゴム類 |
| 熱可塑性エラストマー | スチレン系, ポリオレフィン系, ウレタン系 |
| 塗料・接着剤・バインダー | フェノール樹脂, ポリウレタン, エポキシ樹脂, ポリアクリル酸エステル, ポリ酢酸ビニル, EVA樹脂, アルキド樹脂, 合成ゴム, ケイ素樹脂, フッ素樹脂 |
| 高機能製品 | イオン交換樹脂, キレート樹脂, 凝集剤, 分散剤, 増粘剤, 感光剤 |

**出典**: 同上 p.123 表2.3

### 三菱ケミカル 9事業分野（v2スキーマでは `category` or `sector` タグ候補）

1. Specialty Chemicals — industrial chemicals, petrochemical feedstocks, solvents, MMA derivatives
2. Polymers & Resins — commodity plastics, engineering plastics, elastomers, acrylic resins, CFRP
3. Plastic Products — films, molded parts, composites, synthetic paper
4. Carbon Materials — carbon fiber and composites
5. Electronic & Display Materials — battery materials, semiconductors, display, lighting
6. Inorganic Materials — zeolites
7. Environmental & Living Solutions — water treatment, construction, packaging
8. Agriculture & Healthcare — plant facilities, food additives, health products
9. Services & IT — engineering, analysis, consulting, logistics

**出典**: `m-chemical.co.jp/products/index.html` 2026-04-24 取得

### ENEOS 石油化学ラインナップ

- **オレフィン**: エチレン, プロピレン, ブタジエン
- **芳香族**: パラキシレン, 混合キシレン, オルトキシレン, ベンゼン, トルエン
- **溶剤**: IPA, IPE, MEK, 高沸点芳香族溶剤, ノルマルパラフィン, NS Clean, EM Clean
- **バイオケミカル**: バイオパラキシレン（ISCC Plus認証）

**出典**: `eneos.co.jp/business/chemical/` 2026-04-24 取得

## Phase 1 スキーマ投入時の優先追加ノード（Kahaku/JPCA準拠）

既存58ノードに対し、**Kahaku表2.1/2.3ベースで約100ノード追加**すれば、一次ソース付きで構造が骨太になる。

### 基礎製品系（既存＋補強）
既存: crude_oil, naphtha, ethylene, propylene, butadiene, benzene, toluene, xylene
追加候補: ブチレン, イソブチレン, イソプレン, シクロペンタジエン, オルト/メタ/パラキシレン分離, 合成ガス, メタン, エタン

### 有機工業薬品系（新規・Kahaku表2.1準拠）
上記 16官能基カテゴリから **約60物質** を追加。既存で内包されているものは統合、残りを新ノードで追加。
特に: EO, EG, PO, 酢酸, 酢酸ビニル, MMA, PTA, フェノール, BPA, アクリロニトリル, カプロラクタム, TDI, MDI, EDC, VCM など。

### 高分子系（既存＋補強）
既存: PE, PP, PS, PVC, PET, PC, ABS, PMMA, etc.
追加候補: LDPE/LLDPE/HDPE 分離, 熱可塑性エラストマー（TPE）, エポキシ樹脂, フェノール樹脂, 不飽和ポリエステル樹脂, ケイ素樹脂, フッ素樹脂, アラミド, EPDM, NBR, IR, ブチルゴム

### 要再調査（404/不明URL）

- 三井化学 製品カタログ — 三井化学IR/決算資料の事業セグメント説明に切替えが現実的
- Honeywell UOP — Honeywell分社後のサイト構造変化、別URL要探索
- Lummus Olefins — `lummustechnology.com/services#technologies` 配下の具体ページを要手動探索

これら3ソースは Phase 0 の blocker ではない（Kahaku 144頁が十分な代替）。**Phase 0 は Kahaku＋JPCA＋ENEOS＋三菱の4ソースでほぼ進められる**。
