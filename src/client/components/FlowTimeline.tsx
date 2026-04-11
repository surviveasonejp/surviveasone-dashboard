import { type FC, useMemo, useState } from "react";
import { type ScenarioId } from "../../shared/scenarios";
import type { FlowSimulationResult, PolicyEffects, ThresholdEvent } from "../../shared/types";
import { useApiData } from "../hooks/useApiData";
import realEventsData from "../../worker/data/realEvents.json";

interface FlowTimelineProps {
  scenarioId: ScenarioId;
}

const RESOURCE_COLORS = {
  oil: "#f59e0b",
  lng: "#94a3b8",
  power: "#ef4444",
  water: "#3b82f6",
  logistics: "#8b5cf6",
};

const EVENT_ICON: Record<string, string> = {
  price_spike: "△",
  rationing: "▽",
  distribution: "◆",
  stop: "■",
  water_pressure: "〜",
  water_cutoff: "✕",
  water_sanitation: "☠",
  waste_collection: "🗑",
  waste_incineration: "🔥",
  logistics_limit: "🚚",
  logistics_stop: "⛔",
};

// 閾値イベント別 推奨アクション
const ACTION_BY_TYPE: Partial<Record<string, string[]>> = {
  price_spike: [
    "生活用・通勤用燃料の備蓄を現在の2週間分に確認・補充する",
    "ガソリン単価・灯油単価の記録を開始する（値上がり追跡）",
    "不要なドライブ・長距離外出を控える",
    "処方薬を2ヶ月分まとめて調剤する相談を主治医にする",
  ],
  rationing: [
    "【石油需給適正化法 発動】用途別優先配分開始 — 医療・食料・物流が法的優先、一般産業は制限対象",
    "公共交通・自転車・徒歩ルートを今すぐ確認する",
    "職場・学校への緊急連絡手段を再確認する",
    "車での長距離移動は極力控え、用件をまとめる",
    "【IT連鎖崩壊に備え】現金を5万円以上手元に置く — 電力30%削減でデータセンター輪番停電→Suica/PayPay等キャッシュレス決済停止→ATM混雑の順に波及",
  ],
  distribution: [
    "【国民生活安定緊急措置法 発動】正式配給制 — 企業割当・購入許可制・転売禁止が法的に発動",
    "地域の配給センター・受付窓口（市区町村窓口・給水所）を確認する",
    "現金・証明書類（マイナンバーカード等）を手元に準備する",
    "近隣と互助グループを形成する（特に要配慮者がいる場合）",
    "食料消費量を記録し、残量管理を始める",
  ],
  stop: [
    "徒歩・自転車圏内での生活に切り替える",
    "水・食料の厳格な管理・記録を開始する（1日分ずつ把握）",
    "地域コミュニティに参加し情報・物資を共有する",
    "食料自給率の高い地域への移動を検討する",
  ],
  water_pressure: [
    "浴槽・容器に今すぐ水を確保する（1人3L/日 × 最低7日分）",
    "近隣の給水所・給水車の場所を事前確認する",
    "飲料水以外の用途（トイレ・清拭）に生活用水を分けて管理する",
  ],
  water_cutoff: [
    "浴槽・ポリタンクに確保した水を節約して使う",
    "携帯浄水フィルター・浄水タブレットを準備する",
    "簡易トイレ（凝固剤+ビニール袋）を使用開始する",
    "給水所への往復ルートを家族で確認する",
  ],
  logistics_limit: [
    "食料・日用品の2〜4週間備蓄量を今すぐ確認する",
    "地元スーパー・農家からの直接調達ルートを調べる",
    "処方薬を1〜2ヶ月分まとめて調剤してもらう相談をする",
    "【IT連鎖崩壊】電力削減30%超→データセンター輪番停電→物流管理システム・受発注システム停止→トラック配車不能・店舗入荷停止が加速。注文システムに頼らない仕入れルート（現地農家・卸）を確保する",
  ],
  logistics_stop: [
    "残存備蓄量を把握し、1日の消費量を厳格に管理する",
    "地域の食料配給・物資支援の情報を自治体から入手する",
    "近隣住民と物資を分かち合い、役割分担を話し合う",
  ],
  waste_collection: [
    "ゴミ袋を密封し、屋外・日陰の風通しが良い場所に仮置きする",
    "生ゴミは乾燥・脱水してから袋に入れ、臭いと腐敗を抑える",
    "地域の自治体・町内会に仮置き場・収集再開情報を確認する",
    "段ボールや紙類は分けておき、容積を減らすよう折り畳む",
  ],
  waste_incineration: [
    "焼却できない生ゴミは土中に埋設するか乾燥させて保管する",
    "感染リスクのある廃棄物（おむつ・医療廃棄物）は密封し分別管理する",
    "コンポスト・発酵処理で生ゴミを減量する方法を調べる",
    "廃棄物の自家処理ルールを自治体・近隣と共有する",
  ],
  water_sanitation: [
    "手洗い・食器洗いに消毒液（次亜塩素酸水・アルコール）を代用する",
    "感染症（赤痢・コレラ）予防のため、生水の飲用を避け必ず煮沸する",
    "トイレ排水が使えない場合は簡易トイレ＋凝固剤で対応する",
    "近隣に感染症の疑いがある場合は保健所・自治体に即報告する",
  ],
};

