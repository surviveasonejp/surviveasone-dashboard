/**
 * 石油備蓄日数 国際比較
 *
 * IEA加盟国 + 日本に縁の深いアジア諸国の備蓄日数を比較表示。
 * 「日本だけが危ない」という誤読を防ぎ、地域全体の脆弱性を可視化する。
 *
 * データソース:
 * - IEA Oil Security Policy（各国レポート）
 * - Al Jazeera / The Diplomat / ING / Manila Times（2026年3月報道）
 * - 資源エネルギー庁 石油備蓄統計
 */

import { type FC } from "react";
import staticReserves from "../data/reserves.json";

interface CountryStock {
  country: string;
  days: number;
  note?: string;
  isJapan?: boolean;
  group: "iea" | "asia";
}

const COUNTRIES: CountryStock[] = [
  // IEA加盟国
  { country: "日本", days: 0, isJapan: true, group: "iea" },
  { country: "米国", days: 295, note: "SPR 3.9億バレル + 民間", group: "iea" },
  { country: "韓国", days: 192, note: "KNOC備蓄 + 民間70日義務", group: "iea" },
  { country: "フランス", days: 146, note: "SAGESS + CPSSP", group: "iea" },
  { country: "ドイツ", days: 138, note: "EBV管理 + 民間90日義務", group: "iea" },
  { country: "イタリア", days: 135, note: "OCSIT + 民間", group: "iea" },
  { country: "英国", days: 96, note: "民間義務のみ（国家備蓄なし）", group: "iea" },
  { country: "豪州", days: 69, note: "IEA義務未達（純輸出国に近い）", group: "iea" },
  // アジア諸国（日本に縁が深い国）
  { country: "台湾", days: 100, note: "政府発表100日超。中東依存70%", group: "asia" },
  { country: "インド", days: 74, note: "SPR 3拠点 + 民間。中東依存60%", group: "asia" },
  { country: "タイ", days: 61, note: "EGAT備蓄 + 民間。中東依存60%", group: "asia" },
  { country: "フィリピン", days: 21, note: "3週間分。輸入100%依存。ロシアに支援要請", group: "asia" },
  { country: "マレーシア", days: 30, note: "産油国だが精製能力不足", group: "asia" },
  { country: "インドネシア", days: 22, note: "財政最脆弱。補助金負担大", group: "asia" },
  { country: "ベトナム", days: 9, note: "国家備蓄9日。日韓に支援要請", group: "asia" },
  { country: "シンガポール", days: 45, note: "貯蔵ハブだが非公開。推定値", group: "asia" },
];

function getJapanIeaDays(): number {
  return Math.round(staticReserves.oil.totalReserveDays * 0.85);
}

interface StockBarProps {
  countries: CountryStock[];
  maxDays: number;
  ieaLine?: boolean;
}

const StockBars: FC<StockBarProps> = ({ countries, maxDays, ieaLine }) => (
  <div className="space-y-1">
    {countries.map((c) => {
      const pct = (c.days / maxDays) * 100;
      const isJapan = c.isJapan ?? false;
      const barColor = isJapan ? "#f59e0b"
        : c.days >= 90 ? "#22c55e"
        : c.days >= 30 ? "#f59e0b"
        : "#ef4444";

      return (
        <div key={c.country} className="flex items-center gap-2" title={c.note}>
          <span className={`text-[10px] font-mono w-20 text-right shrink-0 ${isJapan ? "text-[#f59e0b] font-bold" : "text-neutral-400"}`}>
            {c.country}
          </span>
          <div className="flex-1 h-3.5 bg-[#0c1018] rounded overflow-hidden relative">
            <div
              className="h-full rounded transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: barColor,
                opacity: isJapan ? 0.8 : c.days < 30 ? 0.7 : 0.4,
              }}
            />
            {ieaLine && (
              <div
                className="absolute top-0 h-full w-px bg-neutral-500 opacity-40"
                style={{ left: `${(90 / maxDays) * 100}%` }}
              />
            )}
          </div>
          <span className={`text-[10px] font-mono w-8 text-right shrink-0 ${
            isJapan ? "text-[#f59e0b] font-bold"
            : c.days < 30 ? "text-[#ef4444]"
            : "text-neutral-500"
          }`}>
            {c.days}日
          </span>
        </div>
      );
    })}
  </div>
);

export const IeaComparison: FC = () => {
  const japanDays = getJapanIeaDays();
  const all = COUNTRIES.map((c) => c.isJapan ? { ...c, days: japanDays } : c);

  const ieaCountries = all.filter((c) => c.group === "iea").sort((a, b) => b.days - a.days);
  const asiaCountries = all.filter((c) => c.group === "asia").sort((a, b) => b.days - a.days);
  const maxDays = Math.max(...all.map((c) => c.days));

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-5 space-y-4">
      <div className="font-mono text-xs tracking-widest text-neutral-500 text-center">
        INTERNATIONAL STOCKPILE COMPARISON
      </div>

      {/* IEA加盟国 */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-neutral-600 tracking-wider">IEA MEMBERS（義務: 90日）</div>
        <StockBars countries={ieaCountries} maxDays={maxDays} ieaLine />
      </div>

      {/* アジア諸国 */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-neutral-600 tracking-wider">ASIA（日本と関係の深い国）</div>
        <StockBars countries={asiaCountries} maxDays={maxDays} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-[8px] font-mono text-neutral-700 pt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-[#22c55e] opacity-40" />
          90日以上
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-[#f59e0b] opacity-40" />
          30-90日
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-[#ef4444] opacity-70" />
          30日未満
        </span>
        <span>|</span>
        <span>出典: IEA / Al Jazeera / The Diplomat / 資源エネルギー庁（2026年3月）</span>
      </div>
    </div>
  );
};
