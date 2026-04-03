import { type FC, useState } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";
import { FALLBACK_COUNTDOWNS, SCENARIO_RANGES, getReservesSummaryText } from "../lib/fallbackCountdowns";
import { IeaComparison } from "../components/IeaComparison";
import type { ResourceCountdown } from "../../shared/types";

interface PanelCardProps {
  to: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
}

const PanelCard: FC<PanelCardProps> = ({ to, title, subtitle, description, color }) => (
  <Link
    to={to}
    className="bg-[#151c24] border border-[#1e2a36] hover:border-opacity-60 rounded-lg p-4 transition-colors group"
  >
    <div className="font-mono text-xs font-bold tracking-wider mb-1" style={{ color }}>
      {title}
    </div>
    <div className="text-sm font-bold text-neutral-200 mb-1">{subtitle}</div>
    <div className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors leading-relaxed">
      {description}
    </div>
  </Link>
);

interface StatProps {
  value: string;
  unit: string;
  label: string;
  color: string;
}

const Stat: FC<StatProps> = ({ value, unit, label, color }) => (
  <div className="text-center">
    <div className="flex items-baseline justify-center gap-0.5">
      <span className="font-mono font-bold text-2xl md:text-3xl" style={{ color }}>{value}</span>
      <span className="font-mono text-sm text-neutral-500">{unit}</span>
    </div>
    <div className="text-xs text-neutral-500 mt-1">{label}</div>
  </div>
);

