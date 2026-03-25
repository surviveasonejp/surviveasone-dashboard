# Survive as One Japan

ホルムズ海峡封鎖時、日本のエネルギー・食料・水道の連鎖崩壊タイムラインを可視化するリスクシナリオ・シミュレーター。

> **これは予測ではなくシミュレーションです。** 楽観/現実/悲観の3シナリオで分析し、前提条件・計算式・データソースを全て公開しています。

**Live:** [surviveasonejp.org](https://surviveasonejp.org) | **API:** [surviveasonejp.net/api](https://surviveasonejp.net/api) | **X:** [@surviveasonejp](https://x.com/surviveasonejp)

## 誰のためのツールか

赤ちゃんのミルク、人工呼吸器の電源、透析の水——自分だけでは避難も備蓄もできない家族を抱える人が、危機の進行を正しく理解し、素早く行動するための情報を提供する。

- 乳幼児・要介護高齢者・障害のある家族を持つ世帯
- 在宅人工呼吸器・透析など医療機器に依存する患者の家族
- 自治体防災担当・地域包括支援センター・福祉避難所運営者

## シミュレーション前提

### エネルギー依存構造

| 指標 | 値 | 出典 |
|---|---|---|
| 中東石油依存率 | 94% | JETRO / 財務省貿易統計 (2025年) |
| 石油備蓄 | 241日分（国家146日+民間89日+産油国共同6日） | 経産省 (2026年3月20日時点推計) |
| LNG全量在庫 | 約25日分（ホルムズ直接依存は6.3%） | 経産省ガス事業統計 / JETRO |
| 火力発電比率 | 65%（LNG29% + 石炭28% + 石油7%） | ISEP 電力調査統計 (2024年暦年速報) |
| 稼働原発 | 14基（関西7基/九州4基/四国1基/東北1基/中国1基） | 原子力規制委員会 |

**注意:** 石油備蓄241日分はIEA基準で国際的に充実した水準です。LNGのホルムズ直接依存は6.3%ですが、封鎖による保険料高騰・船舶退避は非依存ルートにも波及し得ます。

### 3シナリオ

| シナリオ | 石油遮断率 | LNG遮断率 | 需要変動 | 封鎖解除 |
|---|---|---|---|---|
| **楽観**（部分封鎖・米軍介入） | 50% | 3% | -15%削減 | 7日で介入→30日で解除 |
| **現実**（全面封鎖） | 94% | 6.3% | -5%削減 | 30日全面→120日で段階的解除 |
| **悲観**（全面+パニック） | 100% | 15% | +10%増加 | 90日全面→365日 |

### 計算モデル（14要素）

| モデル要素 | 実装内容 |
|---|---|
| **フロー型在庫モデル** | `dStock/dt = Inflow - Consumption + SPR_Release + AlternativeSupply`。365日の日次在庫推移 |
| **LNG供給途絶モデル** | 消費は需要ベース。ホルムズ依存分(6.3%)のみ途絶、非ホルムズ供給(93.7%)は継続 |
| **SPR放出メカニズム** | 国家備蓄: 14日リードタイム + 日次上限30万kL。民間: 即日・実質70% |
| **封鎖解除曲線** | シナリオ別に `blockadeRate(t)` を時間関数化。段階的解除 |
| **需要破壊モデリング** | 在庫50%以下で産業15%減→30%以下で35%減→10%以下で55%減 |
| **段階的崩壊閾値** | 50%→価格暴騰（パニック買い）、30%→供給制限（奇数偶数制）、10%→配給制（政府管理分配）、0%→完全停止 |
| **経済カスケード** | 原油→ガソリン(弾力性0.7)→物流(0.3)→食品(0.15)。IEA+1973年石油ショック実績ベース |
| **連系線融通** | OCCTO運用容量ベース、10本の連系線、非対称容量対応。3回反復で多段融通安定化 |
| **原子力補正** | 地域別に稼働原発出力を反映。設備利用率80%。最大70%カバー |
| **再エネバッファ** | 太陽光(CF15%)/風力(CF22%)/水力(CF35%)の地域別設備容量。蓄電池なし上限40% |
| **水道崩壊カスケード** | 電力停止→同日水圧低下→翌日断水→3日後衛生崩壊 |
| **食料サプライチェーン** | ナフサ→石化製品→包装材の連鎖崩壊。化学日報報道ベース |
| **地域別ロジスティクス** | 10エリアの配送遅延・トラック燃料依存率・給油所数(27,414箇所) |
| **代替供給ルート** | フジャイラ/ヤンブー/非中東の3ルート。調達成功率は国際競争で日次低下 |

## Features

- **Survival Clock** — 石油/LNG/電力の残存日数カウントダウン（3シナリオ切替）
- **Collapse Map** — 全国10電力エリアの崩壊順マップ（連系線融通・原子力・再エネ補正込み。沖縄は先島諸島まで表示）
- **Last Tanker Tracker** — 実在タンカーの推定航跡マップ。ホルムズ未通過船のグレーアウト表示。ETAは経過日数で自動減算
- **Food Chain Collapse** — 商品カテゴリ別消失予測（サプライチェーン層別在庫日数）
- **Family Survival Meter** — 家庭の生存可能日数算出 + 要配慮者向け注意喚起 + 不足量/概算コスト + X共有
- **Survival Guide** — フェーズ別行動指針（配給制対応含む）+ 要配慮者チェックリスト（乳幼児/医療機器/透析/介護/障害）
- **AISタンカー追跡** — AISStream.ioから1日2回、位置・目的港・日本向け判定を自動取得
- **PWA** — オフラインキャッシュ対応（重要APIデータをプリキャッシュ。停電後も参照可能）
- **アクセシビリティ** — ARIA属性・スクリーンリーダー対応
- **FAQ構造化データ** — 「停電 赤ちゃん ミルク」「人工呼吸器 停電 対策」等の検索で強調スニペットを狙うSchema.org FAQPage

## タンカー追跡

VLCC 5隻 + LNG 5隻 + 代替ルート3隻を追跡。全船のIMO番号はMaritimeOptima/VesselFinderで検証済み（2026年3月25日）。

- **ホルムズ未通過判定**: ペルシャ湾内出発港（Ras Tanura, Jubail, Kharg Island, Ras Laffan, Mina Al Ahmadi, Basrah）からの船舶はグレーアウト + 「封鎖時到達不可」バッジ
- **ETA自動減算**: `meta.updatedAt`からの経過日数で`eta_days`を自動補正。デプロイ不要で鮮度維持
- **AIS日本向け判定**: 目的港フィールドから`JP`プレフィクス・日本港名24件辞書で自動判定
- **AIS ETA再計算**: 現在位置+SOGから目的港までの大圏距離でリアルタイムETA算出

## データソース

| データ | ソース | 更新 |
|---|---|---|
| 石油備蓄 | 経産省 石油備蓄推計量 | 月次自動 + バリデーション |
| LNG在庫 | 経産省 ガス事業統計 | 月次自動 |
| 電力需給 | 全10電力エリアCSV/JSON | 日次自動 |
| 消費量ベースライン | OWID energy-data | 週次自動 |
| タンカー位置 | AISStream.io WebSocket | 1日2回自動 |
| 連系線容量 | OCCTO 運用容量 | 静的（2025年度） |
| 原発稼働状況 | 原子力規制委員会 | 静的 |
| 船舶データ | MaritimeOptima / 公開船舶DB | AIS自動 + 手動検証 |
| 地図データ | Natural Earth 110m | 静的（Public Domain） |

## API

全エンドポイントは `surviveasonejp.org/api/` および `surviveasonejp.net/api/` で公開。

| エンドポイント | 説明 |
|---|---|
| `GET /api/health` | ヘルスチェック |
| `GET /api/reserves` | 石油・LNG備蓄データ |
| `GET /api/consumption` | 日次消費量 |
| `GET /api/regions` | 10エリア別パラメータ |
| `GET /api/countdowns?scenario={id}` | 残存日数 |
| `GET /api/collapse?scenario={id}` | 10エリア崩壊順序 |
| `GET /api/simulation?scenario={id}&days={n}` | フロー型在庫シミュレーション |
| `GET /api/food-collapse?scenario={id}` | 食品消失予測 |
| `GET /api/tankers` | タンカー到着予測 + AIS位置 |
| `GET /api/electricity?area={id}` | 電力需給実測 |
| `POST /api/family-survival` | 家庭生存日数算出 |

**シナリオID:** `optimistic` / `realistic` / `pessimistic`

## Architecture

```
Client (React 19 + Vite 6 + Tailwind CSS 4)
  ├── PWA Service Worker (App Shell + API プリキャッシュ)
  └── fetch /api/*
Worker (Cloudflare Workers)
  ├── D1 (SQLite) — reserves/consumption/regions/electricity
  ├── KV — API cache + AIS positions + tanker overrides
  ├── R2 — OWID CSV archive
  └── Cron Triggers (4/5枠)
        ├── 毎週月曜 03:00 UTC — OWID energy-data
        ├── 毎日 06:00 UTC — AIS位置+目的港 (2回目)
        ├── 毎日 18:00 UTC — 電力需給 + AIS (1回目)
        └── 毎月18日 06:00 UTC — 石油備蓄 + LNG在庫
```

## Tech Stack

React 19 + Vite 6 + TypeScript (strict) / Cloudflare Workers + D1 + KV + R2 / AISStream.io

インフラ月額: ~$3（ドメイン2件のみ。Cloudflare全スタック無料枠）

## License

[AGPL-3.0](LICENSE) — 詳細は [LICENSING.md](LICENSING.md) を参照。

商用利用・SaaSホスティングには別途ライセンスが必要です。

## Funding

広告なし・トラッキングなしのオープンソースプロジェクトです。

スポンサーシップは衛星AISによる全ルートタンカー追跡とデータ精度向上に直接使われます。開発は個人の時間で行っており、人件費としては使用しません。

**[GitHub Sponsors で支援する](https://github.com/sponsors/idx)**

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## Support

- GitHub Issues: バグ報告・モデル検証・データ精度の議論
- X: [@surviveasonejp](https://x.com/surviveasonejp)
