# Security Policy

## 報告先

脆弱性を発見した場合は、**公開issueではなく**以下のいずれかで報告してください:

1. **GitHub Security Advisories（推奨）**:
   <https://github.com/surviveasonejp/surviveasone-dashboard/security/advisories/new>
2. **メール**: kazuhiko.ido [at] gmail.com

報告には以下を含めていただけると助かります:

- 影響を受ける箇所（URL・パス・コンポーネント）
- 再現手順
- 想定される影響範囲
- 可能であればPoC（破壊的でないもの）

## 対応方針

- 受領後72時間以内に初動応答
- 重大度（CVSS基準）に応じて修正優先度を決定
- 修正リリース後にCredit欄に報告者を記載（希望者のみ）
- AGPL-3.0プロジェクトのため修正パッチは公開コミットとして反映

## サポート対象バージョン

`main` ブランチの最新コミットのみサポート。本プロジェクトはローリングリリースで、surviveasonejp.org / surviveasonejp.net に常時デプロイされる最新版が対象です。

## 既知のスコープ外

- DoS（クォータ超過誘発・無料枠枯渇狙い）→ Workerに7層防御を実装済み（`bot-guard.ts` / `rate-limit.ts` / `quota-guard.ts` 等）
- ソーシャルエンジニアリング・物理攻撃
- third-partyサービス（Cloudflare・GitHub Actions・AISStream.io・e-Stat API等）の脆弱性 → 各サービス提供元へ直接報告してください

## 過去の対応実績

- 2026-04-12: セキュリティ監査 — CRITICAL 0 / HIGH 3全修正済み
- 2026-04-25: シークレット管理ベースライン整備（PR #3）・GitHub Actions最小権限化（PR #2）

## 参考

- `.well-known/security.txt`: <https://surviveasonejp.org/.well-known/security.txt>
- License: AGPL-3.0
