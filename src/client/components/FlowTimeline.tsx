import { type FC, useMemo } from "react";
import { type ScenarioId } from "../../shared/scenarios";
import type { FlowSimulationResult, ThresholdEvent } from "../../shared/types";
import { useApiData } from "../hooks/useApiData";

interface FlowTimelineProps {
  scenarioId: ScenarioId;
}

const THRESHOLD_COLORS: Record<string, string> = {
  price_spike: "#94a3b8",
  rationing: "#f59e0b",
  distribution: "#ef4444",
  stop: "#ef4444",
};

const RESOURCE_COLORS = {
  oil: "#f59e0b",
  lng: "#94a3b8",
};

// 崩壊フェーズの背景帯
const PHASE_BANDS: Array<{
  minPct: number;
  maxPct: number;
  color: string;
  label: string;
}> = [
  { minPct: 50, maxPct: 100, color: "#22c55e08", label: "" },
  { minPct: 30, maxPct: 50, color: "#94a3b808", label: "価格暴騰" },
  { minPct: 10, maxPct: 30, color: "#f59e0b10", label: "供給制限" },
  { minPct: 0, maxPct: 10, color: "#ef444415", label: "配給制" },
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
    const step = Math.max(1, Math.floor(result.timeline.length / 120));
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

  // 閾値イベントをリソース別にグループ化
  const oilEvents = result.thresholds.filter((t) => t.resource === "oil");
  const lngEvents = result.thresholds.filter((t) => t.resource === "lng");
  const powerEvents = result.thresholds.filter((t) => t.resource === "power");

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 space-y-3">
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
      <CombinedChart
        samples={samples}
        maxOil={maxOil}
        maxLng={maxLng}
        totalDays={totalDays}
        monthMarkers={monthMarkers}
        oilDepletionDay={result.oilDepletionDay}
        lngDepletionDay={result.lngDepletionDay}
      />

      {/* イベントタイムライン */}
      <div className="space-y-1.5">
        <EventRow resource="oil" label="石油" events={oilEvents} depletionDay={result.oilDepletionDay} totalDays={totalDays} />
        <EventRow resource="lng" label="LNG" events={lngEvents} depletionDay={result.lngDepletionDay} totalDays={totalDays} />
        <EventRow resource="power" label="電力" events={powerEvents} depletionDay={result.powerCollapseDay} totalDays={totalDays} />
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryBox label="石油枯渇" days={result.oilDepletionDay} color={RESOURCE_COLORS.oil} totalDays={totalDays} />
        <SummaryBox label="LNG枯渇" days={result.lngDepletionDay} color={RESOURCE_COLORS.lng} totalDays={totalDays} />
        <SummaryBox label="電力崩壊" days={result.powerCollapseDay} color="#ef4444" totalDays={totalDays} />
      </div>
    </div>
  );
};

// ─── 統合チャート ────────────────────────────────────

interface CombinedChartProps {
  samples: Array<{ day: number; oilStock_kL: number; lngStock_t: number }>;
  maxOil: number;
  maxLng: number;
  totalDays: number;
  monthMarkers: Array<{ day: number; label: string }>;
  oilDepletionDay: number;
  lngDepletionDay: number;
}

