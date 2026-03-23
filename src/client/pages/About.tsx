import { type FC } from "react";
import { Link } from "react-router-dom";
import staticReserves from "../data/reserves.json";

const DATA_SOURCES_LIST = [
  { name: "経産省 石油備蓄推計量", note: `国家・民間・産油国共同備蓄日数(${staticReserves.meta.baselineDate}時点)`, auto: true },
  { name: "ISEP 電力調査統計", note: "火力発電依存率(2024年暦年速報)", auto: false },
  { name: "JETRO / 財務省 貿易統計", note: "LNGホルムズ依存率・輸入先(2025年実績)", auto: false },
  { name: "OWID energy-data", note: "石油・LNG消費量ベースライン", auto: true },
  { name: "10電力エリアCSV/JSON", note: "電力需給実測データ(全10エリア)", auto: true },
  { name: "OCCTO 電力広域的運営推進機関", note: "連系線運用容量10本(2025年度)", auto: false },
  { name: "原子力規制委員会", note: "稼働原発14基・設備利用率", auto: false },
  { name: "公開船舶DB / 海運各社PR", note: "タンカー12隻の船名・IMO・航路(2026年3月検証済)", auto: false },
  { name: "化学日報", note: "石化産業減産状況(2026年3月19日報道)", auto: false },
];

const PHASE_STATUS = [
  {
    phase: "Phase 1-2",
    label: "基盤構築",
    status: "completed" as const,
    items: ["全9ページ", "D1/KV/R2", "API 12本", "コアロジック分離", "PWA", "AGPL-3.0"],
  },
  {
    phase: "Phase 4",
    label: "シミュレーション高度化",
    status: "completed" as const,
    items: ["フロー型モデル", "到着確率", "処理能力制約", "段階的閾値", "3シナリオ分岐", "連系線融通"],
  },
  {
    phase: "Phase 5",
    label: "精度向上（8/10完了）",
    status: "active" as const,
    items: ["原子力地域別寄与", "水道崩壊カスケード", "SPR放出", "封鎖解除曲線", "需要破壊", "再エネバッファ", "食料サプライチェーン", "歴史データ対比"],
    remaining: ["代替供給ルート", "経済カスケード"],
  },
  {
    phase: "Phase 6",
    label: "データ自動化・精度維持",
    status: "active" as const,
    items: ["石油備蓄月次自動更新", "電力需給日次取得", "OWID週次取得", "タンカーIMO検証済", "ハードコード値根絶", "データ鮮度監視"],
    remaining: ["RSSニュース監視", "LNG在庫自動更新"],
  },
  {
    phase: "Phase 3",
    label: "リアルタイム化（計画中）",
    status: "planned" as const,
    items: ["AISタンカー追跡", "原油価格自動取得", "3シナリオレンジ表示", "感度分析", "モデル検証ログ"],
  },
];

const SIMULATION_FEATURES = [
  { label: "フロー型在庫モデル", desc: "dStock/dt = Inflow - Consumption + SPR_Release。365日の日次在庫推移をシミュレート" },
  { label: "SPR放出メカニズム", desc: "国家備蓄: リードタイム14日 + 日次30万kL上限。民間: 実質70%利用可能。産油国共同: 悲観では利用不可" },
  { label: "封鎖解除曲線", desc: "楽観: 7日→30日で解除(残留10%) / 現実: 30日→120日(残留30%) / 悲観: 90日→365日(残留60%)" },
  { label: "需要破壊モデリング", desc: "在庫残量に連動した動的消費削減。50%超: 通常 / 30-50%: 産業15%減 / 10-30%: 35%減 / 10%未満: 55%減" },
  { label: "段階的崩壊閾値", desc: "50%→価格暴騰、30%→供給制限(配給0.7倍)、10%→配給制(0.4倍)、0%→完全停止" },
  { label: "3シナリオ分岐", desc: "楽観(遮断50%)・現実(遮断94%)・悲観(遮断100%+パニック買い)" },
  { label: "原子力の地域別寄与", desc: "稼働14基の出力を地域別に反映。設備利用率80%。関西は原発7基で火力依存が大幅低下" },
  { label: "再エネバッファ", desc: "太陽光CF15%+風力CF22%+水力CF35%。蓄電池なしの限界として最大40%カバーに制限" },
  { label: "連系線融通", desc: "OCCTO運用容量ベースの10本。非対称容量対応。3回反復で多段融通を安定化" },
  { label: "水道崩壊カスケード", desc: "電力停止→水圧低下(同日)→広域断水(+1日)→衛生崩壊(+3日)" },
  { label: "食料サプライチェーン", desc: "ナフサ→石化製品(PE/PP/PS/PVC)→包装材の連鎖崩壊。化学日報報道に基づくnapthaFactor設定" },
];

