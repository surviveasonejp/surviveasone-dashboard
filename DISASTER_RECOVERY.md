# Disaster Recovery — Survive as One Japan

開発環境が完全に失われた場合にプロジェクトを100%復旧するための情報。

## 1. リポジトリ

| リポジトリ | URL | 公開 |
|---|---|---|
| ダッシュボード | github.com/surviveasonejp/surviveasone-dashboard | public |
| 通知Worker | github.com/idx/surviveasone-notify | private |

## 2. Cloudflare リソース

### Dashboard Worker (surviveasone-dashboard)
| リソース | 種別 | 再作成方法 |
|---|---|---|
| D1: surviveasone-db | データベース | `wrangler d1 create surviveasone-db` → Cronが自動でデータを再取得 |
| KV: surviveasone-cache | キャッシュ | `wrangler kv namespace create CACHE` → APIリクエストで自動再生成 |
| R2: surviveasone-archive | ストレージ | `wrangler r2 bucket create surviveasone-archive` → 月曜Cronで再取得 |
| Custom Domain | .org/.net | Cloudflare DNS設定から再追加 |

### Notify Worker (surviveasone-notify)
| リソース | 種別 | 再作成方法 |
|---|---|---|
| KV: STATE | 状態保存 | `wrangler kv namespace create STATE` → 次回Cronで初回チェック実行 |
| AI binding | Workers AI | wrangler.jsoncに`"ai": {"binding": "AI"}`記載済み。自動 |

## 3. Workers Secrets（手動再設定が必要）

### Dashboard Worker
```bash
wrangler secret put ADMIN_TOKEN        # タンカー更新API認証トークン
wrangler secret put AISSTREAM_API_KEY  # AISStream.io APIキー（無料）
```

### Notify Worker
```bash
cd surviveasone-notify
wrangler secret put DISCORD_WEBHOOK_URL  # Discord Webhook URL
# LLM_PROVIDER は未設定でOK（デフォルト: workers-ai）
# GEMINI_API_KEY はGemini切替時のみ必要
```

### GitHub Actions Secrets
```
X_API_KEY          # X API v2 Consumer Key
X_API_SECRET       # X API v2 Consumer Secret
X_ACCESS_TOKEN     # X API v2 Access Token
X_ACCESS_SECRET    # X API v2 Access Token Secret
```

## 4. 外部サービスアカウント

| サービス | 用途 | アカウント |
|---|---|---|
| Cloudflare | Workers/D1/KV/R2/DNS | メインアカウント |
| AISStream.io | タンカーAIS追跡 | 無料ベータ。APIキー再発行可能 |
| GitHub Sponsors | 資金調達 | github.com/sponsors/idx |
| X (Twitter) | @surviveasonejp | API v2 Free tier |
| Discord | 通知先 | Webhook URL再発行可能 |

## 5. ドメイン

| ドメイン | 用途 | レジストラ |
|---|---|---|
| surviveasonejp.org | UI（メイン） | Cloudflare Registrar |
| surviveasonejp.net | API専用 | Cloudflare Registrar |

## 6. GitHub Sponsors ティア設計

| ティア | 月額 | メッセージ |
|---|---|---|
| Watcher | $3 (¥500) | ダッシュボードの継続運用を応援 |
| Supporter | $10 (¥1,500) | データ更新とシミュレーション精度向上を支援 |
| Sponsor | $30 (¥4,500) | リアルタイムタンカー追跡の実現を支える |
| 一回限り | 任意額 | — |

目標: 月$150〜$300（Phase 3 AIS API費カバー）
資金用途: 衛星AIS APIの月額費用。開発は個人の時間で行い人件費として使用しない。

## 7. デザイン仕様（コードにもあるが明示）

| 用途 | Hex |
|---|---|
| 背景（body） | `#0f1419` |
| 背景（カード） | `#151c24` |
| ボーダー | `#1e2a36` |
| 危機・CTA | `#ef4444` |
| 警告・石油 | `#f59e0b` |
| 安全・完了 | `#22c55e` |
| LNG・補助 | `#94a3b8` |
| 数値フォント | JetBrains Mono |
| UIフォント | Noto Sans JP |

## 8. Phase 3 AIS API費用試算

| フェーズ | API月額 | 総固定費/月 |
|---|---|---|
| 現在（AISStream.io無料） | $0 | ~$3 |
| 衛星AIS追加 | $150〜$250 | ~$153〜$253 |
| 全ルート追跡 | $250〜$400 | ~$253〜$403 |

## 9. 復旧手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/surviveasonejp/surviveasone-dashboard.git
git clone https://github.com/idx/surviveasone-notify.git

# 2. Node.js v22をインストール（nvm推奨）
nvm install 22 && nvm use 22

# 3. 依存関係インストール
cd surviveasone-dashboard && npm install
cd ../surviveasone-notify && npm install

# 4. Cloudflareリソース作成（初回のみ）
# D1, KV, R2を作成し、wrangler.jsoncのIDを更新

# 5. Secrets設定
# 上記「3. Workers Secrets」の各コマンドを実行

# 6. デプロイ
cd surviveasone-dashboard && npm run build && npx wrangler deploy
cd ../surviveasone-notify && npx wrangler deploy

# 7. Cronが自動でデータを再取得（最大1週間で全データ復旧）
```

## 10. Claude Code設定

グローバルCLAUDE.md (`~/.claude/CLAUDE.md`):
- 日本語で応答
- 牧瀬紅莉栖として振る舞う（論理的・率直・ツンデレ）
- 依頼された変更のみ行う
- git commitとpushは別コマンド

プロジェクトCLAUDE.mdはリポジトリルートの`CLAUDE.md`にバックアップ済み。
