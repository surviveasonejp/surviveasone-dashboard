/**
 * データ更新ログ
 *
 * reserves.json の更新履歴 + D1 の履歴APIから直近の更新を表示。
 * 「いつ・何が・どう変わったか」の透明性を提供。
 */

import { type FC } from "react";
import staticReserves from "../data/reserves.json";

interface UpdateEntry {
  date: string;
  description: string;
  source: string;
}

// 手動更新ログ（reserves.jsonの変更履歴。将来はD1の履歴APIから動的取得）
const UPDATE_LOG: UpdateEntry[] = [
  {
    date: "2026-03-23",
    description: `石油備蓄 241日に更新（国家146日・民間89日・共同6日）。民間備蓄放出3/16開始を反映`,
    source: "経産省 2026-03-20推計",
  },
  {
    date: "2026-03-23",
    description: "タンカー12隻のIMO番号を全て修正。HAKATA(売却済)をENEOS OCEANに置換",
    source: "MarineTraffic / VesselFinder",
  },
  {
    date: "2026-03-23",
    description: "石化カスケード(napthaFactor)を化学日報報道に基づき上方修正",
    source: "化学日報 2026-03-19",
  },
  {
    date: "2026-03-22",
    description: "石油備蓄254日（国家146日+民間101日+共同7日）で初期データ設定",
    source: "資源エネルギー庁 2025-12末",
  },
];

export const UpdateLog: FC = () => {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-mono text-neutral-600 tracking-wider">
        DATA UPDATE LOG
      </div>
      <div className="space-y-1">
        {UPDATE_LOG.slice(0, 5).map((entry, i) => (
          <div
            key={i}
            className="flex gap-2 text-[10px] font-mono"
          >
            <span className="text-neutral-600 shrink-0 w-20">{entry.date}</span>
            <span className="text-neutral-400 flex-1">{entry.description}</span>
            <span className="text-neutral-600 shrink-0 hidden sm:block">{entry.source}</span>
          </div>
        ))}
      </div>
      <div className="text-[9px] text-neutral-700 font-mono">
        次回自動更新: 毎月18日（石油備蓄PDF取得）| 基準日: {staticReserves.meta.baselineDate}
      </div>
    </div>
  );
};
