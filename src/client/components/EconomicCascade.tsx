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
 * - ナフサ: 原油倍率をそのまま適用（ナフサは原油価格に高相関）
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
  oilPrice: number;      // 倍率（原油価格）
  naphthaYen: number;    // 円/kL（ナフサ価格）
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
const BASE_NAPHTHA_YEN_PER_KL = 70_000;   // 基準ナフサ価格（円/kL、WTI $75時）
const NAPHTHA_STOCK_DAYS = 60;             // 民間在庫推計日数（経産省ベース推計）
const NAPHTHA_REDUCTION_THRESHOLD = 100_000;  // 減産開始ライン（円/kL）
const NAPHTHA_STOP_THRESHOLD = 110_000;       // 広範囲停止ライン（円/kL）
const NAPHTHA_COLLAPSE_THRESHOLD = 130_000;   // 構造崩壊ライン（円/kL）

function calcCascade(sim: FlowSimulationResult, baseGasolineYen: number, baseNaphthaYen: number): CascadeSnapshot[] {
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

    // ナフサ価格: 原油倍率 × 基準価格（WTI連動）
    const naphthaYen = Math.round(baseNaphthaYen * oilPrice);

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

    snapshots.push({ day, stockPercent, oilPrice, naphthaYen, gasolinePrice, logisticsCost, foodPrice, phase });
  }

  return snapshots;
}

function getNaphthaColor(yen: number): string {
  if (yen >= NAPHTHA_COLLAPSE_THRESHOLD) return "#dc2626";
  if (yen >= NAPHTHA_STOP_THRESHOLD) return "#ef4444";
  if (yen >= NAPHTHA_REDUCTION_THRESHOLD) return "#f59e0b";
  return "#22c55e";
}

