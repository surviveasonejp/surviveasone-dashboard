import { type FC, useMemo } from "react";
import { type ScenarioId } from "../lib/scenarios";
import { runFlowSimulation, type ThresholdEvent } from "../lib/flowSimulation";
import { formatNumber } from "../lib/formatters";

interface FlowTimelineProps {
  scenarioId: ScenarioId;
}

const THRESHOLD_COLORS: Record<string, string> = {
  price_spike: "#ffea00",
  rationing: "#ff9100",
  distribution: "#ff5252",
  stop: "#ff1744",
};

const BAR_COLORS = {
  oil: "#ff9100",
  lng: "#4fc3f7",
};

export const FlowTimeline: FC<FlowTimelineProps> = ({ scenarioId }) => {
  const result = useMemo(() => runFlowSimulation(scenarioId, 365), [scenarioId]);

  // タイムラインを30日間隔でサンプリング（パフォーマンス）
  const samples = useMemo(() => {
    const step = Math.max(1, Math.floor(result.timeline.length / 60));
    return result.timeline.filter((_, i) => i % step === 0 || i === result.timeline.length - 1);
  }, [result]);

  const maxOil = result.timeline[0]?.oilStock_kL ?? 1;
  const maxLng = result.timeline[0]?.lngStock_t ?? 1;

  return (
    <div className="bg-[#141414] border border-[#2a2a2a] rounded-lg p-4 space-y-4">
      <div className="text-xs font-mono text-neutral-500 tracking-wider">
        FLOW SIMULATION — 在庫推移（{result.timeline.length}日間）
      </div>

      {/* 閾値イベント */}
      <div className="flex flex-wrap gap-2">
        {result.thresholds.map((th, i) => (
          <ThresholdBadge key={i} event={th} />
        ))}
      </div>

      {/* 石油在庫チャート */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span style={{ color: BAR_COLORS.oil }}>石油備蓄</span>
          <span className="text-neutral-500">枯渇: {result.oilDepletionDay}日目</span>
        </div>
        <MiniChart
          samples={samples}
          getValue={(s) => s.oilStock_kL / maxOil}
          color={BAR_COLORS.oil}
          depletionDay={result.oilDepletionDay}
          totalDays={result.timeline.length}
        />
      </div>

      {/* LNG在庫チャート */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span style={{ color: BAR_COLORS.lng }}>LNG在庫</span>
          <span className="text-neutral-500">枯渇: {result.lngDepletionDay}日目</span>
        </div>
        <MiniChart
          samples={samples}
          getValue={(s) => s.lngStock_t / maxLng}
          color={BAR_COLORS.lng}
          depletionDay={result.lngDepletionDay}
          totalDays={result.timeline.length}
        />
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryBox label="石油枯渇" days={result.oilDepletionDay} color={BAR_COLORS.oil} />
        <SummaryBox label="LNG枯渇" days={result.lngDepletionDay} color={BAR_COLORS.lng} />
        <SummaryBox label="電力崩壊" days={result.powerCollapseDay} color="#ff1744" />
      </div>
    </div>
  );
};

// ─── サブコンポーネント ──────────────────────────────

interface MiniChartProps {
  samples: Array<{ day: number; oilStock_kL: number; lngStock_t: number }>;
  getValue: (s: { oilStock_kL: number; lngStock_t: number }) => number;
  color: string;
  depletionDay: number;
  totalDays: number;
}

const MiniChart: FC<MiniChartProps> = ({ samples, getValue, color, depletionDay, totalDays }) => {
  const height = 40;
  const width = 100; // percentベース

  const points = samples
    .map((s) => {
      const x = (s.day / totalDays) * width;
      const y = height - getValue(s) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10" preserveAspectRatio="none">
      {/* 閾値ライン */}
      {[50, 30, 10].map((pct) => (
        <line
          key={pct}
          x1="0"
          y1={height - (pct / 100) * height}
          x2={width}
          y2={height - (pct / 100) * height}
          stroke="#2a2a2a"
          strokeWidth="0.3"
          strokeDasharray="1 1"
        />
      ))}
      {/* 枯渇日マーカー */}
      {depletionDay < totalDays && (
        <line
          x1={(depletionDay / totalDays) * width}
          y1="0"
          x2={(depletionDay / totalDays) * width}
          y2={height}
          stroke="#ff1744"
          strokeWidth="0.5"
          strokeDasharray="1 1"
        />
      )}
      {/* エリアフィル */}
      <polygon points={areaPoints} fill={`${color}20`} />
      {/* ライン */}
      <polyline points={points} fill="none" stroke={color} strokeWidth="0.8" />
    </svg>
  );
};

const ThresholdBadge: FC<{ event: ThresholdEvent }> = ({ event }) => {
  const color = THRESHOLD_COLORS[event.type] ?? "#888";
  return (
    <span
      className="px-2 py-0.5 text-[10px] font-mono rounded"
      style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}10` }}
    >
      Day {event.day}: {event.label}
    </span>
  );
};

const SummaryBox: FC<{ label: string; days: number; color: string }> = ({ label, days, color }) => (
  <div className="bg-[#0a0a0a] rounded p-2">
    <div className="text-[10px] font-mono text-neutral-500">{label}</div>
    <div className="font-mono font-bold text-lg" style={{ color }}>
      {days >= 365 ? "365+" : days}
    </div>
    <div className="text-[10px] font-mono text-neutral-600">日</div>
  </div>
);