const CombinedChart: FC<CombinedChartProps> = ({
  samples,
  maxOil,
  maxLng,
  totalDays,
  monthMarkers,
  oilDepletionDay,
  lngDepletionDay,
}) => {
  const viewW = 400;
  const viewH = 160;
  const padTop = 8;
  const padBottom = 18;
  const padLeft = 36;
  const padRight = 8;
  const chartW = viewW - padLeft - padRight;
  const chartH = viewH - padTop - padBottom;

  const toX = (day: number) => padLeft + (day / totalDays) * chartW;
  const toY = (ratio: number) => padTop + chartH - Math.min(ratio, 1) * chartH;

  // 石油ライン
  const oilPoints = samples
    .map((s) => `${toX(s.day)},${toY(s.oilStock_kL / maxOil)}`)
    .join(" ");
  const oilAreaPoints = `${toX(samples[0]?.day ?? 0)},${toY(0)} ${oilPoints} ${toX(samples[samples.length - 1]?.day ?? totalDays)},${toY(0)}`;

  // LNGライン
  const lngPoints = samples
    .map((s) => `${toX(s.day)},${toY(s.lngStock_t / maxLng)}`)
    .join(" ");
  const lngAreaPoints = `${toX(samples[0]?.day ?? 0)},${toY(0)} ${lngPoints} ${toX(samples[samples.length - 1]?.day ?? totalDays)},${toY(0)}`;

  return (
    <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full" style={{ height: "clamp(140px, 25vw, 200px)" }}>
      {/* 崩壊フェーズ背景帯 */}
      {PHASE_BANDS.map((band) => {
        const y1 = toY(band.maxPct / 100);
        const y2 = toY(band.minPct / 100);
        return (
          <g key={band.minPct}>
            <rect
              x={padLeft}
              y={y1}
              width={chartW}
              height={y2 - y1}
              fill={band.color}
            />
            {band.label && (
              <text
                x={padLeft + 3}
                y={y1 + (y2 - y1) / 2 + 2}
                className="text-[5px] font-mono"
                fill="#ffffff18"
              >
                {band.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Y軸ラベル（%） */}
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
            className="text-[5px] font-mono"
            fill="#555"
          >
            {pct}%
          </text>
        </g>
      ))}

      {/* X軸ラベル（月） */}
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
            className="text-[5px] font-mono"
            fill="#555"
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* 石油エリアフィル + ライン */}
      <polygon points={oilAreaPoints} fill={`${RESOURCE_COLORS.oil}15`} />
      <polyline points={oilPoints} fill="none" stroke={RESOURCE_COLORS.oil} strokeWidth="1.2" />

      {/* LNGエリアフィル + ライン */}
      <polygon points={lngAreaPoints} fill={`${RESOURCE_COLORS.lng}12`} />
      <polyline points={lngPoints} fill="none" stroke={RESOURCE_COLORS.lng} strokeWidth="1.2" />

      {/* 枯渇日マーカー */}
      {oilDepletionDay < totalDays && (
        <g>
          <line
            x1={toX(oilDepletionDay)}
            y1={padTop}
            x2={toX(oilDepletionDay)}
            y2={padTop + chartH}
            stroke={RESOURCE_COLORS.oil}
            strokeWidth="0.8"
            strokeDasharray="3 2"
          />
          <text
            x={toX(oilDepletionDay)}
            y={padTop - 2}
            textAnchor="middle"
            className="text-[5px] font-mono font-bold"
            fill={RESOURCE_COLORS.oil}
          >
            石油枯渇 Day {oilDepletionDay}
          </text>
        </g>
      )}
      {lngDepletionDay < totalDays && (
        <g>
          <line
            x1={toX(lngDepletionDay)}
            y1={padTop}
            x2={toX(lngDepletionDay)}
            y2={padTop + chartH}
            stroke={RESOURCE_COLORS.lng}
            strokeWidth="0.8"
            strokeDasharray="3 2"
          />
          <text
            x={toX(lngDepletionDay)}
            y={padTop + chartH + 10}
            textAnchor="middle"
            className="text-[5px] font-mono font-bold"
            fill={RESOURCE_COLORS.lng}
          >
            LNG枯渇 Day {lngDepletionDay}
          </text>
        </g>
      )}

      {/* チャート枠 */}
      <rect
        x={padLeft}
        y={padTop}
        width={chartW}
        height={chartH}
        fill="none"
        stroke="#1e2a36"
        strokeWidth="0.5"
      />
    </svg>
  );
};

// ─── イベントタイムライン行 ─────────────────────────

interface EventRowProps {
  resource: string;
  label: string;
  events: ThresholdEvent[];
  depletionDay: number;
  totalDays: number;
}

const EventRow: FC<EventRowProps> = ({ resource, label, events, depletionDay, totalDays }) => {
  const color = resource === "oil" ? RESOURCE_COLORS.oil : resource === "lng" ? RESOURCE_COLORS.lng : "#ef4444";

  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] font-mono w-8 shrink-0" style={{ color }}>
        {label}
      </div>
      <div className="relative flex-1 h-5 bg-[#0f1419] rounded overflow-hidden">
        {/* 進行バー */}
        <div
          className="absolute inset-y-0 left-0 rounded-l"
          style={{
            width: `${Math.min((depletionDay / totalDays) * 100, 100)}%`,
            background: `linear-gradient(90deg, ${color}30, ${color}08)`,
          }}
        />
        {/* イベントマーカー */}
        {events.map((ev, i) => {
          const evColor = THRESHOLD_COLORS[ev.type] ?? color;
          // リソース名を除いたイベント名（「石油 価格暴騰」→「価格暴騰」）
          const shortLabel = ev.label.replace(/^(石油|LNG|電力)\s*/, "");
          return (
            <div
              key={i}
              className="absolute top-0 h-full"
              style={{ left: `${(ev.day / totalDays) * 100}%` }}
            >
              <div
                className="w-px h-full"
                style={{ backgroundColor: evColor }}
              />
              <span
                className="absolute top-0.5 left-1.5 text-[8px] font-mono whitespace-nowrap leading-tight"
                style={{ color: evColor }}
              >
                {shortLabel}
                <span className="text-[7px] opacity-60 ml-1">{ev.day}日</span>
              </span>
            </div>
          );
        })}
        {/* 枯渇マーカー */}
        {depletionDay < totalDays && (
          <div
            className="absolute top-0 h-full"
            style={{ left: `${(depletionDay / totalDays) * 100}%` }}
          >
            <div className="w-0.5 h-full bg-[#ef4444]" />
          </div>
        )}
      </div>
      <div className="text-[10px] font-mono w-12 text-right shrink-0" style={{ color }}>
        {depletionDay >= totalDays ? `${totalDays}+日` : `${depletionDay}日`}
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
      {/* ミニゲージ */}
      <div className="w-full h-1 bg-[#162029] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  );
};
