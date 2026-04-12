/**
 * PrefectureSelector — 都道府県を選ぶと対応エリアの詳細を表示しマップを連動させる。
 * RegionMap の 10 エリア UI を補完する「自分の都道府県から探す」インターフェース。
 * 都道府県固有の特徴（原発・主要港・離島）も付記する。
 */

import { type FC, useState } from "react";
import type { RegionCollapse } from "../../shared/types";

interface Props {
  regions: RegionCollapse[];
  onSelectRegion: (region: RegionCollapse) => void;
  selectedRegionId: string | null;
}

interface PrefectureInfo {
  name: string;
  region: string; // 10エリアのID
  nuclear: boolean;       // 原子力発電所あり（稼働・再稼働候補含む）
  majorPort: boolean;     // 主要石油輸入港あり
  island: boolean;        // 離島・半島・補給路が長い地域
  note?: string;          // 特記事項
}

const PREFECTURES: PrefectureInfo[] = [
  // 北海道
  { name: "北海道", region: "hokkaido", nuclear: true, majorPort: true, island: false,
    note: "泊原発（再稼働審査中）/ 苫小牧港（石油輸入拠点）/ 道路・鉄道が本州と分断" },
  // 東北
  { name: "青森", region: "tohoku", nuclear: false, majorPort: false, island: false },
  { name: "岩手", region: "tohoku", nuclear: false, majorPort: false, island: false },
  { name: "宮城", region: "tohoku", nuclear: true, majorPort: false, island: false,
    note: "女川原発（2024年再稼働）/ 仙台港は東北最大の物流拠点" },
  { name: "秋田", region: "tohoku", nuclear: false, majorPort: false, island: false },
  { name: "山形", region: "tohoku", nuclear: false, majorPort: false, island: false },
  { name: "福島", region: "tohoku", nuclear: false, majorPort: false, island: false,
    note: "第一・第二原発は廃炉作業中。電力需給は他エリアに依存" },
  // 関東（tokyo）
  { name: "茨城", region: "tokyo", nuclear: true, majorPort: false, island: false,
    note: "東海第二原発（再稼働審査中）/ 鹿嶋コンビナート（石油化学）" },
  { name: "栃木", region: "tokyo", nuclear: false, majorPort: false, island: false },
  { name: "群馬", region: "tokyo", nuclear: false, majorPort: false, island: false },
  { name: "埼玉", region: "tokyo", nuclear: false, majorPort: false, island: false },
  { name: "千葉", region: "tokyo", nuclear: false, majorPort: true, island: false,
    note: "京葉コンビナート（国内最大の石油・石化集積地）/ 千葉・市原港" },
  { name: "東京", region: "tokyo", nuclear: false, majorPort: false, island: true,
    note: "伊豆諸島・小笠原は内航船依存。本土停電は首都機能に直結" },
  { name: "神奈川", region: "tokyo", nuclear: false, majorPort: true, island: false,
    note: "横浜・川崎コンビナート（石油精製・LNG受入基地）/ 東京電力管内" },
  // 中部（chubu）
  { name: "山梨", region: "chubu", nuclear: false, majorPort: false, island: false },
  { name: "長野", region: "chubu", nuclear: false, majorPort: false, island: false,
    note: "内陸県。物流は道路のみ（鉄道貨物なし）。ガソリン制限の影響大" },
  { name: "静岡", region: "chubu", nuclear: true, majorPort: false, island: false,
    note: "浜岡原発（停止中・再稼働是非が課題）/ 清水港（石油製品輸入）" },
  { name: "愛知", region: "chubu", nuclear: false, majorPort: true, island: false,
    note: "四日市コンビナート（石油・石化）/ 名古屋港（輸出入額全国1位）" },
  { name: "岐阜", region: "chubu", nuclear: false, majorPort: false, island: false },
  // 北陸（hokuriku）
  { name: "新潟", region: "hokuriku", nuclear: true, majorPort: false, island: false,
    note: "柏崎刈羽原発（世界最大級・再稼働審査終了）/ 日本海側の物流要衝" },
  { name: "富山", region: "hokuriku", nuclear: false, majorPort: false, island: false },
  { name: "石川", region: "hokuriku", nuclear: true, majorPort: false, island: false,
    note: "志賀原発（再稼働審査中）/ 能登地域はインフラ脆弱" },
  { name: "福井", region: "hokuriku", nuclear: true, majorPort: false, island: false,
    note: "【原発集積県】大飯・高浜・美浜・敦賀が集中。再稼働進めば電力自給率が国内最高水準に" },
  // 関西（kansai）
  { name: "三重", region: "kansai", nuclear: false, majorPort: true, island: false,
    note: "四日市港（石油製品・化学品）/ 石油化学の集積地" },
  { name: "滋賀", region: "kansai", nuclear: false, majorPort: false, island: false },
  { name: "京都", region: "kansai", nuclear: false, majorPort: false, island: false },
  { name: "大阪", region: "kansai", nuclear: false, majorPort: true, island: false,
    note: "堺・泉北コンビナート（関西最大の石油精製）/ 大阪港は関西物流の要" },
  { name: "兵庫", region: "kansai", nuclear: false, majorPort: true, island: false,
    note: "神戸港（日本有数の輸入港）/ 播磨コンビナート / 離島（淡路島等）あり" },
  { name: "奈良", region: "kansai", nuclear: false, majorPort: false, island: false,
    note: "内陸県。物流は道路依存" },
  { name: "和歌山", region: "kansai", nuclear: false, majorPort: true, island: false,
    note: "有田コンビナート（石油精製・石化）/ 半島地形で道路代替が限られる" },
  // 中国（chugoku）
  { name: "鳥取", region: "chugoku", nuclear: false, majorPort: false, island: false },
  { name: "島根", region: "chugoku", nuclear: true, majorPort: false, island: false,
    note: "島根原発（2023年再稼働）/ 隠岐諸島は離島で補給路長い" },
  { name: "岡山", region: "chugoku", nuclear: false, majorPort: true, island: false,
    note: "水島コンビナート（中国地方最大の石油・石化集積地）/ 直島は離島" },
  { name: "広島", region: "chugoku", nuclear: false, majorPort: true, island: false,
    note: "広島港・福山港（石油製品）/ 瀬戸内島嶼部への物資補給あり" },
  { name: "山口", region: "chugoku", nuclear: false, majorPort: true, island: false,
    note: "周南コンビナート（石油精製・エチレン）/ 徳山下松港（石油基地）" },
  // 四国（shikoku）
  { name: "徳島", region: "shikoku", nuclear: false, majorPort: false, island: false,
    note: "本州との接続は明石海峡・大鳴門橋のみ。橋梁封鎖リスクあり" },
  { name: "香川", region: "shikoku", nuclear: false, majorPort: false, island: true,
    note: "瀬戸内小島多数。海上輸送依存" },
  { name: "愛媛", region: "shikoku", nuclear: true, majorPort: true, island: true,
    note: "伊方原発（運転中）/ 菊間・新居浜港（代替ルート第1便到着地）/ 島嶼部多数" },
  { name: "高知", region: "shikoku", nuclear: false, majorPort: false, island: false,
    note: "物流路が山岳地形で分断されやすい。食料自給率は高め（農業が主産業）" },
  // 九州（kyushu）
  { name: "福岡", region: "kyushu", nuclear: false, majorPort: true, island: false,
    note: "北九州・博多港（石油製品）/ 九州の物流・経済の中心" },
  { name: "佐賀", region: "kyushu", nuclear: true, majorPort: false, island: false,
    note: "玄海原発（運転中）/ 原発電力が九州の電力自給率を押し上げる" },
  { name: "長崎", region: "kyushu", nuclear: false, majorPort: false, island: true,
    note: "島嶼部が多い（対馬・壱岐・五島列島）。離島への補給路が長く停電・断水リスク高" },
  { name: "熊本", region: "kyushu", nuclear: false, majorPort: false, island: false },
  { name: "大分", region: "kyushu", nuclear: false, majorPort: true, island: false,
    note: "大分コンビナート（石油精製・エチレン・鉄鋼）/ 大分港" },
  { name: "宮崎", region: "kyushu", nuclear: false, majorPort: false, island: false },
  { name: "鹿児島", region: "kyushu", nuclear: true, majorPort: false, island: true,
    note: "川内原発（運転中）/ 離島（屋久島・奄美大島・種子島ほか多数）への補給路が長い" },
  // 沖縄
  { name: "沖縄", region: "okinawa", nuclear: false, majorPort: false, island: true,
    note: "【離島特性】全物資を海上輸送に依存。石油備蓄は15〜20日分と推定。本土封鎖時に影響が最も早く顕在化する地域" },
];