// 政策発動シナリオ
const POLICY_EVENTS: Array<{
  dayOffset: number;
  category: "spr_release" | "demand_cut" | "lng_spot";
  label: string;
  effect: string;
  note: string;
}> = [
  {
    dayOffset: 3,
    category: "demand_cut",
    label: "緊急節電要請（-15%目標）",
    effect: "電力崩壊日数 +20〜35日",
    note: "東日本大震災実績（15%削減達成）に基づく試算",
  },
  {
    dayOffset: 7,
    category: "demand_cut",
    label: "燃料消費制限（-10%）",
    effect: "石油枯渇日数 +10〜18日",
    note: "給油制限・奇数偶数制が全国展開された場合",
  },
  {
    dayOffset: 14,
    category: "spr_release",
    label: "国家備蓄放出開始（IEA協調）",
    effect: "石油枯渇日数 +14〜30日",
    note: "14日リードタイム後、30万kL/日放出開始（石油備蓄法+JOGMEC）",
  },
  {
    dayOffset: 21,
    category: "lng_spot",
    label: "LNGスポット緊急調達（非ホルムズ）",
    effect: "LNG在庫 +5〜10日相当",
    note: "米国・豪州からのスポット契約成立率70%の試算",
  },
];

const POLICY_COLORS: Record<string, string> = {
  spr_release: "#3b82f6",
  demand_cut: "#22c55e",
  lng_spot: "#94a3b8",
};

const POLICY_LABELS: Record<string, string> = {
  spr_release: "備蓄放出",
  demand_cut: "需要削減",
  lng_spot: "LNG調達",
};

// 崩壊フェーズの背景帯
const PHASE_BANDS: Array<{
  minPct: number;
  maxPct: number;
  color: string;
}> = [
  { minPct: 50, maxPct: 100, color: "#22c55e08" },
  { minPct: 30, maxPct: 50, color: "#94a3b810" },
  { minPct: 10, maxPct: 30, color: "#f59e0b12" },
  { minPct: 0, maxPct: 10, color: "#ef444418" },
];

const EMPTY_RESULT: FlowSimulationResult = {
  timeline: [],
  oilDepletionDay: 365,
  lngDepletionDay: 365,
  powerCollapseDay: 365,
  thresholds: [],
};

