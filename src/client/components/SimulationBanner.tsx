import { type FC, useState } from "react";
import { DATA_SOURCES, getConfidenceLabel, getConfidenceColor } from "../lib/dataSources";
import { DataBadge } from "./DataBadge";

export const SimulationBanner: FC = () => {
  const [expanded, setExpanded] = useState(false);
  const simulated = Object.values(DATA_SOURCES).filter((s) => s.confidence === "simulated");
  const estimated = Object.values(DATA_SOURCES).filter((s) => s.confidence === "estimated");

  return (
    <div className="border border-[#ff1744]/40 bg-[#ff1744]/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center gap-3 text-left cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full bg-[#ff1744] animate-pulse shrink-0" />
        <span className="text-[#ff1744] font-mono text-xs font-bold tracking-wider">
          DEV SIMULATION
        </span>
        <span className="text-neutral-400 text-xs">
          一部のデータは開発用シミュレーション値です
          （{simulated.length}項目）
        </span>
        <span className="ml-auto text-neutral-500 text-xs font-mono">
          {expanded ? "▲" : "▼"}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-[#ff1744]/20">
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
                <tr key={ds.label} className="border-t border-[#1a1a1a]">
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