const REGION_LABELS: Record<string, string> = {
  hokkaido: "北海道",
  tohoku:   "東北",
  tokyo:    "関東",
  chubu:    "中部",
  hokuriku: "北陸",
  kansai:   "関西",
  chugoku:  "中国",
  shikoku:  "四国",
  kyushu:   "九州",
  okinawa:  "沖縄",
};

export const PrefectureSelector: FC<Props> = ({ regions, onSelectRegion, selectedRegionId: _selectedRegionId }) => {
  const [selectedPref, setSelectedPref] = useState<PrefectureInfo | null>(null);

  const handleSelect = (prefName: string) => {
    const pref = PREFECTURES.find((p) => p.name === prefName);
    if (!pref) return;
    setSelectedPref(pref);

    // 対応エリアの RegionCollapse を探してマップ・詳細パネルに反映
    const region = regions.find((r) => r.id === pref.region);
    if (region) onSelectRegion(region);
  };

  const regionData = selectedPref
    ? regions.find((r) => r.id === selectedPref.region) ?? null
    : null;

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-mono text-xs tracking-widest text-neutral-500">
          PREFECTURE — 都道府県から探す
        </div>
        <div className="text-[10px] text-neutral-400 font-mono">
          地図のエリア表示と連動
        </div>
      </div>

      {/* 都道府県セレクタ */}
      <select
        className="w-full bg-panel border border-border rounded px-3 py-2 text-sm text-text font-mono focus:outline-none focus:border-[#2563eb]/60 transition-colors"
        value={selectedPref?.name ?? ""}
        onChange={(e) => handleSelect(e.target.value)}
      >
        <option value="">都道府県を選択...</option>
        {PREFECTURES.map((pref) => (
          <option key={pref.name} value={pref.name}>
            {pref.name}（{REGION_LABELS[pref.region] ?? pref.region}エリア）
          </option>
        ))}
      </select>

      {/* 選択後の詳細 */}
      {selectedPref && regionData && (
        <div className="space-y-3 border-t border-border pt-3">
          {/* 都道府県名 + エリア */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-sm text-text">{selectedPref.name}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#2563eb]/10 text-[#2563eb] border border-[#2563eb]/20">
              {REGION_LABELS[selectedPref.region] ?? selectedPref.region}エリア
            </span>
            {selectedPref.nuclear && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#22c55e]/12 text-[#22c55e] border border-[#22c55e]/20">
                原発あり
              </span>
            )}
            {selectedPref.majorPort && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#3b82f6]/12 text-[#3b82f6] border border-[#3b82f6]/20">
                主要港あり
              </span>
            )}
            {selectedPref.island && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#f59e0b]/12 text-[#f59e0b] border border-[#f59e0b]/20">
                離島・補給路長
              </span>
            )}
          </div>

          {/* エリア全体の影響データ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "電力制約", days: regionData.powerCollapseDays, color: "#ef4444" },
              { label: "物流制約", days: regionData.logisticsCollapseDays, color: "#8b5cf6" },
              { label: "食料影響", days: regionData.collapseDays, color: "#f59e0b" },
              { label: "石油枯渇", days: regionData.oilDepletionDays, color: "#d97706" },
            ].map(({ label, days, color }) => (
              <div key={label} className="bg-bg rounded p-2 text-center border border-border">
                <div className="text-[9px] font-mono text-neutral-500">{label}</div>
                <div className="font-mono font-bold text-base" style={{ color }}>
                  {days}日
                </div>
              </div>
            ))}
          </div>

          {/* 特記事項 */}
          {selectedPref.note && (
            <p className="text-[11px] text-text-muted leading-relaxed bg-bg rounded p-2.5 border border-border">
              <span className="font-mono text-[9px] text-neutral-400 tracking-wider block mb-1">特記事項</span>
              {selectedPref.note}
            </p>
          )}

          {/* エリア脆弱性ランク */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-neutral-400">エリア脆弱性ランク:</span>
            <span className="font-bold text-sm text-text">{regionData.vulnerabilityRank}</span>
            <span className="text-neutral-500 ml-auto">{regionData.note}</span>
          </div>

          <p className="text-[9px] text-neutral-400 leading-relaxed">
            表示値は{REGION_LABELS[selectedPref.region]}エリア全体の推計です。都道府県内の格差（都市部/農村部・離島）は考慮されていません。
          </p>
        </div>
      )}

      {!selectedPref && (
        <p className="text-[11px] text-neutral-400 text-center py-1 font-mono">
          都道府県を選ぶと地図のエリアがハイライトされます
        </p>
      )}
    </div>
  );
};