function getNaphthaStatus(yen: number): string {
  if (yen >= NAPHTHA_COLLAPSE_THRESHOLD) return "崩壊";
  if (yen >= NAPHTHA_STOP_THRESHOLD) return "停止";
  if (yen >= NAPHTHA_REDUCTION_THRESHOLD) return "減産";
  return "";
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
  const baseNaphthaYen = wtiPriceUsd != null
    ? Math.round(BASE_NAPHTHA_YEN_PER_KL * (wtiPriceUsd / WTI_REFERENCE_USD))
    : BASE_NAPHTHA_YEN_PER_KL;
  const snapshots = useMemo(
    () => calcCascade(simulation, baseGasolineYen, baseNaphthaYen),
    [simulation, baseGasolineYen, baseNaphthaYen],
  );

  if (snapshots.length === 0) return null;

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
      <div className="text-xs font-mono text-neutral-500 tracking-wider">
        ECONOMIC CASCADE — 価格連鎖シミュレーション
      </div>

      {/* ナフサ vs 石油 在庫比較 */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono border border-border rounded p-2 bg-[#0c1018]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block bg-warning-soft" />
          <span className="text-neutral-500">ナフサ民間在庫</span>
          <span className="text-warning-soft font-bold">{NAPHTHA_STOCK_DAYS}日</span>
          <span className="text-[10px] text-neutral-600">（法的備蓄義務なし）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm inline-block bg-success-soft" />
          <span className="text-neutral-500">石油国家備蓄</span>
          <span className="text-success-soft font-bold">241日</span>
          <span className="text-[10px] text-neutral-600">（石油備蓄法）</span>
        </div>
        <p className="w-full text-[10px] text-warning-soft/70">
          ⚠ ナフサは石油より約4倍早く枯渇する。減産ライン: ¥10万/kL | 停止ライン: ¥11〜13万/kL | 崩壊ライン: ¥13万/kL超
        </p>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-neutral-600 border-b border-border">
              <th className="px-2 py-1.5 text-left">Day</th>
              <th className="px-2 py-1.5 text-right">在庫</th>
              <th className="px-2 py-1.5 text-right">ナフサ</th>
              <th className="px-2 py-1.5 text-right">ガソリン</th>
              <th className="px-2 py-1.5 text-right">物流</th>
              <th className="px-2 py-1.5 text-right">食品</th>
              <th className="px-2 py-1.5 text-center">状態</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => {
              const color = PHASE_COLORS[s.phase];
              const naphthaColor = getNaphthaColor(s.naphthaYen);
              const naphthaStatus = getNaphthaStatus(s.naphthaYen);
              return (
                <tr key={s.day} className="border-b border-[#0c1018]">
                  <td className="px-2 py-1.5 text-neutral-400">{s.day}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">{Math.round(s.stockPercent)}%</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: naphthaColor }}>
                    ¥{(s.naphthaYen / 10_000).toFixed(1)}万
                    {naphthaStatus && (
                      <span className="text-[10px] ml-0.5 opacity-80">{naphthaStatus}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>¥{s.gasolinePrice}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>×{s.logisticsCost.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color }}>×{s.foodPrice.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
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
      <div className="text-[10px] font-mono text-neutral-600 space-y-0.5">
        <p>ナフサ基準: ¥{(baseNaphthaYen / 10_000).toFixed(1)}万/kL
          {wtiPriceUsd != null
            ? `（WTI $${wtiPriceUsd.toFixed(1)}/バレル実測値より算出）`
            : "（静的基準値）"}
          {" "}| 停止ライン: <span className="text-warning-soft">¥10万（減産）</span>→<span className="text-primary-soft">¥11〜13万（広範囲停止）</span>→<span className="text-primary">¥13万超（崩壊）</span>
        </p>
        <p>
          ガソリン基準:
          {wtiPriceUsd != null
            ? ` ¥${baseGasolineYen}/L（WTI $${wtiPriceUsd.toFixed(1)}/バレル実測値より算出）`
            : ` ¥${BASE_GASOLINE_YEN}/L（静的基準値）`}
          {" "}| 物流: 燃料費比率{LOGISTICS_ELASTICITY} | 食品: 物流費比率{FOOD_ELASTICITY}
        </p>
      </div>

      {/* ナフサ月別需給バランス */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="text-xs font-mono text-neutral-500 tracking-wider">
          NAPHTHA SUPPLY BALANCE — ナフサ月別需給シミュレーション
        </div>
        <div className="text-[10px] font-mono text-neutral-600 mb-1">
          前提: 中東輸入ゼロ・中東以外2倍（90万kL/月）・精製110万kL/月継続（単位: 万kL/月）
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-neutral-600 border-b border-border">
                <th className="px-2 py-1.5 text-left">月</th>
                <th className="px-2 py-1.5 text-right">輸入</th>
                <th className="px-2 py-1.5 text-right">精製</th>
                <th className="px-2 py-1.5 text-right">在庫</th>
                <th className="px-2 py-1.5 text-right">合計</th>
                <th className="px-2 py-1.5 text-right">需要</th>
                <th className="px-2 py-1.5 text-right">過不足</th>
                <th className="px-2 py-1.5 text-center">状態</th>
              </tr>
            </thead>
            <tbody>
              {([
                { month: "4月（発生後）", import_: 90, refine: 110, stock: 150, demand: 290, surplus: 60, status: "○", color: "#22c55e" },
                { month: "5月", import_: 90, refine: 110, stock: 60, demand: 290, surplus: -30, status: "△", color: "#f59e0b" },
                { month: "6月", import_: 90, refine: 110, stock: 0, demand: 290, surplus: -90, status: "✗", color: "#ef4444" },
              ] as const).map((row) => (
                <tr key={row.month} className="border-b border-[#0c1018]">
                  <td className="px-2 py-1.5 text-neutral-400">{row.month}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">{row.import_}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">{row.refine}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">{row.stock}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-300 font-bold">{row.import_ + row.refine + row.stock}</td>
                  <td className="px-2 py-1.5 text-right text-neutral-400">{row.demand}</td>
                  <td className="px-2 py-1.5 text-right font-bold" style={{ color: row.color }}>
                    {row.surplus > 0 ? `+${row.surplus}` : row.surplus}
                  </td>
                  <td className="px-2 py-1.5 text-center font-bold" style={{ color: row.color }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] font-mono text-neutral-600">
          6月時点で需要の69%（200/290）しか調達不可 → 石化クラッカー停止・製造業の大量停止
        </p>
      </div>

      {/* 産業配給優先順位 — 配給前夜・配給制フェーズ時に表示 */}
      {snapshots.some((s) => s.phase === "rationing" || s.phase === "collapse") && (
        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-xs font-mono text-primary-soft tracking-wider">
            産業配給 — ナフサ割当の優先順位
          </div>
          <p className="text-[10px] font-mono text-neutral-600">
            ナフサ配給は「国民」ではなく「産業」が対象。既存法（石油需給適正化法）の段階発動による。
          </p>
          <div className="space-y-1">
            {([
              { rank: "優先1", label: "医療材料", desc: "点滴バッグ・注射器・医療チューブ", color: "#22c55e" },
              { rank: "優先2", label: "食品包装", desc: "保存・衛生維持に不可欠", color: "#22c55e" },
              { rank: "優先3", label: "水処理薬品", desc: "ポリマー系凝集剤・浄水場維持", color: "#f59e0b" },
              { rank: "優先4", label: "半導体・精密", desc: "フォトレジスト等・安全保障用途", color: "#f59e0b" },
              { rank: "削減", label: "自動車・家電・建材", desc: "生産停止対象", color: "#ef4444" },
              { rank: "停止", label: "輸出向け化学製品", desc: "国内優先で輸出割当ゼロ", color: "#ef4444" },
            ] as const).map((item) => (
              <div key={item.rank} className="flex items-start gap-2 text-xs font-mono">
                <span
                  className="shrink-0 w-12 text-right text-[10px] pt-0.5"
                  style={{ color: item.color }}
                >
                  {item.rank}
                </span>
                <span className="text-neutral-300">{item.label}</span>
                <span className="text-neutral-600 text-[10px] pt-0.5">— {item.desc}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] font-mono text-neutral-600">
              <span><span className="text-warning-soft">在庫50%↓</span> → 石油備蓄法（国家備蓄放出）</span>
              <span><span className="text-primary-soft">在庫30%↓</span> → 石油需給適正化法（用途別優先配分）</span>
              <span><span className="text-primary">在庫10%↓</span> → 国民生活安定緊急措置法（正式配給制）</span>
            </div>
            <p className="text-[10px] font-mono text-primary-soft/70">
              ⚠ ナフサ法的空白: 3法は「燃料危機」設計。ナフサ用途別配分・包装材統制の法的根拠なし。
              食料があっても「包めない・運べない」シナリオへの法的対応は未整備。
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
