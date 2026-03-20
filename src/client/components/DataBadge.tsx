import { type FC } from "react";
import {
  type DataConfidence,
  getConfidenceLabel,
  getConfidenceColor,
} from "../lib/dataSources";

interface DataBadgeProps {
  confidence: DataConfidence;
}

export const DataBadge: FC<DataBadgeProps> = ({ confidence }) => {
  const label = getConfidenceLabel(confidence);
  const color = getConfidenceColor(confidence);

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase"
      style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}10` }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${confidence === "simulated" ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
};
