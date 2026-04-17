import { type FC, useState } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import { useApiData } from "../hooks/useApiData";
import { FALLBACK_COUNTDOWNS, SCENARIO_RANGES, getReservesSummaryText } from "../lib/fallbackCountdowns";
import { IeaComparison } from "../components/IeaComparison";
import { BlockadeDayCounter } from "../components/BlockadeDayCounter";
import { SectionHeading } from "../components/SectionHeading";
import type { ResourceCountdown } from "../../shared/types";
import staticReserves from "../data/reserves.json";

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
    className="bg-panel border border-border hover:border-opacity-60 rounded-lg p-4 transition-colors group"
  >
    <div className="font-mono text-xs font-bold tracking-wider mb-1" style={{ color }}>
      {title}
    </div>
    <div className="text-sm font-bold text-text mb-1">{subtitle}</div>
    <div className="text-xs text-text-muted group-hover:text-text transition-colors leading-relaxed">
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
  const isCeasefire = scenario === "ceasefire";

  return (
    <div className="space-y-8">
      <AlertBanner
        level="warning"
        message="これは予測ではなくリスクシナリオのシミュレーションです — 国際協調/標準対応/需要超過/停戦・回復の4シナリオで分析"
      />

      {/* ヒーロー */}
      <div className="text-center space-y-4">
        <span className="inline-block text-neutral-500 text-xs font-mono tracking-widest border border-border px-3 py-1 rounded-full">
          HORMUZ STRAIT BLOCKADE SCENARIO SIMULATION
        </span>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">
          ホルムズ封鎖シナリオで、<br className="md:hidden" /><span className="text-primary-soft">エネルギー供給</span>はどう変化するか
        </h1>
        <p className="text-text-muted text-sm leading-relaxed max-w-lg mx-auto">
          石油の94%は中東から届く。その全量がホルムズ海峡を通る。<br />
          封鎖シナリオ下で、供給制約はいつ、どのように進むのか。
        </p>
      </div>

      {/* 封鎖Day カウンター */}
      <BlockadeDayCounter activeScenario={scenario} />

      {/* 安心情報ファースト — 現在の備え・対応状況 */}
      <div className="bg-panel border border-success/30 rounded-lg p-5">
        <div className="font-mono text-xs tracking-widest text-success mb-4 text-center">
          CURRENT RESILIENCE STATUS
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat value={String(staticReserves.oil.totalReserveDays)} unit="日" label="石油備蓄（国家+民間+産油国共同）" color="var(--color-success)" />
          <Stat value="32" unit="カ国" label="IEA協調備蓄放出済み" color="var(--color-success)" />
          <Stat value="3" unit="ルート" label="代替調達稼働中" color="var(--color-info)" />
        </div>
        <p className="text-xs text-text-muted text-center mt-4 leading-relaxed">
          {getReservesSummaryText()}（放出中・計45日分放出済み）。3/11 IEA史上最大の協調放出（4億バレル）実施済み。4/10 高市首相が追加20日分放出（5月開始）を発表。フジャイラ・ヤンブー・非中東経由の代替供給ルート稼働中
        </p>
      </div>

      {/* 依存構造 — リスクの文脈 */}
      <div className="bg-panel border border-border rounded-lg p-5">
        <SectionHeading align="center" className="mb-4">
          JAPAN ENERGY DEPENDENCY
        </SectionHeading>
        <div className="grid grid-cols-3 gap-4">
          <Stat value="94" unit="%" label="中東石油依存" color="var(--color-warning-soft)" />
          <Stat value="65" unit="%" label="火力発電比率" color="var(--color-warning-soft)" />
          <Stat value="25" unit="日" label="LNG全量在庫" color="var(--color-primary-soft)" />
        </div>
        <p className="text-xs text-text-muted text-center mt-4 leading-relaxed">
          火力内訳: LNG29.1%+石炭28.2%+石油1.4%+他6.3%(ISEP 2024年暦年速報)。原子力8.2%(15基稼働)。LNG在庫25日分(経産省ガス事業統計)
        </p>
      </div>

      {/* IEA加盟国比較 — 依存構造の後に国際的文脈を提示 */}
      <IeaComparison />

      {/* シナリオ切替 — 文脈を把握した後に選択 */}
      <div className="flex justify-center">
        <ScenarioSelector selected={scenario} onChange={setScenario} />
      </div>

      {/* 停戦シナリオ説明バナー（ceasefire選択時のみ表示） */}
      {isCeasefire && (
        <div className="bg-panel border border-teal/40 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-teal">CEASEFIRE SCENARIO</span>
            <span className="text-xs text-neutral-500">— 供給はいつ正常化するか</span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            封鎖45日目に停戦宣言（想定）→ 保険会社「危険区域」解除（+14日）→ 港湾部分再開（+60日）→ 契約再締結（+90日）→ 構造的残存リスク8%で安定化（+120日）。
            下の数値はシナリオ推定値です。備蓄放出・代替供給により変動します。
          </p>
          <Link to="/countdown" className="inline-block text-xs font-mono text-teal hover:underline">
            正常化タイムラインの詳細 → SUPPLY TIMELINE
          </Link>
        </div>
      )}

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

      {/* メインCTA */}
      <div className="flex flex-col items-center gap-2">
        <Link
          to="/dashboard"
          className="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-mono text-sm tracking-wider rounded transition-colors"
        >
          DASHBOARD を見る →
        </Link>
        <p className="text-xs text-text-muted font-mono">
          今確認すべき事項 · 政策介入効果比較 · 業種別影響 · 都道府県選択
        </p>
      </div>

      {/* 要配慮者導線 */}
      <div className="bg-panel border border-warning-soft/30 rounded-lg p-5 space-y-4">
        <div className="text-center space-y-2">
          <div className="font-mono text-3xl font-bold text-warning-soft">5人に1人</div>
          <p className="text-sm text-text">
            乳幼児・子育て・透析・在宅医療・介護のある家庭。供給制約が生じたとき、通常の家庭より早く追加確認が必要になるのはこの層です。
          </p>
          <p className="text-xs text-text-muted leading-relaxed">
            備蓄は、公的支援が届くまでの時間を稼ぐ手段。「わが家に何が不足しているか」を確認することから始めましょう。
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { to: "/for/parents", label: "子育て家庭", sub: "状況を確認する", color: "#ef4444" },
            { to: "/for/dialysis", label: "透析患者の家族", sub: "状況を確認する", color: "#ef4444" },
            { to: "/for/elderly", label: "介護・医療機器", sub: "状況を確認する", color: "#f59e0b" },
          ].map((seg) => (
            <Link
              key={seg.to}
              to={seg.to}
              className="block px-3 py-3 rounded border text-center transition-colors hover:bg-warning-soft/5 min-h-[60px] flex flex-col justify-center"
              style={{ borderColor: `${seg.color}40` }}
            >
              <div className="text-xs font-bold text-text">{seg.label}</div>
              <div className="text-xs font-mono mt-0.5" style={{ color: seg.color }}>{seg.sub}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Household Supply Check — 参考ツール */}
      <Link
        to="/family"
        className="block bg-panel border border-warning-soft/40 hover:border-warning-soft/70 rounded-lg p-6 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <SectionHeading tone="warning">HOUSEHOLD SUPPLY CHECK</SectionHeading>
            <p className="text-lg font-bold">わが家の供給余力を確認する</p>
            <p className="text-xs text-neutral-500 leading-relaxed">
              備蓄量を入力 → 供給可能日数の目安を確認。残り日数が少ない項目を把握できる。計算はブラウザ内で完結、サーバーへの送信なし
            </p>
          </div>
          <span className="text-warning-soft font-mono text-2xl group-hover:translate-x-1 transition-transform">&rarr;</span>
        </div>
      </Link>

      {/* パネルカード（4枚）*/}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PanelCard
          to="/countdown"
          title="SUPPLY TIMELINE"
          subtitle="供給制約タイムライン"
          description="石油・LNG・電力の供給可能日数。封鎖Day Nカウンター・365日フロータイムライン・代替ルートパネル・回復タイムラインスライダー・政策マイルストーンタイムライン搭載"
          color="var(--color-primary-soft)"
        />
        <PanelCard
          to="/last-tanker"
          title="TANKER TRACKER"
          subtitle="タンカー追跡"
          description="実在30隻（VLCC13+LNG14+Chemical1+Suezmax2）のAIS追跡。供給元カテゴリ別タイムライン（代替ルート/米国ガルフ/LNG）+ 備蓄カーブ重ね表示。シナリオ連動代替ルート可視化"
          color="#94a3b8"
        />
        <PanelCard
          to="/food-collapse"
          title="FOOD SUPPLY"
          subtitle="食料サプライチェーン影響"
          description="衛生・包装への供給制約が食料より先に進む。ナフサ→石化→包装材の連鎖的影響。商品カテゴリ別の店頭在庫日数を確認"
          color="var(--color-primary-soft)"
        />
        <PanelCard
          to="/prepare"
          title="PREPARE"
          subtitle="公的推奨水準との比較ガイド"
          description="内閣府推奨3日分と照らし合わせ、わが家の過不足を確認。シナリオ連動フェーズ判定・住居形態別・要配慮者5カテゴリ対応"
          color="var(--color-success-soft)"
        />
      </div>

      {/* フッター注記 */}
      <div className="text-center space-y-2 pt-2">
        <p className="text-xs text-text-muted font-mono max-w-lg mx-auto leading-relaxed">
          本シミュレーションは公開統計データに基づくシナリオの推定値です。
          実際にはIEA協調備蓄放出、代替供給ルートの確保、需要削減政策等の対応が取られます。
          日本の石油備蓄はIEA基準で国際的に充実した水準にあります。
          前提条件・計算モデルの詳細は<Link to="/about" className="text-neutral-500 underline underline-offset-2 hover:text-neutral-400">ABOUTページ</Link>を参照してください。
        </p>
      </div>
    </div>
  );
};
