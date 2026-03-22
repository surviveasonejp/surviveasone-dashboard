# Survive as One Japan

ホルムズ海峡経由の供給途絶時、日本のエネルギー崩壊タイムラインを可視化するリスクシナリオ・シミュレーター。

> **これは予測ではなくシミュレーションです。** 楽観/現実/悲観の3シナリオで分析し、前提条件・計算式・データソースを全て公開しています。

**Live:** [surviveasonejp.org](https://surviveasonejp.org)

## シミュレーション前提

### エネルギー依存構造

| 指標 | 値 | 出典 |
|---|---|---|
| 中東石油依存率 | 94% | JETRO / 財務省貿易統計 (2025年) |
| 石油備蓄 | 254日分（国家146日+民間101日+産油国共同7日） | 資源エネルギー庁 (2025年12月末) |
| LNG全量在庫 | 約25日分（ホルムズ直接依存は6.3%） | 経産省ガス事業統計 / JETRO |
| 火力発電比率 | 65%（LNG29% + 石炭28% + 石油7%） | ISEP 電力調査統計 (2024年暦年速報) |
| 稼働原発 | 14基（関西7基/九州4基/四国1基/東北1基/中国1基） | 原子力規制委員会 |

**注意:** 石油備蓄254日分はIEA基準で国際的に充実した水準です。LNGのホルムズ直接依存は6.3%ですが、封鎖による保険料高騰・船舶退避は非依存ルート（豪州39.7%、マレーシア14.8%等）にも波及し得ます。

### 3シナリオ

| シナリオ | 石油遮断率 | LNG遮断率 | 需要変動 | 封鎖解除 |
|---|---|---|---|---|
| **楽観**（部分封鎖・米軍介入） | 50% | 3% | -15%削減 | 7日で介入→30日で解除 |
| **現実**（全面封鎖） | 94% | 6.3% | -5%削減 | 30日全面→120日で段階的解除 |
| **悲観**（全面+パニック） | 100% | 15% | +10%増加 | 90日全面→365日 |

### 計算モデル

```
dStock/dt = Inflow(t) - Consumption(t) + SPR_Release(t)
supply(t) = min(stock(t), processingCapacity)
```

| モデル要素 | 実装内容 |
|---|---|
| **フロー型在庫モデル** | 365日の日次在庫推移。タンカー到着スケジュールに基づくInflow |
| **SPR放出メカニズム** | 国家備蓄: 14日リードタイム + 日次上限30万kL。民間: 即日・実質70% |
| **封鎖解除曲線** | シナリオ別に `blockadeRate(t)` を時間関数化。段階的解除 |
| **需要破壊** | 在庫50%以下で産業15%減→30%以下で35%減→10%以下で55%減 |
| **段階的崩壊閾値** | 50%→価格暴騰、30%→供給制限、10%→配給制、0%→完全停止 |
| **連系線融通** | OCCTO運用容量ベース、10本の連系線、非対称容量対応 |
| **原子力補正** | 地域別に稼働原発出力を反映。設備利用率80%。最大70%カバー |
| **再エネバッファ** | 太陽光(CF15%)/風力(CF22%)/水力(CF35%)の地域別設備容量 |
| **水道崩壊カスケード** | 電力停止→同日水圧低下→翌日断水→3日後衛生崩壊 |
| **Family Meter** | `生存日数 = min(水÷3L人日, 食料日数, ガス÷30分人日, 電力÷50Wh人日)` |

### 制約と限界

- 本シミュレーションは最悪ケースに近いシナリオの推定値です
- 実際にはIEA協調備蓄放出、代替ルート確保、需要削減政策等の対応が取られます
- 石炭火力（28%）はホルムズ非依存（豪州・インドネシア主体）であり、短期的な直接影響は限定的です
- 経済カスケード効果（GDP・為替・物価への波及）は未実装です
- 代替供給ルート（喜望峰迂回+10-15日等）のモデル化は未実装です

## Features

- **Survival Clock** -- 石油/LNG/電力の残存日数カウントダウン（3シナリオ切替）
- **Collapse Map** -- 全国10電力エリアの崩壊順マップ（連系線融通・原子力補正込み）
- **Last Tanker Tracker** -- 実在12隻のタンカー推定航跡マップ（Natural Earth 110m世界地図）
- **Food Chain Collapse** -- 商品カテゴリ別消失予測（サプライチェーン層別在庫日数）
- **Family Survival Meter** -- 家庭の生存可能日数算出 + 不足量リスト + 概算コスト
- **備蓄ガイド** -- フェーズ別行動指針（6カテゴリ）
- **PWA** -- オフラインキャッシュ対応（停電後も参照可能）
- **ライト/ダークモード** -- OS設定自動検出 + 手動切替 + ハイコントラスト対応

## データソース

| データ | ソース | 更新 |
|---|---|---|
| 石油備蓄 | 資源エネルギー庁 石油備蓄統計 | 静的（2025年12月末） |
| LNG在庫 | 経産省ガス事業統計 | 静的 |
| 電力構成 | ISEP 電力調査統計 | 静的（2024年暦年速報） |
| 貿易統計 | JETRO / 財務省 | 静的（2025年実績） |
| 電力需給 | OCCTO / 各電力会社CSV | Cron自動取得（4エリア） |
| 連系線容量 | OCCTO 運用容量 | 静的（2025年度） |
| 原発稼働状況 | 原子力規制委員会 | 静的 |
| 消費量ベースライン | OWID energy-data | Cron自動取得 |
| 地図データ | Natural Earth 110m | 静的（Public Domain） |
| 船舶データ | 公開船舶DB / 海運各社PR | 静的 |

## API

全エンドポイントは `surviveasonejp.org/api/` および `surviveasonejp.net/api/` で公開されています。

**エンドポイント一覧:** `GET /api` でJSON形式の一覧を取得可能。

| エンドポイント | メソッド | 説明 |
|---|---|---|
| `/api/health` | GET | ヘルスチェック |
| `/api/reserves` | GET | 石油・LNG備蓄データ |
| `/api/consumption` | GET | 日次消費量 |
| `/api/regions` | GET | 10エリア別パラメータ（原子力・再エネ・連系線容量含む） |
| `/api/countdowns?scenario={id}` | GET | 石油/LNG/電力の残存日数 |
| `/api/collapse?scenario={id}` | GET | 10エリア崩壊順序 |
| `/api/simulation?scenario={id}&maxDays={n}` | GET | フロー型在庫シミュレーション（日次タイムライン） |
| `/api/food-collapse?scenario={id}` | GET | 食品カテゴリ別消失予測 |
| `/api/tankers` | GET | タンカー12隻の到着予測 |
| `/api/family-survival` | POST | 家庭生存日数算出 |
| `/api/electricity?area={id}` | GET | 電力需給実測データ |

**シナリオID:** `optimistic` / `realistic` / `pessimistic`

### レスポンス例

```bash
# 現実シナリオのカウントダウン
curl https://surviveasonejp.org/api/countdowns?scenario=realistic

# 家庭生存日数算出
curl -X POST https://surviveasonejp.org/api/family-survival \
  -H "Content-Type: application/json" \
  -d '{"members":3,"waterLiters":36,"foodDays":7,"gasCanisterCount":6,"batteryWh":500,"cashYen":30000}'
```

## Architecture

```
Client (React 19 + Vite 6 + Tailwind CSS 4)
  ↕ fetch /api/*
Worker (Cloudflare Workers)
  ├── D1 (SQLite) -- reserves/consumption/regions/electricity
  ├── KV -- API response cache
  ├── R2 -- OWID CSV archive
  └── Cron Triggers -- データ自動取得
```

## Tech Stack

React 19 + Vite 6 + TypeScript (strict) / Cloudflare Workers + D1 + KV + R2

## License

[AGPL-3.0](LICENSE) -- 詳細は [LICENSING.md](LICENSING.md) を参照。

商用利用・SaaSホスティングには別途ライセンスが必要です。

## Funding

このプロジェクトは広告なしのオープンソースプロジェクトです。

スポンサーシップはリアルタイムタンカー追跡（AIS API）の実現に直接使われます。開発は個人の時間で行っており、人件費としては使用しません。

**[GitHub Sponsors で支援する](https://github.com/sponsors/idx)**

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## Support

- GitHub Issues: バグ報告・モデル検証・データ精度の議論
- X: [@surviveasonejp](https://x.com/surviveasonejp)

## Notice

一部の設計ドキュメント・運用設定はプロジェクトの持続可能性のため非公開としています。