export const FlowTimeline: FC<FlowTimelineProps> = ({ scenarioId }) => {
  const { data: apiResult } = useApiData<FlowSimulationResult>(
    `/api/simulation?scenario=${scenarioId}`,
    EMPTY_RESULT,
  );
  const result = apiResult ?? EMPTY_RESULT;

  const samples = useMemo(() => {
    if (result.timeline.length === 0) return [];
    const step = Math.max(1, Math.floor(result.timeline.length / 150));
    return result.timeline.filter((_, i) => i % step === 0 || i === result.timeline.length - 1);
  }, [result]);

  const maxOil = useMemo(
    () => result.timeline.length > 0 ? Math.max(...result.timeline.map((s) => s.oilStock_kL), 1) : 1,
    [result],
  );
  const maxLng = useMemo(
    () => result.timeline.length > 0 ? Math.max(...result.timeline.map((s) => s.lngStock_t), 1) : 1,
    [result],
  );

  const totalDays = result.timeline.length;

  // X軸ラベル（月単位）
  const monthMarkers = useMemo(() => {
    const markers: Array<{ day: number; label: string }> = [];
    for (let m = 0; m <= 12; m++) {
      const day = m * 30;
      if (day <= totalDays) {
        markers.push({ day, label: m === 0 ? "発生" : `${m}ヶ月` });
      }
    }
    return markers;
  }, [totalDays]);

  // イベントを時系列でソート（歴史マーカー除外）
  const sortedEvents = useMemo(() =>
    result.thresholds
      .filter((t) => t.stockPercent >= 0)
      .sort((a, b) => a.day - b.day),
    [result],
  );

  if (totalDays === 0) {
    return (
      <div className="bg-panel border border-border rounded-lg p-4">
        <div className="text-xs font-mono text-neutral-500 tracking-wider animate-pulse">
          FLOW SIMULATION — データ読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-neutral-500 tracking-wider">
          FLOW SIMULATION — 在庫推移（{totalDays}日間）
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: RESOURCE_COLORS.oil }} />
            石油備蓄
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: RESOURCE_COLORS.lng }} />
            LNG在庫
          </span>
        </div>
      </div>

      {/* 統合チャート */}
      <StockChart
        samples={samples}
        maxOil={maxOil}
        maxLng={maxLng}
        totalDays={totalDays}
        monthMarkers={monthMarkers}
        oilDepletionDay={result.oilDepletionDay}
        lngDepletionDay={result.lngDepletionDay}
        events={sortedEvents}
      />

      {/* サマリー（3カラム） */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryBox label="石油枯渇" days={result.oilDepletionDay} color={RESOURCE_COLORS.oil} totalDays={totalDays} />
        <SummaryBox label="LNG枯渇" days={result.lngDepletionDay} color={RESOURCE_COLORS.lng} totalDays={totalDays} />
        <SummaryBox label="電力崩壊" days={result.powerCollapseDay} color={RESOURCE_COLORS.power} totalDays={totalDays} />
      </div>

      {/* イベントタイムライン（縦リスト） */}
      {sortedEvents.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-neutral-600 tracking-wider mb-1.5">
            SIMULATED EVENTS
          </div>
          <div role="list" aria-label="シミュレーション上のイベント一覧">
            {sortedEvents.map((ev, i) => (
              <EventItem key={i} event={ev} totalDays={totalDays} />
            ))}
          </div>
        </div>
      )}

      {/* ナフサ供給系統 — 化学品分岐マーカー */}
      <NaphthaChain thresholds={sortedEvents} totalDays={totalDays} />

      {/* 現実イベント */}
      <RealEvents totalDays={totalDays} scenarioId={scenarioId} />

      {/* 政策発動シナリオ */}
      <PolicyEvents policyEffects={result.policyEffects} />
    </div>
  );
};

// ─── 在庫チャート ────────────────────────────────────

interface StockChartProps {
  samples: Array<{ day: number; oilStock_kL: number; lngStock_t: number }>;
  maxOil: number;
  maxLng: number;
  totalDays: number;
  monthMarkers: Array<{ day: number; label: string }>;
  oilDepletionDay: number;
  lngDepletionDay: number;
  events: ThresholdEvent[];
}

