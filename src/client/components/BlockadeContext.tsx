/**
 * 封鎖コンテキストバー
 *
 * 封鎖開始日からの経過日数と現在日付を表示し、
 * 全ページの時間軸を統一する文脈を提供する。
 */

import { type FC, useMemo } from "react";
import realEventsData from "../../worker/data/realEvents.json";

function calcDaysSinceBlockade(): { daysSince: number; startDate: string; todayStr: string } {
  const start = new Date(realEventsData.blockadeStartDate);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const todayStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
  return { daysSince, startDate: realEventsData.blockadeStartDate, todayStr };
}

export const BlockadeContext: FC = () => {
  const { daysSince, startDate, todayStr } = useMemo(calcDaysSinceBlockade, []);

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500 px-3 py-1.5 bg-[#0f1419] rounded border border-[#1e2a36]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] shrink-0" />
      <span>
        危機 Day <span className="text-neutral-300 font-bold">{daysSince}</span>
      </span>
      <span className="text-neutral-700">|</span>
      <span>
        開始 {startDate.replace(/-/g, "/")} → 現在 {todayStr}
      </span>
      <span className="text-neutral-700">|</span>
      <span>以下の日数は<span className="text-neutral-400">今日からの残日数</span></span>
    </div>
  );
};
