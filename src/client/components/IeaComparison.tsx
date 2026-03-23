/**
 * IEA加盟国 石油備蓄日数比較
 *
 * IEA義務: 90日分（純輸入基準）。日本はIEA基準で上位の備蓄水準。
 * 「日本だけが危ない」という誤読を防ぎ、シミュレーションの文脈を提供する。
 *
 * データソース:
 * - IEA Oil Security Policy（各国レポート）
 * - IEA Oil Stocks of IEA Countries（2024-2025年データ）
 * - 資源エネルギー庁 石油備蓄統計
 * ※ 各国の備蓄日数は公開情報から取得した概数値。IEA基準（純輸入ベース）で統一。
 */

import { type FC } from "react";
import staticReserves from "../data/reserves.json";

interface CountryStock {
  country: string;
  flag: string;
  days: number;
  note?: string;
  isJapan?: boolean;
}

// IEA公開データ・各国レポートに基づく主要国の備蓄日数（純輸入ベース概数）
const COUNTRIES: CountryStock[] = [
  { country: "日本", flag: "JP", days: 0, isJapan: true }, // reserves.jsonから動的取得
  { country: "米国", flag: "US", days: 295, note: "SPR 3.9億バレル + 民間" },
  { country: "韓国", flag: "KR", days: 192, note: "KNOC備蓄 + 民間70日義務" },
  { country: "ドイツ", flag: "DE", days: 138, note: "EBV管理 + 民間90日義務" },
  { country: "フランス", flag: "FR", days: 146, note: "SAGESS + CPSSP" },
  { country: "英国", flag: "GB", days: 96, note: "民間義務のみ（国家備蓄なし）" },
  { country: "イタリア", flag: "IT", days: 135, note: "OCSIT + 民間" },
  { country: "豪州", flag: "AU", days: 69, note: "IEA義務未達（純輸出国に近い）" },
];

// 日本の日数をreserves.jsonから取得（IEA基準は国内日数より低い）
function getJapanIeaDays(): number {
  // IEA基準 = 純輸入ベース。国内基準(241日等)より低い
  // 概算: 国内基準の約85% (国内消費 vs 純輸入の差)
  return Math.round(staticReserves.oil.totalReserveDays * 0.85);
}

export const IeaComparison: FC = () => {
  const japanDays = getJapanIeaDays();
  const countries = COUNTRIES.map((c) =>
    c.isJapan ? { ...c, days: japanDays } : c,
  ).sort((a, b) => b.days - a.days);

  const maxDays = Math.max(...countries.map((c) => c.days));

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-5 space-y-3">
      <div className="font-mono text-xs tracking-widest text-neutral-500 text-center">
        IEA MEMBER STOCKPILE COMPARISON
      </div>
      <p className="text-xs text-neutral-600 text-center">
        IEA義務: 90日分（純輸入基準）| 日本はIEA加盟国で上位の備蓄水準
      </p>

      <div className="space-y-1.5">
        {countries.map((c) => {
          const pct = (c.days / maxDays) * 100;
          const isJapan = c.isJapan ?? false;
          const meetsIea = c.days >= 90;
          const barColor = isJapan ? "#f59e0b" : meetsIea ? "#22c55e" : "#ef4444";

          return (
            <div key={c.country} className="flex items-center gap-2">
              <span className={`text-xs font-mono w-16 text-right shrink-0 ${isJapan ? "text-[#f59e0b] font-bold" : "text-neutral-400"}`}>
                {c.country}
              </span>
              <div className="flex-1 h-4 bg-[#0c1018] rounded overflow-hidden relative">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: barColor,
                    opacity: isJapan ? 0.8 : 0.4,
                  }}
                />
                {/* IEA義務ライン (90日) */}
                <div
                  className="absolute top-0 h-full w-px bg-neutral-500 opacity-40"
                  style={{ left: `${(90 / maxDays) * 100}%` }}
                />
              </div>
              <span className={`text-xs font-mono w-10 text-right shrink-0 ${isJapan ? "text-[#f59e0b] font-bold" : "text-neutral-500"}`}>
                {c.days}日
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-[9px] font-mono text-neutral-600 pt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-px h-3 bg-neutral-500 opacity-40" />
          IEA義務90日
        </span>
        <span>出典: IEA Oil Security Policy / 資源エネルギー庁</span>
      </div>
    </div>
  );
};
