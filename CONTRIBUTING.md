# Contributing to Survive as One

Survive as One はオープンソースのリスクシナリオ・シミュレーターです。以下の方法でプロジェクトに貢献できます。

## 貢献の種類

### 1. モデル検証（最も重要）

シミュレーションモデルの前提・計算式が現実に即しているかの検証は、このプロジェクトの信頼性を決定する最も重要な貢献です。

- `src/worker/simulation/flowSimulation.ts` — フロー型在庫モデル
- `src/worker/simulation/calculations.ts` — 地域別崩壊計算
- `src/worker/data/reserves.json` — 備蓄データ
- `src/worker/data/regions.json` — 地域別パラメータ
- `src/worker/data/interconnections.json` — 連系線トポロジー

Issue で「このパラメータは○○のデータでは△△ではないか」と議論してください。

### 2. データ更新

公開統計の更新があった場合、JSONファイルを更新するPRは歓迎します。

- `src/worker/data/reserves.json` — 資源エネルギー庁の石油備蓄統計が更新された場合
- `src/worker/data/regions.json` — 原発の稼働状況が変わった場合
- `src/worker/data/foodSupply.json` — 食料自給率データの更新

**PRには出典（URL・発表日）を必ず記載してください。**

### 3. バグ報告

GitHub Issues でバグを報告してください。再現手順を含めてください。

### 4. 機能提案

GitHub Issues で提案してください。プロジェクトのミッション（エネルギー危機の可視化と市民の行動変容）に沿った提案を歓迎します。

## 開発環境

```bash
# 依存インストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build

# デプロイ（メンテナーのみ）
npm run deploy
```

**要件:** Node.js 20+ / npm 10+

## コーディング規約

- TypeScript strict mode
- `any` 禁止、`as` キャスト最小限
- 既存コードのスタイルに従う
- 未使用の import・変数は残さない
- 数値フォーマット: `Intl.NumberFormat('ja-JP')`
- D1 クエリはプリペアドステートメント必須

## ライセンス

コントリビューションは [AGPL-3.0](LICENSE) の下でライセンスされます。
