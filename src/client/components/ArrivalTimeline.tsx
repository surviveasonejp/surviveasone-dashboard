import { type FC } from "react";
import type { TankerInfo, FlowSimulationResult, FlowState } from "../../shared/types";
import { useApiData } from "../hooks/useApiData";
import { useTheme } from "../hooks/useTheme";

// ─── 定数 ─────────────────────────────────────────────

const BLOCKADE_START_MS = new Date("2026-03-01T00:00:00+09:00").getTime();
const MAX_DAYS = 110;

const HORMUZ_PORTS = new Set([
  "Ras Tanura", "Jubail", "Kharg Island",
  "Ras Laffan", "Mina Al Ahmadi", "Basrah",
]);

const NON_MIDEAST_PORTS = new Set(["Ingleside", "NonMideast"]);

const JAPAN_DEST_PORTS = new Set([
  "Japan", "Kawasaki", "Hiroshima", "Chiba", "Yokkaichi", "Sakai",
  "Mizushima", "Kiire", "Futtsu", "Chita", "Kitakyushu", "Himeji",
  "Sodegaura", "Sendai", "Naha", "Kashima", "Negishi", "Oita", "Ehime",
]);

// ─── カテゴリ定義 ──────────────────────────────────────

type Category = "hormuz" | "alternative" | "nonmideast" | "lng";

const CATEGORY_ORDER: Category[] = ["hormuz", "alternative", "nonmideast", "lng"];

const CATEGORY_DEFS: Record<Category, { label: string; color: string }> = {
  hormuz:      { label: "ホルムズ経由（封鎖時到達不可）", color: "#525252" },
  alternative: { label: "代替ルート（中東発・迂回）",    color: "#f59e0b" },
  nonmideast:  { label: "非中東調達（米国ガルフ等）",     color: "#60a5fa" },
  lng:         { label: "LNG船団",                       color: "#22c55e" },
};

function getCategory(tanker: TankerInfo): Category {
  if (tanker.type === "LNG") return "lng";
  if (HORMUZ_PORTS.has(tanker.departurePort)) return "hormuz";
  if (NON_MIDEAST_PORTS.has(tanker.departurePort)) return "nonmideast";
  return "alternative";
}

// ─── SVG 座標系 ────────────────────────────────────────

const VW = 1000;
const PAD_L = 112;
const PAD_R = 74;
const CHART_W = VW - PAD_L - PAD_R;

const CURVE_TOP = 8;
const CURVE_H = 112;
const TICK_H = 28;
const ROW_H = 26;
const SEP_H = 15;  // カテゴリ区切り行の高さ
const BAR_VLCC = 10;
const BAR_LNG = 7;

// ─── シナリオスタイル ──────────────────────────────────

const SCENARIO_KEYS = ["optimistic", "realistic", "pessimistic"] as const;
type ScenarioKey = (typeof SCENARIO_KEYS)[number];

const SCENARIO_STYLES: Record<ScenarioKey, { stroke: string; label: string; opacity: number; width: number }> = {
  optimistic:  { stroke: "#22c55e", label: "楽観", opacity: 0.65, width: 1.5 },
  realistic:   { stroke: "#f59e0b", label: "現実", opacity: 0.9,  width: 2.0 },
  pessimistic: { stroke: "#ef4444", label: "悲観", opacity: 0.6,  width: 1.5 },
};

// ─── 行型 ──────────────────────────────────────────────

type SepRow    = { kind: "sep";    category: Category };
type TankerRow = { kind: "tanker"; tanker: TankerInfo; category: Category };
type Row = SepRow | TankerRow;

// ─── ヘルパー ──────────────────────────────────────────

function toY(pct: number): number {
  return CURVE_TOP + CURVE_H * (1 - Math.max(0, Math.min(100, pct)) / 100);
}

