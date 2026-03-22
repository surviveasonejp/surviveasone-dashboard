import { type FC } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import type { ResourceCountdown } from "../../shared/types";
import { useApiData } from "../hooks/useApiData";

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
  const FALLBACK: ResourceCountdown[] = [
    { label: "石油備蓄", totalDays: 168.8, totalSeconds: 168.8 * 86400, alertLevel: "safe" },
    { label: "LNG在庫", totalDays: 750.4, totalSeconds: 750.4 * 86400, alertLevel: "safe" },
    { label: "電力供給", totalDays: 487.8, totalSeconds: 487.8 * 86400, alertLevel: "safe" },
  ];
  const { data } = useApiData<ResourceCountdown[]>("/api/countdowns?scenario=realistic", FALLBACK);
  const countdowns = data ?? FALLBACK;

  return (
    <div className="space-y-8">
      <AlertBanner
        level="critical"
        message="ホルムズ海峡封鎖シナリオ — シミュレーション稼働中"
      />

      {/* ヒーロー */}
      <div className="text-center space-y-4 pt-4">
        <span className="inline-block text-neutral-500 text-xs font-mono tracking-widest border border-[#1e2a36] px-3 py-1 rounded-full">
          HORMUZ STRAIT BLOCKADE SCENARIO
        </span>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight">
          日本の<span className="text-[#ef4444]">エネルギー</span>が<br className="md:hidden" />尽きるまで
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed max-w-lg mx-auto">
          石油の94%は中東から届く。その全量がホルムズ海峡を通る。<br />
          もし封鎖されたら、この国のエネルギーはいつ尽きるのか。
        </p>
      </div>

      {/* 3本カウントダウン */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {countdowns.map((cd) => (
          <CountdownTimer
            key={cd.label}
            label={cd.label}
            totalSeconds={cd.totalSeconds}
            compact
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
          火力の内訳: LNG 29% + 石炭 28% + 石油 7%。石油備蓄254日分はIEA基準で国際的に充実した水準だが、LNG在庫は約25日分と薄い
        </p>
      </div>

      {/* メインCTA */}
      <div className="flex justify-center">
        <Link
          to="/dashboard"
          className="px-8 py-3 bg-[#ef4444] hover:bg-[#ef4444]/80 text-white font-mono text-sm tracking-wider rounded transition-colors"
        >
          DASHBOARD を見る →
        </Link>
      </div>

      {/* Family Meter CTA — 自分ごと化の核 */}
      <Link
        to="/family"
        className="block bg-[#151c24] border border-[#f59e0b]/40 hover:border-[#f59e0b]/70 rounded-lg p-6 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="font-mono text-xs tracking-widest text-[#f59e0b]">FAMILY SURVIVAL METER</div>
            <p className="text-lg font-bold">あなたの家庭は、何日生き延びられるか？</p>
            <p className="text-xs text-neutral-500 leading-relaxed">
              水・食料・カセットガス・モバイルバッテリー・現金の備蓄量を入力 → 生存可能日数とランクを即時判定
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
          description="石油・LNG・電力の残存日数をリアルタイム表示。枯渇日を秒単位で刻む"
          color="#ef4444"
        />
        <PanelCard
          to="/collapse-map"
          title="COLLAPSE MAP"
          subtitle="全国10エリア崩壊順"
          description="沖縄→北海道→四国…どの順で電力が止まるか。あなたの地域は何日目か"
          color="#f59e0b"
        />
        <PanelCard
          to="/last-tanker"
          title="LAST TANKER"
          subtitle="最終タンカー追跡"
          description="封鎖後、日本に届く最後の積荷はいつか。実在12隻の到着予測"
          color="#94a3b8"
        />
        <PanelCard
          to="/food-collapse"
          title="FOOD COLLAPSE"
          subtitle="食料消滅タイムライン"
          description="スーパーの棚が空になるまで何日。物流停止→食料連鎖崩壊をシミュレーション"
          color="#ef4444"
        />
        <PanelCard
          to="/prepare"
          title="PREPARE"
          subtitle="備蓄ガイド"
          description="水・食料・エネルギー・現金。今日からできる備えを6カテゴリで整理"
          color="#22c55e"
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