const StockChart: FC<StockChartProps> = ({
  samples,
  maxOil,
  maxLng,
  totalDays,
  monthMarkers,
  oilDepletionDay,
  lngDepletionDay,
  events,
}) => {
  const viewW = 400;
  const viewH = 200;
  const padTop = 12;
  const padBottom = 20;
  const padLeft = 36;
  const padRight = 8;
  const chartW = viewW - padLeft - padRight;
  const chartH = viewH - padTop - padBottom;

  const toX = (day: number) => totalDays === 0 ? padLeft : padLeft + (day / totalDays) * chartW;
  const toY = (ratio: number) => padTop + chartH - Math.min(ratio, 1) * chartH;

  // 石油パス
  const oilPoints = samples
    .map((s) => `${toX(s.day)},${toY(s.oilStock_kL / maxOil)}`)
    .join(" ");
  const oilAreaPoints = `${toX(samples[0]?.day ?? 0)},${toY(0)} ${oilPoints} ${toX(samples[samples.length - 1]?.day ?? totalDays)},${toY(0)}`;

  // LNGパス
  const lngPoints = samples
    .map((s) => `${toX(s.day)},${toY(s.lngStock_t / maxLng)}`)
    .join(" ");
  const lngAreaPoints = `${toX(samples[0]?.day ?? 0)},${toY(0)} ${lngPoints} ${toX(samples[samples.length - 1]?.day ?? totalDays)},${toY(0)}`;

  // チャート内イベントマーカー（主要イベントのみ）
  const majorEvents = events.filter(
    (e) => e.type === "rationing" || e.type === "distribution" || e.type === "stop" || e.type === "water_cutoff",
  );

  return (
    <svg data-screenshot="flow-timeline" viewBox={`0 0 ${viewW} ${viewH}`} className="w-full" style={{ height: "clamp(160px, 30vw, 240px)" }}>
      {/* 崩壊フェーズ背景帯 */}
      {PHASE_BANDS.map((band) => {
        const y1 = toY(band.maxPct / 100);
        const y2 = toY(band.minPct / 100);
        return (
          <g key={band.minPct}>
            <rect x={padLeft} y={y1} width={chartW} height={y2 - y1} fill={band.color} />
          </g>
        );
      })}

      {/* Y軸 */}
      {[100, 50, 30, 10, 0].map((pct) => (
        <g key={pct}>
          <line
            x1={padLeft}
            y1={toY(pct / 100)}
            x2={padLeft + chartW}
            y2={toY(pct / 100)}
            stroke={pct === 0 ? "#333" : "#1e1e1e"}
            strokeWidth={pct === 0 ? "0.5" : "0.3"}
            strokeDasharray={pct === 0 ? "none" : "2 2"}
          />
          <text
            x={padLeft - 3}
            y={toY(pct / 100) + 2}
            textAnchor="end"
            className="text-[6px] font-mono"
            fill="#555"
          >
            {pct}%
          </text>
        </g>
      ))}

      {/* X軸（月） */}
      {monthMarkers.map((m) => (
        <g key={m.day}>
          <line
            x1={toX(m.day)}
            y1={padTop}
            x2={toX(m.day)}
            y2={padTop + chartH}
            stroke="#162029"
            strokeWidth="0.3"
          />
          <text
            x={toX(m.day)}
            y={viewH - 4}
            textAnchor="middle"
            className="text-[6px] font-mono"
            fill="#555"
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* 石油 */}
      <polygon points={oilAreaPoints} fill={`${RESOURCE_COLORS.oil}18`} />
      <polyline points={oilPoints} fill="none" stroke={RESOURCE_COLORS.oil} strokeWidth="1.5" />

      {/* LNG */}
      <polygon points={lngAreaPoints} fill={`${RESOURCE_COLORS.lng}14`} />
      <polyline points={lngPoints} fill="none" stroke={RESOURCE_COLORS.lng} strokeWidth="1.5" />

      {/* イベントマーカー（主要イベントのみチャート上に表示） */}
      {majorEvents.map((ev, i) => {
        const x = toX(ev.day);
        const resourceColor = RESOURCE_COLORS[ev.resource as keyof typeof RESOURCE_COLORS] ?? "#ef4444";
        return (
          <g key={i}>
            <line
              x1={x} y1={padTop} x2={x} y2={padTop + chartH}
              stroke={resourceColor}
              strokeWidth="0.6"
              strokeDasharray="2 3"
              opacity="0.5"
            />
            <circle cx={x} cy={padTop + 6} r="3" fill={resourceColor} opacity="0.8" />
            <text
              x={x}
              y={padTop + 8}
              textAnchor="middle"
              className="text-[4px] font-mono font-bold"
              fill="#0f1419"
            >
              {ev.day}
            </text>
          </g>
        );
      })}

      {/* 枯渇日マーカー */}
      {oilDepletionDay < totalDays && (
        <g>
          <line
            x1={toX(oilDepletionDay)} y1={padTop}
            x2={toX(oilDepletionDay)} y2={padTop + chartH}
            stroke={RESOURCE_COLORS.oil} strokeWidth="1" strokeDasharray="4 2"
          />
          <text
            x={toX(oilDepletionDay)}
            y={padTop - 3}
            textAnchor="middle"
            className="text-[6px] font-mono font-bold"
            fill={RESOURCE_COLORS.oil}
          >
            石油枯渇 {oilDepletionDay}日
          </text>
        </g>
      )}
      {lngDepletionDay < totalDays && (
        <g>
          <line
            x1={toX(lngDepletionDay)} y1={padTop}
            x2={toX(lngDepletionDay)} y2={padTop + chartH}
            stroke={RESOURCE_COLORS.lng} strokeWidth="1" strokeDasharray="4 2"
          />
          <text
            x={toX(lngDepletionDay)}
            y={padTop + chartH + 12}
            textAnchor="middle"
            className="text-[6px] font-mono font-bold"
            fill={RESOURCE_COLORS.lng}
          >
            LNG枯渇 {lngDepletionDay}日
          </text>
        </g>
      )}

      {/* チャート枠 */}
      <rect
        x={padLeft} y={padTop}
        width={chartW} height={chartH}
        fill="none" stroke="#1e2a36" strokeWidth="0.5"
      />
    </svg>
  );
};

// ─── イベントアイテム ────────────────────────────────

interface EventItemProps {
  event: ThresholdEvent;
  totalDays: number;
}

const EventItem: FC<EventItemProps> = ({ event, totalDays }) => {
  const [expanded, setExpanded] = useState(false);
  const resourceColor = RESOURCE_COLORS[event.resource as keyof typeof RESOURCE_COLORS] ?? "#888";
  const icon = EVENT_ICON[event.type] ?? "●";
  const pct = Math.min((event.day / totalDays) * 100, 100);
  const actions = ACTION_BY_TYPE[event.type];

  const resourceLabel =
    event.resource === "oil" ? "石油" :
    event.resource === "lng" ? "LNG" :
    event.resource === "power" ? "電力" :
    event.resource === "water" ? "水道" :
    event.resource === "logistics" ? "物流" : "";

  return (
    <div role="listitem" aria-label={`${event.day}日目: ${event.label}（${resourceLabel}）`}>
      <div
        className={`flex items-center gap-2 ${actions ? "cursor-pointer" : ""}`}
        onClick={() => actions && setExpanded(!expanded)}
      >
        {/* 日数 */}
        <div className="w-10 text-right font-mono text-xs font-bold shrink-0" style={{ color: resourceColor }}>
          {event.day}<span className="text-[9px] font-normal text-neutral-600">日</span>
        </div>
        {/* アイコン + バー */}
        <div className="relative flex-1 h-6 bg-[#0c1018] rounded overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-l"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${resourceColor}25, ${resourceColor}08)`,
            }}
          />
          <div className="absolute inset-0 flex items-center px-2 gap-1.5">
            <span className="text-[9px] shrink-0" style={{ color: resourceColor }}>{icon}</span>
            <span className="text-[10px] font-mono text-neutral-300 truncate">
              {event.label}
            </span>
          </div>
          {/* リソースタグ */}
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-mono px-1 py-0.5 rounded"
            style={{ backgroundColor: `${resourceColor}18`, color: resourceColor }}
          >
            {resourceLabel}
          </div>
        </div>
        {/* 展開トグル */}
        {actions && (
          <div className="shrink-0 text-[9px] font-mono text-neutral-600 w-4 text-center">
            {expanded ? "▼" : "▶"}
          </div>
        )}
      </div>
      {/* アクションパネル */}
      {expanded && actions && (
        <div className="ml-12 mt-1 mb-1 bg-[#0c1018] border border-border rounded p-2.5 space-y-1">
          <div className="text-[9px] font-mono tracking-wider mb-1.5" style={{ color: resourceColor }}>
            このフェーズで確認すること
          </div>
          {actions.map((action) => (
            <div key={action} className="flex gap-1.5 text-[10px] text-neutral-400 leading-relaxed">
              <span style={{ color: resourceColor }} className="shrink-0">▸</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── サマリーボックス ────────────────────────────────

interface SummaryBoxProps {
  label: string;
  days: number;
  color: string;
  totalDays: number;
}

const SummaryBox: FC<SummaryBoxProps> = ({ label, days, color, totalDays }) => {
  const pct = Math.min((days / totalDays) * 100, 100);
  return (
    <div className="bg-bg rounded p-3 space-y-1.5">
      <div className="text-[10px] font-mono text-neutral-500">{label}</div>
      <div className="font-mono font-bold text-xl" style={{ color }}>
        {days >= totalDays ? `${totalDays}+` : days}
        <span className="text-xs font-normal text-neutral-600 ml-1">日</span>
      </div>
      <div className="w-full h-1 bg-[#162029] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.6 }}
        />
      </div>
    </div>
  );
};

// ─── ナフサ供給系統 ──────────────────────────────────

const NAPHTHA_COLOR = "#f59e0b";

interface NaphthaChainProps {
  thresholds: ThresholdEvent[];
  totalDays: number;
}

const NaphthaChain: FC<NaphthaChainProps> = ({ thresholds, totalDays }) => {
  const priceSpike = thresholds.find((e) => e.resource === "oil" && e.type === "price_spike");
  const rationing = thresholds.find((e) => e.resource === "oil" && e.type === "rationing");
  const distribution = thresholds.find((e) => e.resource === "oil" && e.type === "distribution");

  const naphthaEvents: Array<{ day: number; label: string; note: string; yenPerKl: string }> = [];

  if (priceSpike) {
    naphthaEvents.push({
      day: Math.max(priceSpike.day - 5, 1),
      label: "ナフサ直接輸入▲42% — エチレン減産開始",
      note: "中東依存42%分が途絶。民間在庫（~60日）での対応開始。¥10万/kL超で減産ライン突破",
      yenPerKl: "¥10万/kL超",
    });
  }
  if (rationing) {
    naphthaEvents.push({
      day: rationing.day,
      label: "エチレン設備稼働▲30%超 — 包装材・日用品品薄",
      note: "¥11〜13万/kL: 広範囲停止ライン。ゴミ袋・ラップ・食品トレー・おむつが棚から消え始める",
      yenPerKl: "¥11〜13万/kL",
    });
  }
  if (distribution) {
    naphthaEvents.push({
      day: distribution.day,
      label: "石化クラッカー停止 — 産業配給発動",
      note: "¥13万/kL超: 構造崩壊域。医療材料・食品包装を法的優先配給（石油需給適正化法）",
      yenPerKl: "¥13万/kL超",
    });
  }

  if (naphthaEvents.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-mono text-neutral-600 tracking-wider mb-1.5 flex items-center gap-1.5">
        <span style={{ color: NAPHTHA_COLOR }}>◈</span>
        NAPHTHA CHAIN — 石油→化学品・生活物資 分岐
      </div>
      <div className="space-y-1 border-l-2 pl-3" style={{ borderColor: `${NAPHTHA_COLOR}40` }}>
        {naphthaEvents.map((ev) => {
          const pct = Math.min((ev.day / totalDays) * 100, 100);
          return (
            <div key={ev.day} className="flex items-start gap-2">
              <div className="w-10 text-right font-mono text-xs font-bold shrink-0 pt-0.5" style={{ color: NAPHTHA_COLOR }}>
                {ev.day}<span className="text-[9px] font-normal text-neutral-600">日</span>
              </div>
              <div className="relative flex-1 bg-[#0c1018] rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-l"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${NAPHTHA_COLOR}20, ${NAPHTHA_COLOR}06)`,
                  }}
                />
                <div className="relative px-2 py-1.5 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-neutral-300 leading-snug">{ev.label}</span>
                    <span
                      className="text-[8px] font-mono px-1 py-0.5 rounded shrink-0"
                      style={{ backgroundColor: `${NAPHTHA_COLOR}18`, color: NAPHTHA_COLOR }}
                    >
                      {ev.yenPerKl}
                    </span>
                  </div>
                  <div className="text-[9px] text-neutral-600 leading-relaxed">{ev.note}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-mono text-neutral-600 pl-3">
        ナフサ民間在庫 ~60日（石油国家備蓄241日の約1/4）。燃料より先に生活物資系統が止まる。
      </p>
    </div>
  );
};

