import { type FC } from "react";
import { Link } from "react-router-dom";
import { CountdownTimer } from "../components/CountdownTimer";
import { AlertBanner } from "../components/AlertBanner";
import { SimulationBanner } from "../components/SimulationBanner";
import { getAllCountdowns } from "../lib/calculations";

export const Landing: FC = () => {
  const countdowns = getAllCountdowns();
  const oilCountdown = countdowns[0];

  if (!oilCountdown) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
      <AlertBanner
        level="critical"
        message="ホルムズ海峡封鎖シナリオ — シミュレーション稼働中"
      />

      <h1 className="text-center">
        <span className="block text-neutral-500 text-sm font-mono tracking-widest mb-2">
          HORMUZ STRAIT BLOCKADE SCENARIO
        </span>
        <span className="block text-2xl md:text-3xl font-bold leading-tight">
          日本のエネルギーが尽きるまで、あと——
        </span>
      </h1>

      <div className="w-full max-w-md">
        <CountdownTimer label={oilCountdown.label} totalSeconds={oilCountdown.totalSeconds} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <Link
          to="/countdown"
          className="px-6 py-3 bg-[#ff1744] hover:bg-[#ff1744]/80 text-white font-mono text-sm tracking-wider rounded transition-colors"
        >
          SURVIVAL CLOCK →
        </Link>
        <Link
          to="/collapse-map"
          className="px-6 py-3 border border-[#ff9100] text-[#ff9100] hover:bg-[#ff9100]/10 font-mono text-sm tracking-wider rounded transition-colors"
        >
          COLLAPSE MAP →
        </Link>
        <Link
          to="/dashboard"
          className="px-6 py-3 border border-[#2a2a2a] text-neutral-400 hover:bg-white/5 font-mono text-sm tracking-wider rounded transition-colors"
        >
          DASHBOARD →
        </Link>
      </div>

      <div className="w-full max-w-2xl">
        <SimulationBanner />
      </div>

      <p className="text-xs text-neutral-600 font-mono text-center max-w-lg">
        本シミュレーションは公開データに基づく推定値です。実際の備蓄運用は政府判断により変動します。
      </p>
    </div>
  );
};
