/**
 * 石油備蓄日数 国際比較
 *
 * IEA加盟国 + 日本に縁の深いアジア諸国の備蓄日数を比較表示。
 * 「日本だけが危ない」という誤読を防ぎ、地域全体の脆弱性を可視化する。
 *
 * 2026年4月24日更新。3/11 IEA史上最大の協調放出（4億バレル）後の進行値を反映。
 * 欧州各国は放出完了後に90日義務を下回る状況（英国39日・イタリア54日）。
 * アジア各国はForbes Japan/Bloomberg/時事（2026年3月）・EIA/Kpler（2025-12〜2026-04）の最新値。
 *
 * データソース:
 * - IEA Oil Security Policy / 協調放出プレスリリース（2026年3月11日）
 * - IEA Oil Market Report April 2026
 * - EIA Weekly Petroleum Status Report（2026年4月22日・4/17時点）
 * - EIA Today in Energy 67504「China, US, Japan hold most strategic oil inventories」（2026年4月）
 * - Kpler / Energy Aspects 中国在庫推計（2025年12月〜2026年4月）
 * - DropThe "32 Nations Just Emptied Their Oil Reserves"（2026年3月）
 * - Al Jazeera "Which countries have strategic oil reserves"（2026年3月23日）
 * - S&P Global / KED Global / Bloomberg / Focus Taiwan（2026年3月〜4月報道）
 * - Nation Thailand（2026年4月24日・タイ110日発表）
 * - DOE Philippines / Rappler（2026年4月5日・フィリピン51日）
 * - The Edge Malaysia / PETRONAS（2026年4月・マレーシア60日）
 * - DCCEEW Australia（2026年4月12日・豪州39日）
 * - Euronews / Clean Energy Wire（2026年3〜4月・欧州各国）
 * - Forbes Japan「石油枯渇の危険性が最も高い国々」（2026年3月）
 * - 時事通信「東南ア各国が燃料消費の抑制に動く」（2026年3月〜4月）
 * - 資源エネルギー庁 石油備蓄統計（2026年4月8日速報・4/5時点）
 * - 経産省プレスリリース 20260424009（第2弾国家備蓄原油放出・2026年4月24日）
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
  // IEA加盟国（3/11協調放出進行中・2026年4月24日時点）
  { country: "日本", days: 0, isJapan: true, group: "iea" },
  { country: "米国", days: 185, note: "SPR 4/17時点405.0MB（前週比▲4.2MB・4/3比▲8.3MB）。172mb放出計画を1.43mbpdで継続中・7月中旬完了予定。純輸出国でIEA義務免除。輸入量ベース換算約185日（EIA WPSR 2026-04-22）", group: "iea" },
  { country: "韓国", days: 187, note: "KNOC 9拠点。22.46mb放出後IEA公式187日。3/31開始のスワップ制度（4-5月・月次延長可）に国内4大精製会社が2,000万バレル超の需要。輸出精製分除外の実質余力は68日（S&P Global / KED Global 2026-03〜04）", group: "iea" },
  { country: "フランス", days: 70, note: "SAGESS + 事業者。14.6mb放出後70日推定（DropThe 2026-03）。協調放出で90日義務を下回る", group: "iea" },
  { country: "ドイツ", days: 76, note: "EBV管理。19.5mb放出後76日推定（DropThe 2026-03）。90日義務をわずかに上回る", group: "iea" },
  { country: "スペイン", days: 80, note: "11.6mb放出後80日推定。90日義務を下回る", group: "iea" },
  { country: "イタリア", days: 54, note: "OCSIT管理。10mb放出後54日推定（DropThe 2026-03）。90日義務を大幅に下回る", group: "iea" },
  { country: "英国", days: 39, note: "国家備蓄なし・民間義務のみ。14mb放出後39日（DropThe 2026-03）。欧州最脆弱", group: "iea" },
  { country: "豪州", days: 39, note: "オンショア液体燃料39日分（DCCEEW 2026-04-12時点）。IEA義務未達（2012年以降）。SPR放出後は27日に一時低下。ガソリン38日・軽油30日・ジェット燃料30日（2026-03-21時点）。中東依存低くLNG自給", group: "iea" },
  // アジア諸国（日本と関係の深い国）
  { country: "中国", days: 121, note: "EIA/Kpler最新推計で総在庫（商業+戦略）15億バレル超・輸入カバー約121日（IEA90日基準大幅超過）。2025年平均1.1mbpd積み増し・容量20億バレル規模。データ非公開。ロシア産を『バックストップ供給』として位置づけ", group: "asia" },
  { country: "台湾", days: 100, note: "CPC+台塑が管理。法定90日義務超・政府発表100日超。4月紅海経由で約800万バレル（月需要の1/3）調達でホルムズ迂回。Focus Taiwan 2026-04-08", group: "asia" },
  { country: "インド", days: 74, note: "国家SPR 9.5日分（5.33MMT容量・充填率64%・実在庫約25MB）＋商業在庫64.5日＝総合74日（PIB India / ISPRL 2026-04）。ロシア原油依存35.8%。石化・ガス供給義務免除宣言", group: "asia" },
  { country: "タイ", days: 110, note: "タイ政府発表110日分（Nation Thailand 2026-04-24）: 法定25日+商業25日+輸送中37日+確約供給23日。中東依存57%。Oil Fuel Fund赤字620億バーツ超・バイオ燃料混合比率引き上げ・燃料輸出停止を実施", group: "asia" },
  { country: "シンガポール", days: 40, note: "貯蔵ハブ。貯蔵容量は245日相当だが、多くは外国企業の通過在庫・輸出契約分。実質国内カバーは40日分（Black Dot Research / Forbes Japan 2026-03〜04）", group: "asia" },
  { country: "マレーシア", days: 60, note: "Anwar首相が5月まで供給確保と表明（The Edge Malaysia 2026-04）。IEA非加盟・公式SPRなし。PETRONAS/精製会社の商業在庫ベースで約60日。精製用原油輸入依存41%。燃料補助金維持", group: "asia" },
  { country: "インドネシア", days: 22, note: "燃料備蓄21〜23日分（Al Jazeera / VIR 2026-03〜04）。ホルムズ通過の原油輸入は約25%。B35/B40パーム油混合で代替推進。財政最脆弱クラス", group: "asia" },
  { country: "フィリピン", days: 51, note: "DOE発表総合51日分（Migrant Times / Rappler 2026-04-05）。LPG 33日分（4/3時点）。国家エネルギー非常事態宣言・週4日出勤導入。原油輸入の98%が中東依存", group: "asia" },
  { country: "ベトナム", days: 30, note: "国内需要30〜45日分（Al Jazeera 2026-03 / VIR 2026-04）。精製システムも構造的脆弱。石化・ガス供給義務免除宣言。日韓に支援要請", group: "asia" },
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
          <span className={`text-[10px] font-mono w-20 text-right shrink-0 ${isJapan ? "text-warning-soft font-bold" : "text-neutral-400"}`}>
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
            isJapan ? "text-warning-soft font-bold"
            : c.days < 30 ? "text-primary-soft"
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
          <span className="inline-block w-2 h-2 rounded-sm bg-success-soft opacity-40" />
          90日以上
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-warning-soft opacity-40" />
          30-90日
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-primary-soft opacity-70" />
          30日未満
        </span>
        <span>|</span>
        <span>出典: IEA OMR4月版 / 協調放出(3/11) / EIA WPSR(4/22) / EIA Today in Energy / Kpler / DropThe / Al Jazeera(3/23) / S&P Global / KED Global / Nation Thailand / DOE Philippines / Focus Taiwan / DCCEEW / Edge Malaysia / Forbes Japan / 時事通信 / 資源エネルギー庁 / 経産省20260424009（2026年4月24日更新）</span>
      </div>
    </div>
  );
};
