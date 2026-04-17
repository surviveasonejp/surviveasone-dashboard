import { type FC } from "react";
import type { MapScenario } from "./TankerMap";

// ─── 日本の原油輸入能力データ（シナリオ別, mbpd）────────
// 出典: 日本の原油輸入量約3.0mbpd、ホルムズ依存約77%
// フジャイラ+ヤンブーパイプライン迂回分は封鎖時に代替可能

interface ScenarioSupply {
  hormuz: number;       // ホルムズ経由（封鎖強度で減少）
  bypass: number;       // パイプライン迂回（封鎖時に積み上げ可能）
  existing_alt: number; // 非中東既存供給（豪州・サハリン・米国等）
}

const DEMAND_MBPD = 3.0;

const SUPPLY_BY_SCENARIO: Record<MapScenario, ScenarioSupply> = {
  normal: {
    hormuz: 2.3,
    bypass: 0.0,
    existing_alt: 0.7,
  },
  partial: {
    hormuz: 1.15,
    bypass: 0.5,
    existing_alt: 0.7,
  },
  full: {
    hormuz: 0.0,
    bypass: 0.8,
    existing_alt: 0.7,
  },
};

const SCENARIO_LABELS: Record<MapScenario, string> = {
  normal: "通常時",
  partial: "部分封鎖",
  full: "完全封鎖",
};

interface SupplyGapChartProps {
  scenario: MapScenario;
}

interface RowData {
  key: MapScenario;
  label: string;
  supply: ScenarioSupply;
  isActive: boolean;
}

