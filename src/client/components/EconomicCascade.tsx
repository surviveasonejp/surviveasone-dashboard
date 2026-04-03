/**
 * 経済カスケード表示
 *
 * フローシミュレーションの在庫推移から、石油価格→ガソリン→物流コスト→食品価格の
 * 連鎖的影響を簡易モデルで算出して表示する。
 *
 * モデル根拠:
 * - 石油価格弾力性: IEA World Energy Outlook 2024 + 1973年石油ショック実績
 * - ガソリン価格: 原油価格に対して約0.7の弾力性（税金・精製コストで緩衝）
 * - 物流コスト: 軽油価格に対して約0.3の弾力性（燃料費は物流費の30-40%）
 * - 食品価格: 物流コストに対して約0.15の弾力性（物流費は食品原価の15-20%）
 */

import { type FC, useMemo } from "react";
import type { FlowSimulationResult } from "../../shared/types";

interface EconomicCascadeProps {
  simulation: FlowSimulationResult;
  /** WTI原油スポット価格（$/バレル）。未取得時は静的基準値を使用 */
  wtiPriceUsd?: number;
}

/** 在庫%から原油価格倍率を算出（1973年石油ショック + IEAモデルに基づく近似） */
function getOilPriceMultiplier(stockPercent: number): number {
  if (stockPercent > 80) return 1.0;
  if (stockPercent > 50) return 1.0 + (80 - stockPercent) * 0.05;   // 80→50%: 1.0→2.5倍
  if (stockPercent > 30) return 2.5 + (50 - stockPercent) * 0.1;    // 50→30%: 2.5→4.5倍
  if (stockPercent > 10) return 4.5 + (30 - stockPercent) * 0.2;    // 30→10%: 4.5→8.5倍
  return 8.5 + (10 - stockPercent) * 0.5;                            // 10→0%: 8.5→13.5倍
}

interface CascadeSnapshot {
  day: number;
  stockPercent: number;
  oilPrice: number;      // 倍率
  gasolinePrice: number; // 円/L（基準170円）
  logisticsCost: number; // 倍率
  foodPrice: number;     // 倍率
  phase: "normal" | "spike" | "rationing" | "collapse";
}

const BASE_GASOLINE_YEN = 170;    // 静的基準ガソリン価格（円/L）。WTI未取得時のフォールバック
const WTI_REFERENCE_USD = 75;     // 170円/Lに対応するWTI基準価格（$/バレル）
const GASOLINE_ELASTICITY = 0.7;
const LOGISTICS_ELASTICITY = 0.3;
const FOOD_ELASTICITY = 0.15;

function calcCascade(sim: FlowSimulationResult, baseGasolineYen: number): CascadeSnapshot[] {
  if (sim.timeline.length === 0) return [];

  const initialOil = sim.timeline[0]?.oilStock_kL ?? 1;
  const snapshots: CascadeSnapshot[] = [];

  // 主要タイムポイントを抽出（Day 0, 7, 14, 30, 60, 90, 120, 180, 枯渇日）
  const keyDays = [0, 7, 14, 30, 60, 90, 120, 180, 270, 365].filter((d) => d < sim.timeline.length);
  if (sim.oilDepletionDay < sim.timeline.length && !keyDays.includes(sim.oilDepletionDay)) {
    keyDays.push(sim.oilDepletionDay);
    keyDays.sort((a, b) => a - b);
  }

  for (const day of keyDays) {
    const state = sim.timeline[day];
    if (!state) continue;

    const stockPercent = (state.oilStock_kL / initialOil) * 100;
    const oilPrice = getOilPriceMultiplier(stockPercent);

    // ガソリン価格: 原油倍率 × 弾力性 + ベース
    const gasolineMult = 1 + (oilPrice - 1) * GASOLINE_ELASTICITY;
    const gasolinePrice = Math.round(baseGasolineYen * gasolineMult);

    // 物流コスト: ガソリン倍率 × 弾力性
    const logisticsCost = 1 + (gasolineMult - 1) * LOGISTICS_ELASTICITY;

    // 食品価格: 物流倍率 × 弾力性
    const foodPrice = 1 + (logisticsCost - 1) * FOOD_ELASTICITY;

    const phase: CascadeSnapshot["phase"] =
      stockPercent > 50 ? "normal" :
      stockPercent > 30 ? "spike" :
      stockPercent > 10 ? "rationing" : "collapse";

    snapshots.push({ day, stockPercent, oilPrice, gasolinePrice, logisticsCost, foodPrice, phase });
  }

  return snapshots;
}

const PHASE_COLORS = {
  normal: "#22c55e",
  spike: "#f59e0b",
  rationing: "#ef4444",
  collapse: "#dc2626",
};

const PHASE_LABELS = {
  normal: "通常",
  spike: "高騰",
  rationing: "配給前夜",
  collapse: "配給制",
};

export const EconomicCascade: FC<EconomicCascadeProps> = ({ simulation, wtiPriceUsd }) => {
  const baseGasolineYen = wtiPriceUsd != null
    ? Math.round(BASE_GASOLINE_YEN * (wtiPriceUsd / WTI_REFERENCE_USD))
    : BASE_GASOLINE_YEN;
  const snapshots = useMemo(
    () => calcCascade(simulation, baseGasolineYen),
    [simulation, baseGasolineYen],
  );

  if (snapshots.length === 0) return null;

  return (
    <div className="bg-[#151c24] border border-[#1e2a36] rounded-lg p-4 space-y-3">
      <div className="text-xs font-mono text-neutral-500 tracking-wider">
        ECONOMIC CASCADE — 価格連鎖シミュレーション
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-neutral-600 border-b border-[#1e2a36]">
              <th className="px-2 py-1.5 text-left">Day</th>
              <th className="px-2 py-1.5 text-right">在庫</th>
              <th className="px-2 py-1.5 text-right">原油</th>
              <th className="px-2 py-1.5 text-right">ガソリン</th>
              <th className="px-2 py-1.5 text-right">物流</th>
              <th className="px-2 py-1.5 text-right">食品</th>
              <th className="px-2 py-1.5 text-center">状態</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => {
              const color = PHASE_COLORS[s.phase];
              return (
                <tr key={s.day} className="border-b border-[#0c1018]">
                  <td className="px-2 py-1.5 text-neutral-400">{s.day}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">{Math.round(s.stockPercent)}%</td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>×{s.oilPrice.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>¥{s.gasolinePrice}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>×{s.logisticsCost.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>×{s.foodPrice.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px]"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {PHASE_LABELS[s.phase]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="text-[9px] font-mono text-neutral-600 space-y-0.5">
        <p>原油価格: IEA価格弾力性モデル + 1973年石油ショック実績に基づく近似</p>
        <p>
          ガソリン基準:
          {wtiPriceUsd != null
            ? ` ¥${baseGasolineYen}/L（WTI $${wtiPriceUsd.toFixed(1)}/バレル実測値より算出）`
            : ` ¥${BASE_GASOLINE_YEN}/L（静的基準値）`}
          {" "}| 物流: 燃料費比率{LOGISTICS_ELASTICITY} | 食品: 物流費比率{FOOD_ELASTICITY}
        </p>
      </div>
    </div>
  );
};
