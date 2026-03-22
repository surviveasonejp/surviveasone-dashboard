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
  color: string;
}

const PanelCard: FC<PanelCardProps> = ({ to, title, subtitle, color }) => (
  <Link
    to={to}
    className="bg-[#141414] border border-[#2a2a2a] hover:border-opacity-60 rounded-lg p-4 transition-colors group"
    style={{ ["--card-color" as string]: color }}
  >
    <div className="font-mono text-sm font-bold tracking-wider mb-1" style={{ color }}>
      {title}
    </div>
    <div className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors">
      {subtitle}
    </div>
  </Link>
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

      <div className="text-center space-y-3 pt-4">
        <span className="block text-neutral-500 text-xs font-mono tracking-widest">
          HORMUZ STRAIT BLOCKADE SCENARIO
        </span>
        <h1 className="text-2xl md:text-3xl font-bold leading-tight">
          日本のエネルギーが尽きるまで
        </h1>
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

      {/* メインCTA */}
      <div className="flex justify-center">
        <Link
          to="/dashboard"
          className="px-8 py-3 bg-[#ff1744] hover:bg-[#ff1744]/80 text-white font-mono text-sm tracking-wider rounded transition-colors"
        >
          DASHBOARD →
        </Link>
      </div>

      {/* Family Meter CTA — 自分ごと化の核 */}
      <Link
        to="/family"
        className="block bg-[#141414] border border-[#ff9100]/40 hover:border-[#ff9100]/70 rounded-lg p-6 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="font-mono text-xs tracking-widest text-[#ff9100]">FAMILY SURVIVAL METER</div>
            <p className="text-lg font-bold">あなたの家庭は何日持つか？</p>
            <p className="text-xs text-neutral-500">水・食料・燃料・電力の備蓄量から生存可能日数を算出</p>
          </div>
          <span className="text-[#ff9100] font-mono text-2xl group-hover:translate-x-1 transition-transform">&rarr;</span>
        </div>
      </Link>

      {/* パネルカード */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <PanelCard
          to="/countdown"
          title="SURVIVAL CLOCK"
          subtitle="石油/LNG/電力の残存日数"
          color="#ff1744"
        />
        <PanelCard
          to="/collapse-map"
          title="COLLAPSE MAP"
          subtitle="10エリア崩壊順マップ"
          color="#ff9100"
        />
        <PanelCard
          to="/last-tanker"
          title="LAST TANKER"
          subtitle="最終タンカー到着追跡"
          color="#4fc3f7"
        />
        <PanelCard
          to="/food-collapse"
          title="FOOD COLLAPSE"
          subtitle="スーパー消滅カウントダウン"
          color="#ff5252"
        />
        <PanelCard
          to="/prepare"
          title="PREPARE"
          subtitle="備蓄ガイド・行動指針"
          color="#00e676"
        />
      </div>

      <p className="text-xs text-neutral-600 font-mono text-center max-w-lg mx-auto">
        本シミュレーションは公開データに基づく推定値です。実際の備蓄運用は政府判断により変動します。
      </p>
    </div>
  );
};
