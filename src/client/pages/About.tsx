import { type FC } from "react";
import { Link } from "react-router-dom";

const DATA_SOURCES_LIST = [
  { name: "資源エネルギー庁 石油備蓄統計", url: "https://www.enecho.meti.go.jp/", note: "国家・民間備蓄日数" },
  { name: "ISEP 電力調査統計", url: "https://isep.or.jp/", note: "火力発電依存率(2024年暦年速報)" },
  { name: "JETRO 貿易統計", url: "https://www.jetro.go.jp/", note: "LNGホルムズ依存率(2025年実績)" },
  { name: "財務省 貿易統計", url: "https://www.customs.go.jp/toukei/info/", note: "LNG輸入量・輸入先(2025年)" },
  { name: "OWID energy-data", url: "https://github.com/owid/energy-data", note: "石油・LNG消費量ベースライン" },
  { name: "OCCTO 電力需給", url: "https://www.occto.or.jp/", note: "全国10エリア電力需給" },
  { name: "総務省 人口推計", url: "https://www.stat.go.jp/", note: "エリア別人口(2025年10月)" },
  { name: "石油連盟 製油所一覧", url: "https://www.paj.gr.jp/", note: "製油所閉鎖・稼働状況" },
];

const PHASE_STATUS = [
  {
    phase: "Phase 1",
    label: "静的プロトタイプ",
    status: "completed",
    items: ["Survival Clock", "Collapse Map", "統合Dashboard", "備蓄ガイド", "プロジェクト概要"],
  },
  {
    phase: "Phase 2",
    label: "データ接続",
    status: "planned",
    items: ["OWID CSV取得 → D1格納", "e-Stat API連携", "OCCTO需給データ", "各電力会社データ", "KV/R2キャッシュ"],
  },
  {
    phase: "Phase 3",
    label: "リアルタイム化",
    status: "planned",
    items: ["MarineTraffic AIS連携", "JEPX電力価格フィード", "WebSocket更新", "Last Tanker Tracker", "Food Chain Collapse"],
  },
];

export const About: FC = () => {
  return (
    <div className="space-y-8 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-mono">
          <span className="text-[#ff1744]">ABOUT</span> THIS PROJECT
        </h1>
        <p className="text-neutral-500 text-sm">
          Survive as One Japan — プロジェクト概要
        </p>
      </div>

      {/* ミッション */}
      <div className="bg-[#141414] border border-[#ff1744]/30 rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-[#ff1744]">MISSION</h2>
        <p className="text-neutral-300 leading-relaxed">
          ホルムズ海峡封鎖時に日本のエネルギーがどう崩壊するかを可視化し、市民の生存判断を支援する戦術ダッシュボード。
        </p>
        <p className="text-neutral-400 text-sm leading-relaxed">
          正常性バイアスを破壊する。数字を突きつけ、行動を促す。
          「情報を見る」画面ではなく「生き残るための判断を下す」画面を作る。
        </p>
      </div>

      {/* なぜホルムズ海峡か */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">なぜホルムズ海峡か</h2>
        <div className="space-y-2 text-sm text-neutral-400 leading-relaxed">
          <p>日本の石油輸入の<span className="text-[#ff9100] font-mono font-bold">94%</span>が中東依存。そのほぼ全量がホルムズ海峡を通過する。</p>
          <p>LNGもカタール・UAEからの輸入分（<span className="text-[#ff9100] font-mono font-bold">6.3%</span>）がホルムズ経由。</p>
          <p>封鎖が長期化すれば、国家備蓄254日分を使い切った時点でエネルギーインフラが崩壊する。電力・物流・食料供給が連鎖停止する。</p>
          <p className="text-neutral-500 text-xs">※ 石油備蓄254日分は資源エネルギー庁2025年12月末統計。LNGは約25日分の在庫。</p>
        </div>
      </div>

      {/* データソース */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="font-mono text-sm tracking-wider text-neutral-400">データソース</h2>
        </div>
        <div className="divide-y divide-[#1a1a1a]">
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
              className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 flex gap-4"
            >
              <div className="shrink-0 pt-0.5">
                <span
                  className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                    p.status === "completed" ? "bg-[#00e676]" : "bg-[#2a2a2a]"
                  }`}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-neutral-300">{p.phase}</span>
                  <span className="text-xs text-neutral-500">{p.label}</span>
                  {p.status === "completed" && (
                    <span className="text-xs font-mono text-[#00e676]">LIVE</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.items.map((item) => (
                    <span
                      key={item}
                      className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{
                        backgroundColor: p.status === "completed" ? "#00e67615" : "#2a2a2a",
                        color: p.status === "completed" ? "#00e676" : "#555",
                        border: `1px solid ${p.status === "completed" ? "#00e67630" : "#333"}`,
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

      {/* リンク */}
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-6 space-y-3">
        <h2 className="font-mono text-sm tracking-wider text-neutral-400">LINKS</h2>
        <div className="space-y-2 text-sm">
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">GitHub</span>
            <span className="text-neutral-400">github.com/surviveasonejp</span>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">X</span>
            <span className="text-neutral-400">@surviveasonejp</span>
          </div>
          <div className="flex gap-3">
            <span className="text-neutral-500 font-mono w-24 shrink-0">API</span>
            <span className="text-neutral-400">surviveasonejp.net</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/prepare"
          className="px-4 py-2 border border-[#00e676] text-[#00e676] hover:bg-[#00e676]/10 font-mono text-xs tracking-wider rounded transition-colors"
        >
          SURVIVAL GUIDE →
        </Link>
        <Link
          to="/dashboard"
          className="px-4 py-2 border border-[#2a2a2a] text-neutral-400 hover:bg-white/5 font-mono text-xs tracking-wider rounded transition-colors"
        >
          DASHBOARD →
        </Link>
      </div>

      <p className="text-xs text-neutral-600 font-mono">
        本シミュレーションは公開データに基づく推定値です。実際の備蓄運用は政府判断により変動します。
      </p>
    </div>
  );
};
