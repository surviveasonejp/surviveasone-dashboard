import { type FC } from "react";
import { useCountdown } from "../hooks/useCountdown";
import { getAlertColor } from "../lib/alertHelpers";
import { formatNumber, formatTimeHMS, formatDepletionDate } from "../lib/formatters";

interface CountdownTimerProps {
  label: string;
  totalSeconds: number;
  compact?: boolean;
}

export const CountdownTimer: FC<CountdownTimerProps> = ({ label, totalSeconds, compact = false }) => {
  const { days, hours, minutes, seconds, alertLevel } = useCountdown(totalSeconds);
  const color = getAlertColor(alertLevel);
  const isCritical = alertLevel === "critical";

  if (compact) {
    return (
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4">
        <div className="text-xs font-mono text-neutral-500 tracking-wider mb-1">{label}</div>
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono font-bold text-2xl ${isCritical ? "animate-pulse-danger" : ""}`}
            style={{ color }}
          >
            {formatNumber(days)}
          </span>
          <span className="text-neutral-500 text-sm font-mono">日</span>
          <span className="font-mono text-sm text-neutral-400">
            {formatTimeHMS(hours, minutes, seconds)}
          </span>
        </div>
        <div className="text-xs font-mono text-neutral-400 mt-1">
          枯渇日: {formatDepletionDate(days)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-6 text-center">
      <div className="text-sm font-mono text-neutral-500 tracking-wider mb-4">{label}</div>
      <div
        className={`font-mono font-bold text-6xl md:text-7xl mb-2 ${isCritical ? "animate-pulse-danger" : ""}`}
        style={{ color }}
      >
        {formatNumber(days)}
      </div>
      <div className="text-neutral-500 font-mono text-lg mb-3">日</div>
      <div className="font-mono text-2xl text-neutral-300">
        {formatTimeHMS(hours, minutes, seconds)}
      </div>
      <div className="text-sm font-mono text-neutral-400 mt-2">
        枯渇日: {formatDepletionDate(days)}
      </div>
      <div className="mt-4 h-1 rounded-full bg-[#2a2a2a] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            backgroundColor: color,
            width: `${Math.max(0, Math.min(100, (days / 267) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
};
