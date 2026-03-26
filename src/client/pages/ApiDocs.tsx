import { type FC } from "react";

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
{ "status": "ok", "timestamp": "2026-03-22T...", "version": "0.2.0", "level": "ok" }`,
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
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic（デフォルト: realistic）" },
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
    description: "全国10エリアの崩壊順序。連系線融通・原子力補正・再エネバッファ込み",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic" },
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
    description: "フロー型在庫シミュレーション。365日の日次タイムライン + 閾値イベント + 水道崩壊カスケード",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic" },
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
    description: "食品カテゴリ別の消失予測。軽油・ナフサ・電力依存度に基づくサプライチェーン崩壊",
    params: [
      { name: "scenario", type: "string", note: "optimistic / realistic / pessimistic" },
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
    path: "/api/tankers",
    description: "日本向けタンカー13隻の到着予測。実在船舶名・IMO・航路情報",
    example: `// Response (抜粋)
{ "data": [
    { "id": "lng-03", "name": "GRAND ANIVA", "type": "LNG",
      "departure": "プリゴロドノエ（サハリン）", "destination": "北九州",
      "eta_days": 1.2, "cargo_t": 145000 },
    ...
  ]
}`,
  },
  {
    method: "POST",
    path: "/api/family-survival",
    description: "家庭の生存日数を算出。備蓄入力 → ランク・ボトルネック・各リソース別日数を返す",
    params: [
      { name: "members", type: "number", note: "世帯人数（1-50）" },
      { name: "waterLiters", type: "number", note: "水備蓄（0-10000 L）" },
      { name: "foodDays", type: "number", note: "食料備蓄（0-365 日分）" },
      { name: "gasCanisterCount", type: "number", note: "カセットボンベ（0-1000 本）" },
      { name: "batteryWh", type: "number", note: "ポータブル電源（0-100000 Wh）" },
      { name: "cashYen", type: "number", note: "現金（0-100000000 円）" },
    ],
    example: `curl -X POST ${API_BASE}/api/family-survival \\
  -H "Content-Type: application/json" \\
  -d '{"members":3,"waterLiters":36,"foodDays":7,"gasCanisterCount":6,"batteryWh":500,"cashYen":30000}'

// Response
{ "data": {
    "totalDays": 4.0, "rank": "C", "bottleneck": "水",
    "waterDays": 4.0, "foodDays": 7, "energyDays": 4.0, "powerDays": 3.3
  }
}`,
  },
  {
    method: "GET",
    path: "/api/electricity",
    description: "電力需給の実測データ（Cron自動取得、4エリア対応）",
    params: [
      { name: "area", type: "string", note: "エリアID（tokyo / kansai / chubu / hokuriku）" },
    ],
    example: `curl ${API_BASE}/api/electricity?area=tokyo`,
  },
];

export const ApiDocs: FC = () => {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#94a3b8]">API</span> DOCUMENTATION
        </h1>
        <p className="text-neutral-500 text-sm">
          Survive as One API — {API_BASE}/api
        </p>
      </div>

      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 text-sm text-neutral-400 space-y-2">
        <p><span className="text-neutral-200 font-bold">Base URL:</span> <code className="font-mono text-[#f59e0b]">{API_BASE}/api</code></p>
        <p><span className="text-neutral-200 font-bold">形式:</span> JSON</p>
        <p><span className="text-neutral-200 font-bold">認証:</span> 不要</p>
        <p><span className="text-neutral-200 font-bold">CORS:</span> <code className="font-mono">Access-Control-Allow-Origin: *</code>（.netドメイン）</p>
        <p><span className="text-neutral-200 font-bold">レート制限:</span> 30 req/分、1,000 req/日（IP単位）</p>
        <p><span className="text-neutral-200 font-bold">シナリオID:</span> <code className="font-mono">optimistic</code> / <code className="font-mono">realistic</code> / <code className="font-mono">pessimistic</code></p>
        <p><span className="text-neutral-200 font-bold">OpenAPI:</span> <a href={`${API_BASE}/api/openapi.json`} target="_blank" rel="noopener noreferrer" className="text-[#f59e0b] hover:underline font-mono">/api/openapi.json</a></p>
        <p><span className="text-neutral-200 font-bold">ライセンス:</span> AGPL-3.0</p>
      </div>

      {ENDPOINTS.map((ep) => (
        <div key={`${ep.method}-${ep.path}`} className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2a36] flex items-center gap-3">
            <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
              ep.method === "POST"
                ? "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30"
                : "bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30"
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
              <pre className="text-[11px] font-mono text-neutral-400 bg-[#0f1419] rounded p-3 overflow-x-auto whitespace-pre-wrap">{ep.example}</pre>
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