export const Landing: FC = () => {
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const { data } = useApiData<ResourceCountdown[]>(`/api/countdowns?scenario=${scenario}`, FALLBACK_COUNTDOWNS);
  const countdowns = data ?? FALLBACK_COUNTDOWNS;

  return (
    <div className="space-y-8">
      <AlertBanner
        level="warning"
        message="これは予測ではなくリスクシナリオのシミュレーションです — 楽観/現実/悲観の3シナリオで分析"
      />

      {/* シナリオ切替 */}
      <div className="flex justify-center">
        <ScenarioSelector selected={scenario} onChange={setScenario} />
      </div>

      {/* ヒーロー */}
      <div className="text-center space-y-4">
        <span className="inline-block text-neutral-500 text-xs font-mono tracking-widest border border-[#1e2a36] px-3 py-1 rounded-full">
          HORMUZ STRAIT BLOCKADE SCENARIO
        </span>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">
          日本の<span className="text-[#ef4444]">エネルギー</span>は、<br className="md:hidden" />何日もつのか
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed max-w-lg mx-auto">
          石油の94%は中東から届く。その全量がホルムズ海峡を通る。<br />
          もし封鎖されたら、この国のエネルギーはいつ尽きるのか。
        </p>
      </div>

      {/* 3本カウントダウン */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {countdowns.map((cd, i) => (
          <CountdownTimer
            key={cd.label}
            label={cd.label}
            totalSeconds={cd.totalSeconds}
            compact
            range={SCENARIO_RANGES[i]}
            activeScenario={scenario}
          />
        ))}
      </div>

      {/* 依存構造 — なぜ危険か */}
      <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-5">
        <div className="font-mono text-xs tracking-widest text-neutral-500 mb-4 text-center">
          WHY JAPAN IS VULNERABLE
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat value="94" unit="%" label="中東石油依存" color="#f59e0b" />
          <Stat value="65" unit="%" label="火力発電比率" color="#f59e0b" />
          <Stat value="25" unit="日" label="LNG全量在庫" color="#ef4444" />
        </div>
        <p className="text-xs text-neutral-600 text-center mt-4 leading-relaxed">
          {getReservesSummaryText()}。火力内訳: LNG29.1%+石炭28.2%+石油1.4%+他6.3%(ISEP 2024年暦年速報)。原子力8.2%(15基稼働)。LNG在庫25日分(経産省ガス事業統計)
        </p>
      </div>

      {/* IEA加盟国比較 */}
      <IeaComparison />

      {/* メインCTA */}
      <div className="flex justify-center">
        <Link
          to="/dashboard"
          className="px-8 py-3 bg-[#ef4444] hover:bg-[#ef4444]/80 text-white font-mono text-sm tracking-wider rounded transition-colors"
        >
          DASHBOARD を見る →
        </Link>
      </div>

      {/* リスク層訴求 */}
      <div className="bg-[#151c24] border border-[#ef4444]/30 rounded-lg p-5 space-y-4">
        <div className="text-center space-y-2">
          <div className="font-mono text-3xl font-bold text-[#ef4444]">5人に1人</div>
          <p className="text-sm text-neutral-300">
            乳幼児・子育て家庭・透析・在宅医療・介護——インフラ停止時に特別な備えが必要な家庭は日本人口の<span className="text-[#ef4444] font-bold">約20%</span>
          </p>
          <p className="text-xs text-neutral-500">
            備蓄は国からの配給や地域の相互支援が届くまでの時間を稼ぐ手段。買い占めではなく「わが家に何が足りないか」の確認を。
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { to: "/for/parents", label: "子育て家庭", sub: "備えの確認を", color: "#ef4444" },
            { to: "/for/dialysis", label: "透析患者の家族", sub: "備えの確認を", color: "#ef4444" },
            { to: "/for/elderly", label: "介護・医療機器", sub: "備えの確認を", color: "#f59e0b" },
          ].map((seg) => (
            <Link
              key={seg.to}
              to={seg.to}
              className="block px-3 py-2.5 rounded border text-center transition-colors hover:bg-white/5"
              style={{ borderColor: `${seg.color}40` }}
            >
              <div className="text-xs font-bold text-neutral-200">{seg.label}</div>
              <div className="text-[10px] font-mono mt-0.5" style={{ color: seg.color }}>{seg.sub}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Family Meter CTA — 自分ごと化の核 */}
      <Link
        to="/family"
        className="block bg-[#151c24] border border-[#f59e0b]/40 hover:border-[#f59e0b]/70 rounded-lg p-6 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="font-mono text-xs tracking-widest text-[#f59e0b]">FAMILY SURVIVAL METER</div>
            <p className="text-lg font-bold">あなたの家庭の備えは足りていますか？</p>
            <p className="text-xs text-neutral-500 leading-relaxed">
              備蓄量を入力 → 生存日数とランクを即時判定。計算はブラウザ内で完結、サーバーへの送信なし
            </p>
          </div>
          <span className="text-[#f59e0b] font-mono text-2xl group-hover:translate-x-1 transition-transform">&rarr;</span>
        </div>
      </Link>

      {/* パネルカード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <PanelCard
          to="/countdown"
          title="SURVIVAL CLOCK"
          subtitle="崩壊カウントダウン"
          description="石油・LNG・電力の残存日数。365日フロータイムライン+代替供給ルート+経済カスケード"
          color="#ef4444"
        />
        <PanelCard
          to="/collapse-map"
          title="COLLAPSE MAP"
          subtitle="全国10エリア崩壊順"
          description="原子力15基・再エネ・連系線融通・物流フロー可視化。GPS自動検出であなたの地域をハイライト"
          color="#f59e0b"
        />
        <PanelCard
          to="/last-tanker"
          title="LAST TANKER"
          subtitle="タンカー追跡"
          description="実在18隻のAIS追跡。供給元カテゴリ別タイムライン（代替ルート/米国ガルフ/LNG）+ 備蓄カーブ重ね表示。米国産原油タンカー（喜望峰回り）も可視化"
          color="#94a3b8"
        />
        <PanelCard
          to="/food-collapse"
          title="FOOD COLLAPSE"
          subtitle="備蓄の優先順位"
          description="衛生・包装の崩壊が食料より先に来る。ナフサ→石化→包装材の連鎖崩壊。商品カテゴリ別の店頭在庫日数から優先順位を確認"
          color="#ef4444"
        />
        <PanelCard
          to="/prepare"
          title="PREPARE"
          subtitle="備蓄ガイド"
          description="住居形態・家族構成で絞り込み。マンション高層/ワンルーム/車なし世帯にも対応"
          color="#22c55e"
        />
        <PanelCard
          to="/methodology"
          title="METHODOLOGY"
          subtitle="計算モデル・前提条件"
          description="17の計算式・20データソース・感度分析。全ての前提を公開し検証可能に"
          color="#f59e0b"
        />
      </div>

      {/* フッター注記 */}
      <div className="text-center space-y-2 pt-2">
        <p className="text-xs text-neutral-600 font-mono max-w-lg mx-auto leading-relaxed">
          本シミュレーションは公開統計データに基づく最悪ケースに近いシナリオの推定値です。
          実際にはIEA協調備蓄放出、代替供給ルートの確保、需要削減政策等の対応が取られます。
          日本の石油備蓄はIEA基準で国際的に充実した水準にあります。
          前提条件・計算モデルの詳細は<Link to="/about" className="text-neutral-500 underline underline-offset-2 hover:text-neutral-400">ABOUTページ</Link>を参照してください。
        </p>
      </div>
    </div>
  );
};
