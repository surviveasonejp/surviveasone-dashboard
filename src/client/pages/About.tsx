import { type FC } from "react";
import { Link } from "react-router-dom";

const DATA_SOURCES_LIST = [
  { name: "資源エネルギー庁 石油備蓄統計", note: "国家・民間備蓄日数(2025年12月末)" },
  { name: "ISEP 電力調査統計", note: "火力発電依存率(2024年暦年速報)" },
  { name: "JETRO / 財務省 貿易統計", note: "LNGホルムズ依存率・輸入先(2025年実績)" },
  { name: "OWID energy-data", note: "石油・LNG消費量ベースライン" },
  { name: "OCCTO 電力広域的運営推進機関", note: "10エリア電力需給・連系線運用容量(2025年度)" },
  { name: "原子力規制委員会", note: "稼働原発一覧・設備利用率" },
  { name: "総務省 人口推計", note: "エリア別人口(2025年10月)" },
  { name: "石油連盟 製油所一覧", note: "製油所閉鎖・稼働状況" },
  { name: "Natural Earth 110m", note: "タンカーマップの大陸輪郭(Public Domain)" },
  { name: "公開船舶DB / 海運各社PR", note: "タンカー12隻の船名・IMO・航路データ" },
];

const PHASE_STATUS = [
  {
    phase: "Phase 1",
    label: "静的プロトタイプ",
    status: "completed",
    items: ["Survival Clock", "Collapse Map", "Dashboard", "備蓄ガイド", "Family Meter"],
  },
  {
    phase: "Phase 2",
    label: "データ基盤 + UX",
    status: "completed",
    items: ["D1/KV/R2", "OWID CSV→D1", "電力需給4エリア", "コアロジック分離", "AGPL-3.0"],
  },
  {
    phase: "Phase 2-D",
    label: "UX強化",
    status: "completed",
    items: ["OGP対応", "タンカーマップ", "UD配色", "ライト/ダーク切替", "PWA", "ドラッグスワイプ"],
  },
  {
    phase: "Phase 4",
    label: "シミュレーション高度化",
    status: "completed",
    items: ["フロー型モデル", "到着確率", "処理能力制約", "時間遅延", "段階的閾値", "シナリオ分岐", "連系線融通"],
  },
  {
    phase: "Phase 5",
    label: "精度向上（進行中）",
    status: "active",
    items: ["原子力の地域別寄与", "水道崩壊カスケード", "SPR放出メカニズム", "封鎖解除曲線", "需要弾力性"],
  },
  {
    phase: "Phase 3",
    label: "リアルタイム化（API費待ち）",
    status: "planned",
    items: ["AIS タンカー追跡", "残り6エリア電力", "JEPX電力価格", "e-Stat API"],
  },
];

const SIMULATION_FEATURES = [
  { label: "フロー型在庫モデル", desc: "dStock/dt = Inflow - Consumption。365日の日次在庫推移をシミュレート" },
  { label: "タンカー到着確率", desc: "P(到着) = 保険 × 航路 × 軍事リスク。ホルムズ経由船舶の到着確率を計算" },
  { label: "処理能力制約", desc: "supply = min(在庫, 製油所能力bpd / LNG再ガス化能力tpd)" },
  { label: "段階的崩壊閾値", desc: "50%→価格暴騰、30%→供給制限、10%→配給制、0%→完全停止" },
  { label: "3シナリオ分岐", desc: "楽観(遮断50%)・現実(遮断94%)・悲観(遮断100%+パニック買い)" },
  { label: "連系線融通", desc: "10本の地域間連系線による電力融通。OCCTO運用容量ベース・非対称容量対応" },
  { label: "原子力の地域別寄与", desc: "稼働原発14基の出力を地域別に反映。関西・九州の火力依存を大幅補正" },
  { label: "水道崩壊カスケード", desc: "電力停止→水圧低下(同日)→広域断水(+1日)→衛生崩壊(+3日)" },
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
          ホルムズ海峡封鎖時に日本のエネルギーがどう崩壊するかを可視化し、市民の生存判断を支援する戦術ダッシュボード。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          正常性バイアスを破壊する。数字を突きつけ、行動を促す。
          「情報を見る」画面ではなく「生き残るための判断を下す」画面を作る。
        </p>
      </div>

      {/* なぜホルムズ海峡か */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">なぜホルムズ海峡か</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>日本の石油輸入の<span className="text-[#f59e0b] font-mono font-bold">94%</span>が中東依存。そのほぼ全量がホルムズ海峡を通過する。</p>
          <p>LNGもカタール・UAEからの輸入分（<span className="text-[#f59e0b] font-mono font-bold">6.3%</span>）がホルムズ経由。</p>
          <p>封鎖が長期化すれば、電力（火力83%依存）→物流→食料供給→水道が連鎖停止する。</p>
          <p className="text-neutral-500 text-xs">※ 石油備蓄254日分は資源エネルギー庁2025年12月末統計。LNGは約25日分の在庫。</p>
        </div>
      </div>

      {/* シミュレーション仕様 */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e2a36]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">シミュレーション仕様</h2>
        </div>
        <div className="divide-y divide-[#162029]">
          {SIMULATION_FEATURES.map((f) => (
            <div key={f.label} className="px-4 py-3">
              <div className="text-sm font-bold text-neutral-300">{f.label}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{f.desc}</div>
            </div>
          ))}
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
              <span className="text-sm text-neutral-300 sm:w-64 shrink-0">{ds.name}</span>
              <span className="text-xs text-neutral-500">{ds.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 開発フェーズ */}
      <div className="space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">開発フェーズ</h2>
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
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-neutral-300">{p.phase}</span>
                  <span className="text-xs text-neutral-500">{p.label}</span>
                  {p.status === "completed" && (
                    <span className="text-xs font-mono text-[#22c55e]">LIVE</span>
                  )}
                  {p.status === "active" && (
                    <span className="text-xs font-mono text-[#f59e0b]">IN PROGRESS</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.items.map((item) => (
                    <span
                      key={item}
                      className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor:
                          p.status === "completed" ? "#22c55e15"
                          : p.status === "active" ? "#f59e0b15"
                          : "#1e2a36",
                        color:
                          p.status === "completed" ? "#22c55e"
                          : p.status === "active" ? "#f59e0b"
                          : "#555",
                        border: `1px solid ${
                          p.status === "completed" ? "#22c55e30"
                          : p.status === "active" ? "#f59e0b30"
                          : "#333"
                        }`,
                      }}
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
          {["Cloudflare Workers", "D1", "KV", "R2", "React 19", "TypeScript", "Vite", "Tailwind CSS 4", "PWA"].map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded font-mono bg-[#1e2a36] text-neutral-400 border border-[#1e2a36]">
              {t}
            </span>
          ))}
        </div>
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
        本シミュレーションは公開データに基づく推定値です。実際の備蓄運用は政府判断により変動します。
      </p>
    </div>
  );
};
