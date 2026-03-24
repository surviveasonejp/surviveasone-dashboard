/**
 * 位置情報バー
 *
 * 現在地エリアの検出結果を表示。手動リセットも可能。
 */

import { type FC } from "react";

interface LocationBarProps {
  regionName: string | null;
  source: "saved" | "geolocation" | null;
  loading: boolean;
  onReset: () => void;
}

export const LocationBar: FC<LocationBarProps> = ({ regionName, source, loading, onReset }) => {
  if (loading) return null;
  if (!regionName) return null;

  const sourceLabel = source === "geolocation" ? "GPS" : source === "saved" ? "保存済み" : "";

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono px-3 py-1.5 bg-[#0f1419] rounded border border-[#22c55e]/30">
      <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shrink-0" />
      <span className="text-[#22c55e]">現在地:</span>
      <span className="text-neutral-300 font-bold">{regionName}エリア</span>
      <span className="text-neutral-600">({sourceLabel})</span>
      {source === "saved" && (
        <button
          onClick={onReset}
          className="text-neutral-600 hover:text-neutral-400 ml-auto cursor-pointer"
        >
          リセット
        </button>
      )}
    </div>
  );
};