// ─── 政策効果テキスト生成 ────────────────────────────

function getEffectText(
  category: string,
  dayOffset: number,
  pe: PolicyEffects | undefined,
  fallback: string,
): string {
  if (!pe) return fallback;
  if (category === "demand_cut" && dayOffset === 3) {
    return `電力崩壊 +${pe.emergencyPower15pct.powerDaysGain}日延長`;
  }
  if (category === "demand_cut" && dayOffset === 7) {
    return `石油枯渇 +${pe.demandCut10pct.oilDaysGain}日延長`;
  }
  if (category === "spr_release") {
    return `石油枯渇 +${pe.sprRelease.oilDaysGain}日延長（対政策ゼロ）`;
  }
  if (category === "lng_spot") {
    const lngGain = pe.lngSpot.lngDaysGain;
    const powerGain = pe.lngSpot.powerDaysGain;
    return `LNG枯渇 +${lngGain}日 / 電力崩壊 +${powerGain}日延長`;
  }
  return fallback;
}

// ─── 政策発動シナリオ ────────────────────────────────

interface PolicyEventsProps {
  policyEffects?: PolicyEffects;
}

const PolicyEvents: FC<PolicyEventsProps> = ({ policyEffects }) => {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-mono text-neutral-600 tracking-wider">
        POLICY RESPONSE — 政策発動時のシナリオ改善効果
      </div>

      {/* 横型マイルストーンタイムライン */}
      <div className="relative">
        {/* ベースライン */}
        <div className="absolute top-3.5 left-0 right-0 h-px bg-[#1e2a36]" />

        <div className="flex items-start justify-between relative">
          {POLICY_EVENTS.map((ev) => {
            const color = POLICY_COLORS[ev.category] ?? "#888";
            const catLabel = POLICY_LABELS[ev.category] ?? "";
            const effectText = getEffectText(ev.category, ev.dayOffset, policyEffects, ev.effect);
            return (
              <div
                key={ev.label}
                className="flex flex-col items-center"
                style={{ width: "25%" }}
              >
                {/* ドット */}
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 border-[#0c1018] z-10 mb-1.5 shrink-0"
                  style={{ backgroundColor: color }}
                />
                {/* テキスト */}
                <div className="text-center space-y-0.5 px-1">
                  <div className="font-mono font-bold text-[9px]" style={{ color }}>
                    Day {ev.dayOffset}
                  </div>
                  <div className="text-[8px] font-mono px-1 py-0.5 rounded leading-tight" style={{ backgroundColor: `${color}15`, color }}>
                    {catLabel}
                  </div>
                  <div className="text-[8px] text-neutral-500 leading-tight hidden sm:block">
                    {ev.label.replace(/（.*?）/, "").replace(/\s*[-−].*$/, "")}
                  </div>
                  {policyEffects && (
                    <div className="text-[8px] font-mono leading-tight" style={{ color }}>
                      {effectText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Day 0 ラベル */}
        <div className="absolute left-0 top-0 text-[8px] font-mono text-neutral-600 -translate-y-4">
          封鎖Day 0
        </div>
      </div>

      <p className="text-[9px] font-mono text-neutral-700">
        以下の政策が発動した場合、供給制約タイムラインは改善します。実際の効果は発動タイミングと達成率により変動します。
      </p>

      {/* 既存の縦リスト */}
      {POLICY_EVENTS.map((ev) => {
        const color = POLICY_COLORS[ev.category] ?? "#888";
        const catLabel = POLICY_LABELS[ev.category] ?? "";
        const effectText = getEffectText(ev.category, ev.dayOffset, policyEffects, ev.effect);
        return (
          <div key={ev.label} className="flex items-start gap-2">
            <div className="w-10 text-right font-mono text-xs font-bold shrink-0 pt-0.5" style={{ color }}>
              +{ev.dayOffset}<span className="text-[9px] font-normal text-neutral-600">日</span>
            </div>
            <div className="flex-1 bg-[#0c1018] border rounded p-2 space-y-0.5" style={{ borderColor: `${color}30` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-neutral-300">{ev.label}</span>
                <span className="text-[8px] font-mono px-1 py-0.5 rounded shrink-0" style={{ backgroundColor: `${color}18`, color }}>
                  {catLabel}
                </span>
              </div>
              <div className="text-[9px] font-mono" style={{ color }}>{effectText}</div>
              <div className="text-[9px] text-neutral-600">{ev.note}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── 現実イベント ────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  government: "#3b82f6",
  industry: "#f59e0b",
  international: "#22c55e",
};

const CATEGORY_LABELS: Record<string, string> = {
  government: "政府",
  industry: "産業",
  international: "国際",
};

interface RealEventsProps {
  totalDays: number;
  scenarioId: ScenarioId;
}

const RealEvents: FC<RealEventsProps> = ({ totalDays, scenarioId }) => {
  // シナリオ固有イベントはそのシナリオ選択時のみ表示。scenario未指定のイベントは常時表示
  const events = realEventsData.events.filter(
    (ev) => !("scenario" in ev) || ev.scenario === scenarioId,
  );
  if (events.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-mono text-neutral-600 tracking-wider mb-1.5">
        REAL-WORLD EVENTS
      </div>
      {events.map((ev, i) => {
        const color = CATEGORY_COLORS[ev.category] ?? "#888";
        const catLabel = CATEGORY_LABELS[ev.category] ?? "";
        const pct = Math.min((ev.dayOffset / totalDays) * 100, 100);
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-10 text-right font-mono text-xs font-bold shrink-0" style={{ color }}>
              {ev.dayOffset}<span className="text-[9px] font-normal text-neutral-600">日</span>
            </div>
            <div className="relative flex-1 h-6 bg-[#0c1018] rounded overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-l"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}20, ${color}06)`,
                }}
              />
              <div className="absolute inset-0 flex items-center px-2 gap-1.5">
                <span className="text-[9px] shrink-0" style={{ color }}>◉</span>
                <span className="text-[10px] font-mono text-neutral-300 truncate">
                  {ev.label}
                </span>
              </div>
              <div
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-mono px-1 py-0.5 rounded"
                style={{ backgroundColor: `${color}18`, color }}
              >
                {catLabel}
              </div>
            </div>
          </div>
        );
      })}
      <div className="text-[9px] font-mono text-neutral-700 mt-1">
        出典: 経産省・化学日報・IEA・TBS NEWS DIG | 更新: {realEventsData.meta.updatedAt}
      </div>
    </div>
  );
};
