import { type FC, useMemo } from "react";
import { type ScenarioId } from "../../shared/scenarios";
import type { FlowSimulationResult, ThresholdEvent } from "../../shared/types";
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
};

const EVENT_ICON: Record<string, string> = {
  price_spike: "△",
  rationing: "▽",
  distribution: "◆",
  stop: "■",
  water_pressure: "〜",
  water_cutoff: "✕",
  water_sanitation: "☠",
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
        markers.push({ day, label: m === 0 ? "封鎖" : `${m}ヶ月` });
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

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 space-y-4">
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
          {sortedEvents.map((ev, i) => (
            <EventItem key={i} event={ev} totalDays={totalDays} />
          ))}
        </div>
      )}

      {/* 現実イベント */}
      <RealEvents totalDays={totalDays} />
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

  const toX = (day: number) => padLeft + (day / totalDays) * chartW;
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
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full" style={{ height: "clamp(160px, 30vw, 240px)" }}>
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
  const resourceColor = RESOURCE_COLORS[event.resource as keyof typeof RESOURCE_COLORS] ?? "#888";
  const icon = EVENT_ICON[event.type] ?? "●";
  const pct = Math.min((event.day / totalDays) * 100, 100);

  const resourceLabel =
    event.resource === "oil" ? "石油" :
    event.resource === "lng" ? "LNG" :
    event.resource === "power" ? "電力" :
    event.resource === "water" ? "水道" : "";

  return (
    <div className="flex items-center gap-2 group">
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
    <div className="bg-[#0f1419] rounded p-3 space-y-1.5">
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
}

const RealEvents: FC<RealEventsProps> = ({ totalDays }) => {
  const events = realEventsData.events;
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