function buildCurvePath(
  timeline: FlowState[],
  elapsedDays: number,
  todayOffset: number,
  scaleDays: number,
): string {
  const initial = timeline[0];
  if (!initial || initial.oilStock_kL === 0) return "";
  const baseOil = initial.oilStock_kL;

  const pts: string[] = [];
  for (let d = 0; d <= MAX_DAYS; d++) {
    const state = timeline[elapsedDays + d];
    if (state === undefined) break;
    const x = PAD_L + (Math.min(todayOffset + d, scaleDays) / scaleDays) * CHART_W;
    const pct = (state.oilStock_kL / baseOil) * 100;
    pts.push(`${x.toFixed(1)},${toY(pct).toFixed(1)}`);
  }
  return pts.length > 1 ? `M ${pts.join(" L ")}` : "";
}

/** 到着予定日を「M/D」形式で返す */
function formatArrivalDate(etaDays: number): string {
  const d = new Date(Date.now() + etaDays * 86400000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── コンポーネント ───────────────────────────────────

interface Props {
  tankers: TankerInfo[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const ArrivalTimeline: FC<Props> = ({ tankers, selectedId, onSelect }) => {
  const theme = useTheme();
  const thresholds = [
    { pct: 50, label: "パニック買い", color: theme === "light" ? "#b45309" : "#f59e0b" },
    { pct: 30, label: "供給制限",     color: theme === "light" ? "#c2410c" : "#f97316" },
    { pct: 10, label: "配給制",       color: theme === "light" ? "#b91c1c" : "#ef4444" },
  ];

  // ─── 表示対象タンカー（スケール計算の前に必要） ──────
  const displayTankers = tankers
    .filter(t => JAPAN_DEST_PORTS.has(t.destinationPort) && t.eta_days > 0)
    .sort((a, b) => a.eta_days - b.eta_days);

  // ─── カテゴリグループ化 → 行配列生成 ────────────────
  const grouped = new Map<Category, TankerInfo[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const t of displayTankers) grouped.get(getCategory(t))!.push(t);

  const rows: Row[] = [];
  for (const cat of CATEGORY_ORDER) {
    const vessels = grouped.get(cat)!;
    if (vessels.length === 0) continue;
    rows.push({ kind: "sep", category: cat });
    for (const t of vessels) rows.push({ kind: "tanker", tanker: t, category: cat });
  }

  // ─── スケール計算（今月1日を左端とする） ───────────
  const now = new Date();
  const scaleStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const scaleStartMs = scaleStart.getTime();
  const todayOffset = Math.floor((Date.now() - scaleStartMs) / 86400000);

  // 封鎖不可を除いた最後のタンカーの到着月から表示月数を決定（最小2・最大4か月）
  const lastEtaDays = displayTankers
    .filter(t => !HORMUZ_PORTS.has(t.departurePort))
    .at(-1)?.eta_days ?? 60;
  const lastArrivalDate = new Date(Date.now() + lastEtaDays * 86400000);
  const monthsToLast =
    (lastArrivalDate.getFullYear() - scaleStart.getFullYear()) * 12
    + lastArrivalDate.getMonth() - scaleStart.getMonth();
  const displayMonths = Math.min(4, Math.max(2, monthsToLast + 1));

  // スケール終端 = 今月1日 + displayMonths か月後の末日
  const scaleEndDate = new Date(scaleStart.getFullYear(), scaleStart.getMonth() + displayMonths, 0);
  const scaleDays = Math.floor((scaleEndDate.getTime() - scaleStartMs) / 86400000);

  /** スケール左端（今月1日）からの日数 → SVG x座標 */
  const toX = (daysFromScaleStart: number): number =>
    PAD_L + (Math.min(daysFromScaleStart, scaleDays) / scaleDays) * CHART_W;

  const todayX = toX(todayOffset);

  // 月初目盛りを生成
  const monthTicks = (() => {
    const result: { days: number; label: string }[] = [];
    result.push({ days: 0, label: `${scaleStart.getMonth() + 1}月` });
    const m = new Date(scaleStart);
    m.setMonth(m.getMonth() + 1);
    while (true) {
      const d = Math.floor((m.getTime() - scaleStartMs) / 86400000);
      if (d > scaleDays) break;
      result.push({ days: d, label: `${m.getMonth() + 1}月` });
      m.setMonth(m.getMonth() + 1);
    }
    return result;
  })();

  const mobileTickLabels = monthTicks.map(t => t.label);

  const elapsedDays = Math.floor((Date.now() - BLOCKADE_START_MS) / 86400000);
  const fetchDays = elapsedDays + (scaleDays - todayOffset) + 5;

  const { data: optSim } = useApiData<FlowSimulationResult | null>(
    `/api/simulation?scenario=optimistic&maxDays=${fetchDays}`, null,
  );
  const { data: realSim } = useApiData<FlowSimulationResult | null>(
    `/api/simulation?scenario=realistic&maxDays=${fetchDays}`, null,
  );
  const { data: pessSim } = useApiData<FlowSimulationResult | null>(
    `/api/simulation?scenario=pessimistic&maxDays=${fetchDays}`, null,
  );

  const simByScenario: Record<ScenarioKey, FlowSimulationResult | null> = {
    optimistic: optSim,
    realistic: realSim,
    pessimistic: pessSim,
  };

  // ─── SVG 高さ計算（行種別の高さを積算） ─────────────
  const tickY = CURVE_TOP + CURVE_H + 4;
  const barsY = tickY + TICK_H;

  const rowHeights = rows.map(r => r.kind === "sep" ? SEP_H : ROW_H);
  const totalRowsH = rowHeights.reduce((a, b) => a + b, 0);
  const svgH = barsY + totalRowsH + 10;

  /** rows[i] の SVG Y座標 */
  const rowY = (i: number): number => {
    let y = barsY;
    for (let j = 0; j < i; j++) y += rowHeights[j] ?? 0;
    return y;
  };

  return (
    <div data-screenshot="arrival-timeline" className="bg-[#151c24] border border-[#1e2a36] rounded-lg">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b border-[#1e2a36]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-sm tracking-wider text-neutral-400">ARRIVAL TIMELINE</h2>
            <p className="text-[10px] text-neutral-600 mt-0.5">日本向け船団の到着予測</p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            {SCENARIO_KEYS.map(key => {
              const s = SCENARIO_STYLES[key];
              return (
                <span key={key} className="flex items-center gap-1.5">
                  <svg width="18" height="4" aria-hidden="true">
                    <line x1="0" y1="2" x2="18" y2="2" stroke={s.stroke} strokeWidth="2" />
                  </svg>
                  <span className="text-[10px] font-mono" style={{ color: s.stroke }}>{s.label}</span>
                </span>
              );
            })}
            <span className="text-[10px] font-mono text-neutral-600">= 石油備蓄残量</span>
          </div>
        </div>
        {/* バー凡例（カテゴリ色） */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {(["alternative", "nonmideast", "lng"] as const).map(cat => {
            const def = CATEGORY_DEFS[cat];
            return (
              <span key={cat} className="flex items-center gap-1">
                <span className="inline-block w-3 h-1.5 rounded-sm" style={{ backgroundColor: def.color }} />
                <span className="text-[9px] font-mono" style={{ color: def.color }}>{def.label}</span>
              </span>
            );
          })}
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-1.5 rounded-sm bg-neutral-700 opacity-40" />
            <span className="text-[9px] font-mono text-neutral-600">封鎖時到達不可</span>
          </span>
        </div>
      </div>

      {/* ─── デスクトップ: SVG ─── */}
      <div className="hidden md:block p-2">
        <svg
          viewBox={`0 0 ${VW} ${svgH}`}
          className="w-full h-auto"
          role="img"
          aria-label="タンカー到着タイムライン"
        >
          {/* Y軸グリッド + %ラベル */}
          {([100, 75, 50, 25, 0] as const).map(pct => {
            const y = toY(pct);
            return (
              <g key={pct}>
                <line
                  x1={PAD_L} y1={y} x2={PAD_L + CHART_W} y2={y}
                  stroke="#1e2a36"
                  strokeWidth={pct === 0 || pct === 100 ? "0.8" : "0.4"}
                />
                <text x={PAD_L - 5} y={y + 3.5} textAnchor="end" fontSize="8.5"
                  fill="#334155" fontFamily="monospace">
                  {pct}%
                </text>
              </g>
            );
          })}

          {/* 閾値ライン */}
          {thresholds.map(th => {
            const y = toY(th.pct);
            return (
              <g key={th.pct}>
                <line x1={PAD_L} y1={y} x2={PAD_L + CHART_W} y2={y}
                  stroke={th.color} strokeWidth="0.9" strokeDasharray="5,3" opacity="0.55" />
                <text x={PAD_L + CHART_W + 5} y={y + 3.5} fontSize="7.5"
                  fill={th.color} fillOpacity="0.75" fontFamily="monospace">
                  {th.label}
                </text>
              </g>
            );
          })}

          {/* 備蓄カーブ（3シナリオ） */}
          {SCENARIO_KEYS.map(scenario => {
            const sim = simByScenario[scenario];
            if (!sim?.timeline) return null;
            const path = buildCurvePath(sim.timeline, elapsedDays, todayOffset, scaleDays);
            if (!path) return null;
            const s = SCENARIO_STYLES[scenario];
            return (
              <path key={scenario} d={path}
                stroke={s.stroke} strokeWidth={s.width} strokeOpacity={s.opacity}
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            );
          })}

          {/* 月初目盛り縦線 + 月名ラベル */}
          {monthTicks.map(tick => {
            const x = toX(tick.days);
            return (
              <g key={tick.days}>
                <line x1={x} y1={tickY} x2={x} y2={svgH - 6}
                  stroke="#1e2a36" strokeWidth="0.6" />
                <text x={x} y={tickY + 17} textAnchor="middle" fontSize="9"
                  fill="#475569" fontFamily="monospace">
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* 今日ライン */}
          <line x1={todayX} y1={tickY} x2={todayX} y2={svgH - 6}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
          <text x={todayX} y={tickY + 17} textAnchor="middle" fontSize="9"
            fill="#94a3b8" fontFamily="monospace">
            今日
          </text>

          {/* カテゴリ区切り + タンカーバー */}
          {rows.map((row, i) => {
            const ry = rowY(i);

            if (row.kind === "sep") {
              const def = CATEGORY_DEFS[row.category];
              return (
                <g key={`sep-${row.category}`}>
                  <line
                    x1={PAD_L} y1={ry + SEP_H / 2}
                    x2={PAD_L + CHART_W} y2={ry + SEP_H / 2}
                    stroke="#1e2a36" strokeWidth="0.5"
                  />
                  <text
                    x={PAD_L - 6} y={ry + SEP_H / 2 + 3.5}
                    textAnchor="end" fontSize="7" fontFamily="monospace"
                    fill={def.color} fillOpacity={row.category === "hormuz" ? 0.5 : 0.7}>
                    {def.label}
                  </text>
                </g>
              );
            }

            // TankerRow
            const { tanker, category } = row;
            const def = CATEGORY_DEFS[category];
            const blocked = category === "hormuz";
            const barH = tanker.type === "VLCC" ? BAR_VLCC : BAR_LNG;
            const barY = ry + (ROW_H - barH) / 2;
            const isSelected = tanker.id === selectedId;
            const barEndX = toX(todayOffset + tanker.eta_days);
            const shortName = tanker.name.length > 13 ? tanker.name.slice(0, 12) + "…" : tanker.name;

            return (
              <g key={tanker.id}
                onClick={() => onSelect(isSelected ? null : tanker.id)}
                style={{ cursor: "pointer" }} role="button" aria-label={tanker.name}>
                {isSelected && (
                  <rect x={0} y={ry} width={VW} height={ROW_H}
                    fill="#ffffff" fillOpacity="0.04" />
                )}
                <text x={5} y={ry + ROW_H / 2 + 3.5} fontSize="7"
                  fontFamily="monospace"
                  fill={def.color} fillOpacity="0.7">
                  {tanker.type}
                </text>
                <text x={PAD_L - 6} y={ry + ROW_H / 2 + 3.5}
                  textAnchor="end" fontSize="9.5" fontFamily="monospace"
                  fill={blocked ? "#4a5568" : "#94a3b8"}
                  textDecoration={blocked ? "line-through" : "none"}>
                  {shortName}
                </text>

                {blocked ? (
                  <>
                    <rect x={PAD_L} y={barY} width={CHART_W} height={barH}
                      rx="2" fill="#525252" fillOpacity="0.18" />
                    <text x={PAD_L + 8} y={barY + barH / 2 + 3.5}
                      fontSize="7.5" fill="#525252" fontFamily="monospace">
                      封鎖時到達不可
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      x={todayX} y={barY}
                      width={Math.max(barEndX - todayX, 4)}
                      height={barH} rx="2" fill={def.color} fillOpacity="0.82"
                    />
                    <text x={barEndX + 5} y={barY + barH / 2 + 3.5}
                      fontSize="9" fill={def.color} fontFamily="monospace">
                      {formatArrivalDate(tanker.eta_days)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ─── モバイル: CSS バーのみ ─── */}
      <div className="md:hidden px-4 py-3">
        <div className="flex items-center mb-2">
          <div className="w-[92px] shrink-0" />
          <div className="flex-1 flex justify-between text-[9px] font-mono text-neutral-600">
            {mobileTickLabels.slice(0, 4).map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {rows.map((row, i) => {
            if (row.kind === "sep") {
              const def = CATEGORY_DEFS[row.category];
              return (
                <div key={`sep-${row.category}`}
                  className="flex items-center gap-2 pt-2 pb-0.5">
                  <div className="w-[92px] shrink-0" />
                  <span className="text-[8px] font-mono"
                    style={{ color: def.color, opacity: row.category === "hormuz" ? 0.5 : 0.7 }}>
                    {def.label}
                  </span>
                </div>
              );
            }

            const { tanker, category } = row;
            const def = CATEGORY_DEFS[category];
            const blocked = category === "hormuz";
            const widthPct = Math.min((tanker.eta_days / (scaleDays - todayOffset)) * 100, 100);
            const isSelected = tanker.id === selectedId;
            const shortName = tanker.name.length > 10 ? tanker.name.slice(0, 9) + "…" : tanker.name;

            return (
              <div key={`${tanker.id}-${i}`}
                className={`flex items-center gap-2 rounded py-0.5 cursor-pointer transition-colors ${
                  isSelected ? "bg-white/[0.04]" : ""}`}
                onClick={() => onSelect(isSelected ? null : tanker.id)}>
                <div className="w-[92px] shrink-0 text-right pr-2">
                  <span className="text-[9px] font-mono block truncate leading-tight"
                    style={{ color: blocked ? "#4a5568" : "#94a3b8",
                      textDecoration: blocked ? "line-through" : "none" }}>
                    {shortName}
                  </span>
                  <span className="text-[7px] font-mono" style={{ color: def.color + "70" }}>
                    {tanker.type}
                  </span>
                </div>
                <div className="flex-1 flex items-center h-4 relative">
                  {blocked ? (
                    <div className="w-full h-1.5 rounded-sm"
                      style={{ backgroundColor: "#525252", opacity: 0.2 }} />
                  ) : (
                    <>
                      <div className="h-2 rounded-sm shrink-0"
                        style={{ width: `${widthPct}%`, backgroundColor: def.color,
                          opacity: 0.82, minWidth: "3px" }} />
                      <span className="text-[9px] font-mono ml-1 shrink-0"
                        style={{ color: def.color }}>
                        {formatArrivalDate(tanker.eta_days)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center mt-2">
          <div className="w-[92px] shrink-0" />
          <div className="flex-1 border-t border-[#1e2a36]" />
        </div>
      </div>
    </div>
  );
};
