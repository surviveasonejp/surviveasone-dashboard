import { type FC } from "react";
import { PageHero } from "../components/PageHero";

const API_BASE = "https://surviveasonejp.net";

interface EndpointDoc {
  method: string;
  path: string;
  description: string;
  params?: { name: string; type: string; note: string }[];
  example: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: "GET",
    path: "/api",
    description: "エンドポイント一覧をJSON形式で取得",
    example: `curl ${API_BASE}/api`,
  },
  {
    method: "GET",
    path: "/api/health",
    description: "ヘルスチェック。サーバー稼働状況とバージョンを返す",
    example: `// Response
{ "status": "ok", "timestamp": "2026-03-28T...", "version": "0.3.0", "level": "ok" }`,
  },
  {
    method: "GET",
    path: "/api/reserves",
    description: "石油・LNG備蓄データ。国家/民間/産油国共同の内訳、ホルムズ依存率、火力比率を含む",
    example: `// Response (抜粋)
{ "data": {
    "oil_total_kL": 71330000,
    "oil_total_days": 241,
    "oil_hormuz_rate": 0.94,
    "lng_inventory_t": 4500000,
    "lng_hormuz_rate": 0.063,
    "thermal_share": 0.65
  }
}`,
  },
  {
    method: "GET",
    path: "/api/consumption",
    description: "石油・LNGの日次消費量",
    example: `// Response (抜粋)
{ "data": { "oil_daily_kL": 293151, "lng_daily_t": 180000 } }`,
  },
  {
    method: "GET",
    path: "/api/regions",
    description: "全国10電力エリアのパラメータ。原子力・再エネ容量・連系線・製油所能力を含む",
    example: `// Response (抜粋)
{ "data": [
    { "id": "hokkaido", "name": "北海道", "population": 5050000,
      "nuclearCapacity_MW": 0, "interconnection_kW": 900000, ... },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/countdowns",
    description: "石油/LNG/電力の残存日数カウントダウン",
    params: [
      { name: "scenario", type: "string", note: "optimistic（国際協調） / realistic（標準対応） / pessimistic（需要超過） / ceasefire（停戦・回復）（デフォルト: realistic）" },
    ],
    example: `curl ${API_BASE}/api/countdowns?scenario=realistic

// Response
{ "data": [
    { "label": "石油備蓄", "totalDays": 168.8, "alertLevel": "safe" },
    { "label": "LNG在庫", "totalDays": 750.4, "alertLevel": "safe" },
    { "label": "電力供給", "totalDays": 487.8, "alertLevel": "safe" }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/collapse",
    description: "全国10エリアの供給制約順序。連系線融通・原子力補正・再エネバッファ込み",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic / ceasefire" },
    ],
    example: `curl ${API_BASE}/api/collapse?scenario=realistic

// Response (抜粋)
{ "data": [
    { "id": "okinawa", "name": "沖縄", "collapseDays": 15.2,
      "oilDepletionDays": 22.8, "lngDepletionDays": 20.5,
      "powerCollapseDays": 15.2, "interconnectionBonusDays": 0 },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/simulation",
    description: "フロー型在庫シミュレーション。365日の日次タイムライン + 閾値イベント + 水道カスケード",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic / ceasefire" },
      { name: "maxDays", type: "number", note: "シミュレーション日数（デフォルト: 365、最大: 730）" },
    ],
    example: `curl ${API_BASE}/api/simulation?scenario=realistic&maxDays=365

// Response (抜粋)
{ "data": {
    "oilDepletionDay": 180,
    "lngDepletionDay": 25,
    "powerCollapseDay": 16,
    "timeline": [ { "day": 0, "oilStock_kL": 74460000, ... }, ... ],
    "thresholds": [ { "day": 14, "type": "price_spike", "label": "国家備蓄 放出開始" }, ... ]
  }
}`,
  },
  {
    method: "GET",
    path: "/api/food-collapse",
    description: "食品カテゴリ別の在庫日数予測。軽油・ナフサ・電力依存度に基づく供給制約モデル",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic / ceasefire" },
      { name: "region", type: "string", note: "エリアID（例: tokyo）。省略時は全国" },
    ],
    example: `// Response (抜粋)
{ "data": [
    { "id": "frozen", "name": "冷凍食品", "collapseDays": 3.2 },
    { "id": "milk", "name": "牛乳・乳製品", "collapseDays": 5.1 },
    { "id": "rice", "name": "米", "collapseDays": 142.8 },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/oil-price",
    description: "WTI原油スポット価格（EIA RWTC API 日次自動取得）。経済カスケードシミュレーションの基準価格として使用",
    example: `curl ${API_BASE}/api/oil-price

// Response
{ "wti_usd": 68.42, "date": "2026-04-07",
  "updatedAt": "2026-04-08T18:30:00Z",
  "source": "EIA RWTC WTI Spot Price", "cache": "hit" }`,
  },
  {
    method: "GET",
    path: "/api/tankers",
    description: "タンカー30隻（VLCC13+LNG14+Chemical1+Suezmax2）の到着予測。IMO・AIS追跡状態・航路・供給元カテゴリ・ETA自動補正・ホルムズ通過フラグ・引き返しフラグを含む",
    example: `// Response (抜粋)
{ "data": [
    { "id": "lng-03", "name": "GRAND ANIVA", "type": "LNG",
      "imo": "9338955", "aisTracked": true,
      "departure": "プリゴロドノエ（サハリン）", "destination": "北九州",
      "eta_days": 1.2, "cargo_t": 145000,
      "isHormuzDependent": false, "isJapanBound": true },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/ais",
    description: "AIS生データ（最新取得分）。IMOキー・位置・速度・目的港・日本向け判定を含む。日次2回（UTC 06:00/18:00）自動更新",
    example: `curl ${API_BASE}/api/ais

// Response (抜粋)
{ "data": { "9338955": { "imo": "9338955", "lat": 33.5, "lon": 130.2,
    "sog": 14.2, "destination": "KITAKYUSHU", "isJapanBound": true,
    "etaDays": 0.8, "updatedAt": "2026-04-08T06:12:00Z" } },
  "count": 14 }`,
  },
  {
    method: "GET",
    path: "/api/electricity",
    description: "電力需給の実測データ（Cron日次自動取得、全10エリア対応）",
    params: [
      { name: "area", type: "string", note: "エリアID（hokkaido / tohoku / tokyo / chubu / hokuriku / kansai / chugoku / shikoku / kyushu / okinawa）" },
    ],
    example: `curl ${API_BASE}/api/electricity?area=tokyo`,
  },
  {
    method: "GET",
    path: "/api/summary",
    description: "プレーンテキスト概要。LLM・クローラー・研究者向け。Content-Type: text/plain",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic / ceasefire" },
    ],
    example: `curl ${API_BASE}/api/summary?scenario=realistic

// Response (text/plain)
=== Survive as One Japan — エネルギー備蓄シミュレーション ===
シナリオ: 標準対応（現実的な政策対応）
--- 備蓄残存日数 ---
石油備蓄: 168.8日
LNG在庫: 750.4日
...`,
  },
  {
    method: "GET",
    path: "/api/simulate",
    description: "シミュレーション要約。/api/simulation の軽量版。制約到達日・主要イベント・備蓄データをコンパクトに返す",
    params: [
      { name: "scenario", type: "string", note: "optimistic（国際協調） / realistic（標準対応） / pessimistic（需要超過） / ceasefire（停戦・回復）" },
    ],
    example: `curl ${API_BASE}/api/simulate?scenario=realistic

// Response (抜粋)
{ "scenario": { "id": "realistic", "label": "標準対応", ... },
  "result": { "oilDepletionDay": 180, "lngDepletionDay": 25, "powerCollapseDay": 16 },
  "events": [ { "day": 14, "label": "国家備蓄 放出開始" }, ... ],
  "reserves": { "oil": { "totalDays": 241 }, ... }
}`,
  },
  {
    method: "GET",
    path: "/api/petrochemtree",
    description: "石化サプライチェーン樹形図の全ノードデータ。7カテゴリ（feedstock/refinery/cracker/monomer/polymer/product/end_use）・エッジ・収率データを含む",
    example: `curl ${API_BASE}/api/petrochemtree

// Response (抜粋)
{ "nodes": [
    { "id": "naphtha", "label": "ナフサ", "category": "feedstock",
      "stockDays": 14, "hormuzDependency": 0.94 },
    { "id": "ethylene", "label": "エチレン", "category": "monomer",
      "yieldRate": 0.30, "altFeed": ["coal_mto", "ethane"] },
    ...
  ],
  "edges": [ { "from": "naphtha", "to": "cracker", "yieldRate": 1.0 }, ... ],
  "downstreamBufferDays": 105
}`,
  },
  {
    method: "GET",
    path: "/api/petrochemtree/risk",
    description: "石化樹形図の各ノードにシナリオ別リスクスコアを付与。供給制約の進行度（0–1）・制約フラグ・制約到達日を含む",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic / ceasefire" },
      { name: "day", type: "number", note: "シミュレーション日数（デフォルト: 0）" },
    ],
    example: `curl ${API_BASE}/api/petrochemtree/risk?scenario=realistic

// Response (抜粋)
{ "scenario": "realistic",
  "nodes": [
    { "id": "naphtha", "riskScore": 0.72, "collapsed": false, "collapseDay": 42 },
    { "id": "polyethylene", "riskScore": 0.31, "collapsed": false, "collapseDay": 105 },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/methodology",
    description: "16の計算モデル・前提パラメータ・信頼度スコア・データソースのメタデータ。研究・検証用途向け",
    example: `curl ${API_BASE}/api/methodology

// Response (抜粋)
{ "models": [
    { "id": "flow_inventory", "label": "フロー型在庫モデル",
      "formula": "dStock/dt = Inflow - Consumption + SPR + Alt",
      "confidence": "verified" },
    ...
  ],
  "parameters": [ { "key": "hormuzDependencyRate", "value": 0.94, "source": "JETRO 2025" }, ... ]
}`,
  },
  {
    method: "GET",
    path: "/api/validation",
    description: "シミュレーション予測 vs 実際の出来事の照合結果。発生33日間の検証レポート",
    example: `curl ${API_BASE}/api/validation

// Response (抜粋)
{ "validationDate": "2026-04-03",
  "items": [
    { "category": "代替供給", "predicted": "28日目に代替ルート到着",
      "actual": "3月28日今治沖到着確認", "verdict": "match" },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/sources",
    description: "全データソースの一覧。ソース名・更新頻度・自動/手動区分・信頼度を含む",
    example: `curl ${API_BASE}/api/sources

// Response (抜粋)
{ "sources": [
    { "id": "meti_reserves", "name": "経産省 石油備蓄推計量",
      "auto": true, "frequency": "monthly", "confidence": "verified" },
    { "id": "eia_wti", "name": "EIA RWTC WTI Spot Price",
      "auto": true, "frequency": "daily", "confidence": "verified" },
    ...
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/docs",
    description: "APIドキュメント（HTMLフォーマット）。ブラウザで閲覧可能なAPI仕様書",
    example: `curl ${API_BASE}/api/docs`,
  },
  {
    method: "GET",
    path: "/api/data",
    description: "全データソース概要（HTMLフォーマット）。研究者・クローラー向け。全データソースの一覧と現在値を提供",
    example: `curl ${API_BASE}/api/data`,
  },
  {
    method: "GET",
    path: "/api/openapi.json",
    description: "OpenAPI 3.0仕様JSON。Swagger UI・Postman・その他API クライアントへのインポートに使用",
    example: `curl ${API_BASE}/api/openapi.json`,
  },
];

export const ApiDocs: FC = () => {
  return (
    <div className="space-y-8 max-w-3xl">
      <PageHero
        title={<><span className="text-[#94a3b8]">API</span> DOCUMENTATION</>}
        subtitle={`SAO – Situation Awareness Observatory API — ${API_BASE}/api`}
      />

      <div className="bg-panel border border-border rounded-lg p-4 text-sm text-neutral-400 space-y-2">
        <p><span className="text-neutral-200 font-bold">Base URL:</span> <code className="font-mono text-warning-soft">{API_BASE}/api</code></p>
        <p><span className="text-neutral-200 font-bold">形式:</span> JSON</p>
        <p><span className="text-neutral-200 font-bold">認証:</span> 不要</p>
        <p><span className="text-neutral-200 font-bold">CORS:</span> <code className="font-mono">Access-Control-Allow-Origin: *</code>（.netドメイン）</p>
        <p><span className="text-neutral-200 font-bold">レート制限:</span> 30 req/分、1,000 req/日（IP単位）。グローバル上限: 100,000 req/日</p>
        <p><span className="text-neutral-200 font-bold">シナリオID:</span> <code className="font-mono">optimistic</code>（国際協調） / <code className="font-mono">realistic</code>（標準対応） / <code className="font-mono">pessimistic</code>（需要超過） / <code className="font-mono">ceasefire</code>（停戦・回復）</p>
        <p><span className="text-neutral-200 font-bold">OpenAPI:</span> <a href={`${API_BASE}/api/openapi.json`} target="_blank" rel="noopener noreferrer" className="text-warning-soft hover:underline font-mono">/api/openapi.json</a></p>
        <p><span className="text-neutral-200 font-bold">ライセンス:</span> AGPL-3.0</p>
      </div>

      {ENDPOINTS.map((ep) => (
        <div key={`${ep.method}-${ep.path}`} className="bg-panel border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-3">
            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
              ep.method === "POST"
                ? "bg-warning-soft/15 text-warning-soft border border-warning-soft/30"
                : "bg-success-soft/15 text-success-soft border border-success-soft/30"
            }`}>
              {ep.method}
            </span>
            <code className="font-mono text-sm text-neutral-200">{ep.path}</code>
          </div>
          <div className="px-4 py-3 space-y-3">
            <p className="text-sm text-neutral-400">{ep.description}</p>
            {ep.params && (
              <div>
                <h4 className="text-xs font-mono text-neutral-500 mb-1">パラメータ</h4>
                <div className="space-y-1">
                  {ep.params.map((p) => (
                    <div key={p.name} className="flex gap-2 text-xs">
                      <code className="font-mono text-[#94a3b8] shrink-0">{p.name}</code>
                      <span className="text-neutral-600">({p.type})</span>
                      <span className="text-neutral-500">{p.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="text-xs font-mono text-neutral-500 mb-1">例</h4>
              <pre className="text-[11px] font-mono text-neutral-400 bg-bg rounded p-3 overflow-x-auto whitespace-pre-wrap">{ep.example}</pre>
            </div>
          </div>
        </div>
      ))}

      <p className="text-xs text-neutral-600 font-mono">
        ソースコード: github.com/surviveasonejp/surviveasone-dashboard（AGPL-3.0）
      </p>
    </div>
  );
};