export const About: FC = () => {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ef4444]">ABOUT</span> THIS PROJECT
        </h1>
        <p className="text-neutral-500 text-sm">
          Survive as One Japan — プロジェクト概要
        </p>
      </div>

      {/* ミッション */}
      <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#ef4444]">MISSION</h2>
        <p className="text-neutral-300 leading-relaxed">
          ホルムズ海峡封鎖時に日本のエネルギー・食料・水道がどう連鎖崩壊するかを可視化し、市民の生存判断を支援する戦術ダッシュボード。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          公開統計データに基づく11の計算モデルと3つのシナリオで分析。
          予測ではなくリスクシナリオのシミュレーションとして、不確実性を含めて透明に提示する。
        </p>
      </div>

      {/* なぜホルムズ海峡か */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">なぜホルムズ海峡か</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>日本の原油輸入の<span className="text-[#f59e0b] font-mono font-bold">94%</span>が中東依存。うち<span className="text-[#f59e0b] font-mono font-bold">93%</span>がホルムズ海峡を通過する。</p>
          <p>封鎖が長期化すれば、火力発電（LNG29%+石炭28%+石油7%=全体の65%）への燃料供給が影響を受け、電力→石化製品→物流→食料→水道が連鎖的に崩壊する。</p>
          <p className="text-neutral-500 text-xs">{`※ 石油備蓄${staticReserves.oil.totalReserveDays}日分（経産省${staticReserves.meta.baselineDate}時点推計）。LNG在庫は約25日分でホルムズ直接依存は6.3%だが、保険・海運市場への波及で非依存ルートにも影響し得る。`}</p>
        </div>
      </div>

      {/* データの信頼性 */}
      <div className="bg-[#151c24] border border-[#22c55e]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#22c55e]">データの信頼性</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>全ての入力データは<span className="text-neutral-200 font-bold">政府統計・公開データ</span>に基づいています。</p>
          <ul className="space-y-1.5 text-xs text-neutral-500">
            <li>・石油備蓄・電力需給・消費量データは<span className="text-[#22c55e]">自動パイプライン</span>で定期更新（月次/日次/週次）</li>
            <li>・データの基準日と経過日数をUI上に常時表示し、鮮度を可視化</li>
            <li>・タンカー12隻のIMO番号は2026年3月時点で公開DBと照合検証済み</li>
            <li>・石化産業への波及モデルは化学日報(2026年3月19日)の実報道に基づくパラメータ設定</li>
            <li>・ハードコード値を排除し、reserves.jsonからの動的参照に統一。データ更新が全ページに即時反映</li>
          </ul>
        </div>
      </div>

      {/* シミュレーション仕様 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">シミュレーション仕様（全11モデル）</h2>
        </div>
        <div className="divide-y divide-[#162029]">
          {SIMULATION_FEATURES.map((f) => (
            <div key={f.label} className="px-4 py-3">
              <div className="text-sm font-bold text-neutral-300">{f.label}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#1e2a36]">
          <Link
            to="/methodology"
            className="inline-block px-4 py-2 border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b]/10 font-mono text-xs tracking-wider rounded transition-colors"
          >
            計算式・前提条件の詳細 &rarr;
          </Link>
        </div>
      </div>

      {/* 前提条件と制約 */}
      <div className="bg-[#151c24] border border-[#f59e0b]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#f59e0b]">制約と不確実性</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>本シミュレーションは<span className="text-neutral-200 font-bold">リスクシナリオの可視化</span>であり、予測ではありません。</p>
          <ul className="space-y-1.5 text-xs text-neutral-500">
            <li>{`・石油備蓄${staticReserves.oil.totalReserveDays}日分は国際的に充実した水準。実際にはIEA協調放出・代替ルート確保等の対応が取られる`}</li>
            <li>・代替供給ルート（喜望峰迂回+10-15日、インド・アフリカ代替調達）は未実装。現モデルは悲観寄りの前提</li>
            <li>・経済カスケード効果（GDP・為替・物価への波及）は未実装</li>
            <li>・再エネの季節変動（太陽光は夏:冬=2:1）・蓄電池モデルは未反映</li>
            <li>・需要破壊モデルの価格弾力性は1973年石油ショックの近似であり、現代の経済構造との差異がある</li>
          </ul>
        </div>
      </div>

      {/* データソース */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">データソース</h2>
        </div>
        <div className="divide-y divide-[#162029]">
          {DATA_SOURCES_LIST.map((ds) => (
            <div key={ds.name} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span className="text-sm text-neutral-300 sm:w-56 shrink-0 flex items-center gap-1.5">
                {ds.name}
                {ds.auto && (
                  <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">
                    AUTO
                  </span>
                )}
              </span>
              <span className="text-xs text-neutral-500">{ds.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 開発フェーズ */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">開発ロードマップ</h2>
        <div className="space-y-3">
          {PHASE_STATUS.map((p) => (
            <div
              key={p.phase}
              className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 flex gap-4"
            >
              <div className="shrink-0 pt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                    p.status === "completed"
                      ? "bg-[#22c55e]"
                      : p.status === "active"
                        ? "bg-[#f59e0b]"
                        : "bg-[#1e2a36]"
                  }`}
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-neutral-300">{p.phase}</span>
                  <span className="text-xs text-neutral-500">{p.label}</span>
                  {p.status === "completed" && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] border border-[#22c55e]/30">LIVE</span>
                  )}
                  {p.status === "active" && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30">IN PROGRESS</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.items.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor:
                          p.status === "completed" ? "#22c55e12"
                          : p.status === "active" ? "#f59e0b12"
                          : "#1e2a36",
                        color:
                          p.status === "completed" ? "#22c55e"
                          : p.status === "active" ? "#f59e0b"
                          : "#555",
                      }}
                    >
                      {item}
                    </span>
                  ))}
                  {"remaining" in p && p.remaining?.map((item) => (
                    <span
                      key={item}
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-[#1e2a36] text-neutral-600 border border-[#333] border-dashed"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 技術スタック */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">TECH STACK</h2>
        <div className="flex flex-wrap gap-2">
          {["Cloudflare Workers", "D1", "KV", "R2", "Cron Triggers", "React 19", "TypeScript", "Vite", "Tailwind CSS 4", "PWA"].map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded font-mono bg-[#1e2a36] text-neutral-400 border border-[#1e2a36]">
              {t}
            </span>
          ))}
        </div>
        <div className="text-xs text-neutral-600 font-mono space-y-0.5">
          <p>Cronパイプライン: 3/5枠使用（OWID週次 + 電力日次 + 石油備蓄月次）</p>
          <p>インフラ月額: ~$3（ドメイン2件のみ。Cloudflare全スタック無料枠）</p>
        </div>
      </div>

      {/* 支援 */}
      <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-6 space-y-4">
        <h2 className="font-mono text-sm tracking-wider text-[#ef4444]">SUPPORT THIS PROJECT</h2>
        <p className="text-neutral-300 text-sm leading-relaxed">
          広告なしのオープンソースプロジェクトです。スポンサーシップはリアルタイムタンカー追跡（AIS API）と代替供給ルートモデルの実現に直接使われます。
        </p>
        <div className="text-xs text-neutral-500 space-y-1 font-mono">
          <p>$0〜$36/月 → チョークポイント監視開始</p>
          <p>$150/月 → 衛星AIS追加、外洋タンカー追跡</p>
          <p>$300/月 → 全ルート40〜55隻のリアルタイム追跡</p>
        </div>
        <a
          href="https://github.com/sponsors/idx"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2 bg-[#ef4444] hover:bg-[#ef4444]/80 text-white font-mono text-xs tracking-wider rounded transition-colors"
        >
          GitHub Sponsors で支援する &rarr;
        </a>
      </div>

      {/* リンク */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">LINKS</h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">GitHub</span>
            <a href="https://github.com/surviveasonejp" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-200 transition-colors">github.com/surviveasonejp</a>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">API</span>
            <a href="https://surviveasonejp.net/api" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-200 transition-colors">surviveasonejp.net/api</a>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">X</span>
            <a href="https://x.com/surviveasonejp" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-200 transition-colors">@surviveasonejp</a>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">License</span>
            <span className="text-neutral-400">AGPL-3.0（商用は個別ライセンス）</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/methodology"
          className="px-4 py-2 border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b]/10 font-mono text-xs tracking-wider rounded transition-colors"
        >
          METHODOLOGY &rarr;
        </Link>
        <Link
          to="/prepare"
          className="px-4 py-2 border border-[#22c55e] text-[#22c55e] hover:bg-[#22c55e]/10 font-mono text-xs tracking-wider rounded transition-colors"
        >
          SURVIVAL GUIDE &rarr;
        </Link>
        <Link
          to="/dashboard"
          className="px-4 py-2 border border-[#1e2a36] text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          DASHBOARD &rarr;
        </Link>
      </div>

      <p className="text-xs text-neutral-600 font-mono">
        本シミュレーションは公開データに基づくリスクシナリオの推定値です。予測ではありません。実際の備蓄運用は政府判断により変動します。
      </p>
    </div>
  );
};