export const SupplyGapChart: FC<SupplyGapChartProps> = ({ scenario }) => {
  const rows: RowData[] = (["normal", "partial", "full"] as MapScenario[]).map((s) => ({
    key: s,
    label: SCENARIO_LABELS[s],
    supply: SUPPLY_BY_SCENARIO[s],
    isActive: s === scenario,
  }));

  const activeSupply = SUPPLY_BY_SCENARIO[scenario];
  const activeTotal = activeSupply.hormuz + activeSupply.bypass + activeSupply.existing_alt;
  const activeDeficit = Math.max(0, DEMAND_MBPD - activeTotal);
  const activePct = Math.round((activeTotal / DEMAND_MBPD) * 100);
  const isConstrained = activePct < 100;

  const BAR_W = 460;
  const BAR_H = 18;
  const ROW_H = 30;
  const LABEL_W = 72;
  const SVG_H = rows.length * ROW_H + 24; // +24 for axis
  const SVG_W = LABEL_W + BAR_W + 80;

  const toX = (v: number) => (v / DEMAND_MBPD) * BAR_W;

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      {/* ヘッダー: 現在のシナリオの供給能力を大きく表示 */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono font-bold tabular-nums"
            style={{
              fontSize: "2.25rem",
              lineHeight: 1,
              color: activePct >= 90 ? "#16a34a" : activePct >= 60 ? "#d97706" : "#dc2626",
            }}
          >
            {activePct}%
          </span>
          <span className="font-mono text-sm" style={{
            color: activePct >= 90 ? "#16a34a" : activePct >= 60 ? "#d97706" : "#dc2626",
          }}>
            供給能力
          </span>
        </div>
        <div className="border-l border-border pl-4 space-y-0.5">
          <div className="font-mono text-xs text-neutral-500 tracking-wider">
            {SCENARIO_LABELS[scenario]}の原油輸入能力
          </div>
          {isConstrained && (
            <div className="font-mono text-xs font-bold" style={{ color: "var(--color-primary)" }}>
              不足: {activeDeficit.toFixed(1)} mbpd — 備蓄放出・需要抑制で対応
            </div>
          )}
          {!isConstrained && (
            <div className="font-mono text-xs text-neutral-500">
              需要 {DEMAND_MBPD.toFixed(1)} mbpd を充足
            </div>
          )}
        </div>
      </div>

      {/* バーチャート */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-auto"
        style={{ maxHeight: "140px" }}
        aria-label="シナリオ別原油輸入能力比較"
      >
        {rows.map((row, i) => {
          const y = i * ROW_H + 4;
          const total = row.supply.hormuz + row.supply.bypass + row.supply.existing_alt;
          const deficit = Math.max(0, DEMAND_MBPD - total);
          const pct = Math.round((total / DEMAND_MBPD) * 100);

          const hX = toX(row.supply.hormuz);
          const bX = toX(row.supply.bypass);
          const eX = toX(row.supply.existing_alt);
          const dX = toX(deficit);

          return (
            <g key={row.key}>
              {/* ラベル */}
              <text
                x={LABEL_W - 6}
                y={y + BAR_H / 2 + 4}
                textAnchor="end"
                fill={row.isActive ? "#e2e8f0" : "#64748b"}
                fontSize={row.isActive ? "11" : "10"}
                fontFamily="monospace"
                fontWeight={row.isActive ? "bold" : "normal"}
              >
                {row.label}
              </text>

              {/* アクティブ行の背景 */}
              {row.isActive && (
                <rect
                  x={LABEL_W}
                  y={y - 1}
                  width={BAR_W + 8}
                  height={BAR_H + 2}
                  fill="#ffffff"
                  opacity={0.04}
                  rx={2}
                />
              )}

              {/* ホルムズ経由（オレンジ） */}
              {row.supply.hormuz > 0 && (
                <rect
                  x={LABEL_W}
                  y={y}
                  width={hX}
                  height={BAR_H}
                  fill="#f59e0b"
                  opacity={row.isActive ? 0.85 : 0.45}
                  rx={2}
                />
              )}

              {/* パイプライン迂回（ブルー） */}
              {row.supply.bypass > 0 && (
                <rect
                  x={LABEL_W + hX}
                  y={y}
                  width={bX}
                  height={BAR_H}
                  fill="#3b82f6"
                  opacity={row.isActive ? 0.85 : 0.45}
                />
              )}

              {/* 非中東既存（グリーン） */}
              <rect
                x={LABEL_W + hX + bX}
                y={y}
                width={eX}
                height={BAR_H}
                fill="#22c55e"
                opacity={row.isActive ? 0.85 : 0.45}
              />

              {/* 不足分（薄赤） */}
              {deficit > 0 && (
                <rect
                  x={LABEL_W + hX + bX + eX}
                  y={y}
                  width={dX}
                  height={BAR_H}
                  fill="#ef4444"
                  opacity={row.isActive ? 0.22 : 0.10}
                  rx={0}
                />
              )}

              {/* 供給率テキスト */}
              <text
                x={LABEL_W + BAR_W + 6}
                y={y + BAR_H / 2 + 4}
                fill={row.isActive ? (deficit > 0 ? "#ef4444" : "#22c55e") : "#475569"}
                fontSize={row.isActive ? "11" : "10"}
                fontFamily="monospace"
                fontWeight={row.isActive ? "bold" : "normal"}
              >
                {pct}%
              </text>

              {/* 不足量テキスト（アクティブ行のみ） */}
              {row.isActive && deficit > 0 && (
                <text
                  x={LABEL_W + BAR_W + 38}
                  y={y + BAR_H / 2 + 4}
                  fill="#ef4444"
                  fontSize="9"
                  fontFamily="monospace"
                  opacity={0.75}
                >
                  -{deficit.toFixed(1)}
                </text>
              )}
            </g>
          );
        })}

        {/* 軸（需要量100%ライン） */}
        <line
          x1={LABEL_W + BAR_W}
          y1={0}
          x2={LABEL_W + BAR_W}
          y2={rows.length * ROW_H + 4}
          stroke="#64748b"
          strokeWidth={0.8}
          strokeDasharray="3 3"
        />
        <text
          x={LABEL_W + BAR_W}
          y={rows.length * ROW_H + 18}
          textAnchor="middle"
          fill="#64748b"
          fontSize="9"
          fontFamily="monospace"
        >
          需要量 3.0 mbpd
        </text>
      </svg>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] font-mono text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm bg-warning-soft opacity-80" />
          ホルムズ経由
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm bg-info-soft opacity-80" />
          パイプライン迂回（フジャイラ・ヤンブー）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm bg-success-soft opacity-80" />
          非中東既存供給（豪州・サハリン等）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm bg-primary-soft opacity-30" />
          不足（備蓄放出・需要抑制で対応）
        </span>
      </div>
      <p className="mt-1.5 text-[9px] text-neutral-600 font-mono">
        ※ シミュレーション推計値。備蓄放出（SPR）・IEA協調・需要抑制政策により実際の影響は変動します
      </p>
    </div>
  );
};
