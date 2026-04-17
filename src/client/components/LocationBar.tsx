/**
 * 位置情報バー
 *
 * 現在地エリアの検出結果を表示。
 * 未検出時は「現在地を検出」ボタンを表示し、ユーザーの明示的なアクションでGPSを要求。
 */

import { type FC } from "react";

interface LocationBarProps {
  regionName: string | null;
  source: "saved" | "geolocation" | null;
  loading: boolean;
  onReset: () => void;
  onRequestGeolocation: () => void;
}

export const LocationBar: FC<LocationBarProps> = ({ regionName, source, loading, onReset, onRequestGeolocation }) => {
  if (loading) return null;

  // 未検出: 「現在地を検出」ボタンを表示
  if (!regionName) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono px-3 py-1.5 bg-bg rounded border border-border">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
        <span className="text-neutral-500">エリア未選択</span>
        <button
          onClick={onRequestGeolocation}
          className="text-success-soft hover:text-success-soft/80 ml-auto cursor-pointer"
        >
          現在地を検出
        </button>
      </div>
    );
  }

  const sourceLabel = source === "geolocation" ? "GPS" : source === "saved" ? "保存済み" : "";

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono px-3 py-1.5 bg-bg rounded border border-success-soft/30">
      <span className="w-1.5 h-1.5 rounded-full bg-success-soft shrink-0" />
      <span className="text-success-soft">現在地:</span>
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
