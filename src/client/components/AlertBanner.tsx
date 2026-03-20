import { type FC } from "react";
import { type AlertLevel, getAlertColor } from "../lib/calculations";

interface AlertBannerProps {
  level: AlertLevel;
  message: string;
}

const LEVEL_LABELS: Record<AlertLevel, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  caution: "CAUTION",
  safe: "NORMAL",
};

export const AlertBanner: FC<AlertBannerProps> = ({ level, message }) => {
  const color = getAlertColor(level);
  const isCritical = level === "critical";

  return (
    <div
      className={`border rounded px-4 py-2 flex items-center gap-3 font-mono text-sm ${isCritical ? "animate-pulse-danger" : ""}`}
      style={{ borderColor: color, backgroundColor: `${color}10`, color }}
    >
      <span className="font-bold tracking-wider text-xs">[{LEVEL_LABELS[level]}]</span>
      <span>{message}</span>
    </div>
  );
};
