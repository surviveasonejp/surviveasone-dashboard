/**
 * 石油備蓄日数 国際比較
 *
 * IEA加盟国 + 日本に縁の深いアジア諸国の備蓄日数を比較表示。
 * 「日本だけが危ない」という誤読を防ぎ、地域全体の脆弱性を可視化する。
 *
 * 2026年3月11日 IEA史上最大の協調放出（4.26億バレル）を反映。
 * 各国の放出量を差し引いた放出後の推定値を使用。
 *
 * データソース:
 * - IEA Oil Security Policy / 協調放出プレスリリース（2026年3月11日・19日）
 * - Al Jazeera / The Diplomat / S&P Global / BusinessToday（2026年3月報道）
 * - 資源エネルギー庁 石油備蓄統計（2026年3月23日）
 * - Asia Media Centre "The Hormuz Buffer"（2026年3月）
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
  // IEA加盟国（2026年3月IEA協調放出後の推定値）
  { country: "日本", days: 0, isJapan: true, group: "iea" },
  { country: "米国", days: 200, note: "SPR 4.15億バレルから172mb放出。純輸出国で義務免除", group: "iea" },
  { country: "韓国", days: 187, note: "KNOC 9拠点。22.5mb放出後推定。IEAベース公式208日だが輸出精製分除外の実質余力は68日（S&P Global 2026-03-11）", group: "iea" },
  { country: "フランス", days: 118, note: "SAGESS + 事業者。14.6mb放出", group: "iea" },
  { country: "ドイツ", days: 90, note: "EBV管理。19.5mb放出。義務ギリギリ", group: "iea" },
  { country: "スペイン", days: 92, note: "11.6mbを90日かけ放出", group: "iea" },
  { country: "イタリア", days: 90, note: "OCSIT管理。10mb放出。義務ギリギリ", group: "iea" },
  { country: "英国", days: 90, note: "国家備蓄なし・民間義務のみ。14mb放出", group: "iea" },
  { country: "豪州", days: 49, note: "IEA唯一の義務未達国。2012年以降ずっと未達", group: "iea" },
  // アジア諸国（日本と関係の深い国）
  { country: "中国", days: 120, note: "政府+商業推定。データ非公開。ロシアからパイプライン増量", group: "asia" },
  { country: "台湾", days: 100, note: "政府発表100日超。法定90日義務（政府30+民間60）", group: "asia" },
  { country: "タイ", days: 60, note: "EGAT備蓄+民間。政府がディーゼル価格凍結", group: "asia" },
  { country: "インド", days: 74, note: "国家SPR 9.5日分（充填率64%）＋商業在庫64.5日＝総合74日（BusinessToday / Business Standard 2026-03-24）。ロシア原油依存35.8%", group: "asia" },
  { country: "シンガポール", days: 45, note: "貯蔵ハブ。多くは外国企業の通過在庫。非公開", group: "asia" },
  { country: "マレーシア", days: 30, note: "産油国だが精製能力不足。燃料補助金維持", group: "asia" },
  { country: "インドネシア", days: 22, note: "財政最脆弱。B35/B40パーム油混合で代替推進", group: "asia" },
  { country: "フィリピン", days: 21, note: "国家非常事態宣言。戦略備蓄21日。ロシアに支援要請", group: "asia" },
  { country: "ベトナム", days: 9, note: "アジア最脆弱。精製システムも構造的脆弱。日韓に支援要請", group: "asia" },
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
    <div data-screenshot="iea-comparison" className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-5 space-y-4">
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
        <span>出典: IEA協調放出(3/11) / Al Jazeera / S&P Global / Asia Media Centre / 資源エネルギー庁（2026年3月）</span>
      </div>
    </div>
  );
};
