/**
 * データ鮮度インジケータ
 *
 * 各データソースの最終更新日と経過日数を表示。
 * 30日超で警告、60日超でエラー表示。
 */

import { type FC } from "react";
import staticReserves from "../data/reserves.json";
import staticConsumption from "../data/consumption.json";

interface FreshnessEntry {
  label: string;
  baselineDate: string;
  updatedAt: string;
}

function getDaysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function getFreshnessColor(days: number): string {
  if (days <= 30) return "#22c55e";
  if (days <= 60) return "#f59e0b";
  return "#ef4444";
}

function getFreshnessLabel(days: number): string {
  if (days <= 30) return "最新";
  if (days <= 60) return "要更新";
  return "古い";
}

const ENTRIES: FreshnessEntry[] = [
  {
    label: "石油備蓄",
    baselineDate: staticReserves.meta.baselineDate,
    updatedAt: staticReserves.meta.updatedAt,
  },
  {
    label: "消費量",
    baselineDate: staticConsumption.meta.updatedAt,
    updatedAt: staticConsumption.meta.updatedAt,
  },
];

export const DataFreshness: FC = () => {
  return (
    <div className="flex flex-wrap gap-3 text-[10px] font-mono">
      {ENTRIES.map((entry) => {
        const days = getDaysSince(entry.baselineDate);
        const color = getFreshnessColor(days);
        const label = getFreshnessLabel(days);
        return (
          <div
            key={entry.label}
            className="flex items-center gap-1.5 px-2 py-1 rounded border"
            style={{ borderColor: `${color}40`, color }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-neutral-400">{entry.label}</span>
            <span>{entry.baselineDate}</span>
            <span className="text-neutral-600">({days}日前・{label})</span>
          </div>
        );
      })}
    </div>
  );
};
