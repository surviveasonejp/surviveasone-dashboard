import { type FC, useState } from "react";
import { DATA_SOURCES, hasSimulatedData } from "../lib/dataSources";
import { DataBadge } from "./DataBadge";

export const SimulationBanner: FC = () => {
  const [expanded, setExpanded] = useState(false);
  const hasSimulated = hasSimulatedData();
  const estimated = Object.values(DATA_SOURCES).filter((s) => s.confidence === "estimated");
  const verified = Object.values(DATA_SOURCES).filter((s) => s.confidence === "verified");

  const borderColor = hasSimulated ? "#ef4444" : estimated.length > 0 ? "#f59e0b" : "#22c55e";
  const label = hasSimulated
    ? "DEV SIMULATION"
    : estimated.length > 0
      ? "DATA QUALITY"
      : "VERIFIED";
  const description = hasSimulated
    ? `一部のデータは開発用シミュレーション値です（${Object.values(DATA_SOURCES).filter((s) => s.confidence === "simulated").length}項目）`
    : `実績値${verified.length}項目 / 推定値${estimated.length}項目`;

  return (
    <div
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: `${borderColor}40`, backgroundColor: `${borderColor}08` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: borderColor, animation: hasSimulated ? "pulse 2s infinite" : undefined }}
        />
        <span className="font-mono text-xs font-bold tracking-wider" style={{ color: borderColor }}>
          {label}
        </span>
        <span className="text-neutral-400 text-xs">
          {description}
        </span>
        <span className="ml-auto text-neutral-500 text-xs font-mono">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t" style={{ borderColor: `${borderColor}20` }}>
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="text-neutral-500 font-mono">
                <th className="text-left py-1 pr-3">データ項目</th>
                <th className="text-left py-1 pr-3">信頼度</th>
                <th className="text-left py-1">ソース</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(DATA_SOURCES).map((ds) => (
                <tr key={ds.label} className="border-t border-[#162029]">
                  <td className="py-1.5 pr-3 text-neutral-300">{ds.label}</td>
                  <td className="py-1.5 pr-3">
                    <DataBadge confidence={ds.confidence} />
                  </td>
                  <td className="py-1.5 text-neutral-500">
                    {ds.source}
                    {ds.note && (
                      <span className="block text-[10px] text-neutral-600 mt-0.5">{ds.note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
