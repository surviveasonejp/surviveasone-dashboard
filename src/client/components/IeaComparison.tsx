/**
 * 石油備蓄日数 国際比較
 *
 * IEA加盟国 + 日本に縁の深いアジア諸国の備蓄日数を比較表示。
 * 「日本だけが危ない」という誤読を防ぎ、地域全体の脆弱性を可視化する。
 *
 * 2026年4月3日更新。3/11 IEA史上最大の協調放出（4億バレル）後の推定値を反映。
 * 欧州各国は放出完了後に90日義務を下回る状況（英国39日・イタリア54日）。
 * アジア各国はForbes Japan/Bloomberg/時事（2026年3月）の最新報道値。
 *
 * データソース:
 * - IEA Oil Security Policy / 協調放出プレスリリース（2026年3月11日）
 * - DropThe "32 Nations Just Emptied Their Oil Reserves"（2026年3月）
 * - Al Jazeera "Which countries have strategic oil reserves"（2026年3月23日）
 * - S&P Global / Bloomberg（2026年3月〜4月報道）
 * - Forbes Japan「石油枯渇の危険性が最も高い国々」（2026年3月）
 * - 時事通信「東南ア各国が燃料消費の抑制に動く」（2026年3月〜4月）
 * - 資源エネルギー庁 石油備蓄統計（2026年3月23日）
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
  // IEA加盟国（3/11協調放出完了後の推定値・2026年4月3日時点）
  { country: "日本", days: 0, isJapan: true, group: "iea" },
  { country: "米国", days: 200, note: "SPR 4.15億バレルから172mb放出後も約243mb残存。純輸出国でIEA義務免除。輸入量ベース換算約150日（放出後）", group: "iea" },
  { country: "韓国", days: 187, note: "KNOC 9拠点。22.5mb放出後IEA公式187日。ただし輸出精製分除外の実質余力は68日（S&P Global 2026-03-11）", group: "iea" },
  { country: "フランス", days: 70, note: "SAGESS + 事業者。14.6mb放出後70日推定（DropThe 2026-03）。協調放出で90日義務を下回る", group: "iea" },
  { country: "ドイツ", days: 76, note: "EBV管理。19.5mb放出後76日推定（DropThe 2026-03）。90日義務をわずかに上回る", group: "iea" },
  { country: "スペイン", days: 80, note: "11.6mb放出後80日推定。90日義務を下回る", group: "iea" },
  { country: "イタリア", days: 54, note: "OCSIT管理。10mb放出後54日推定（DropThe 2026-03）。90日義務を大幅に下回る", group: "iea" },
  { country: "英国", days: 39, note: "国家備蓄なし・民間義務のみ。14mb放出後39日（DropThe 2026-03）。欧州最脆弱", group: "iea" },
  { country: "豪州", days: 49, note: "IEA唯一の義務未達国。2012年以降ずっと未達。中東依存低くLNG自給", group: "iea" },
  // アジア諸国（日本と関係の深い国）
  { country: "中国", days: 90, note: "推計約9億バレル（ロイター2026-03）。輸入量ベース78日分＋商業在庫合計で約90日。データ非公開。ロシアからパイプライン増量で備蓄加速", group: "asia" },
  { country: "台湾", days: 100, note: "政府発表100日超。法定90日義務（政府30+民間60）。Al Jazeera 2026-03-23確認", group: "asia" },
  { country: "インド", days: 74, note: "国家SPR 9.5日分（充填率64%）＋商業在庫64.5日＝総合74日（BusinessToday 2026-03-24）。ロシア原油依存35.8%。石化・ガス供給義務免除宣言", group: "asia" },
  { country: "タイ", days: 61, note: "総在庫61日分（時事 2026-03）。燃料全品目値上げ・バイオ燃料混合比率引き上げ・燃料輸出停止を実施", group: "asia" },
  { country: "シンガポール", days: 40, note: "貯蔵ハブ。多くは外国企業の通過在庫。実質国内カバーは40日分（Forbes Japan 2026-03）", group: "asia" },
  { country: "マレーシア", days: 30, note: "産油国だが精製能力不足。燃料補助金維持。ホルムズ依存低い", group: "asia" },
  { country: "インドネシア", days: 20, note: "財政最脆弱。20日分（時事 2026-03）。B35/B40パーム油混合で代替推進。予算見直し検討", group: "asia" },
  { country: "フィリピン", days: 60, note: "商業在庫含む総在庫60日分（時事 2026-03）。国家エネルギー非常事態宣言・週4日出勤導入。政府備蓄は約45日分", group: "asia" },
  { country: "ベトナム", days: 15, note: "アジア最脆弱クラス。15日分（Forbes Japan / 時事 2026-03）。精製システムも構造的脆弱。石化・ガス供給義務免除宣言。日韓に支援要請", group: "asia" },
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
    <div data-screenshot="iea-comparison" className="bg-panel border border-border rounded-lg p-5 space-y-4">
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
        <span>出典: IEA協調放出(3/11) / DropThe / Al Jazeera(3/23) / S&P Global / Forbes Japan / 時事通信 / 資源エネルギー庁（2026年4月3日更新）</span>
      </div>
    </div>
  );
};
