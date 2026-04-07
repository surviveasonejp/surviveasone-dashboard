import { type FC, useState, useMemo, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AlertBanner } from "../components/AlertBanner";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { useApiData } from "../hooks/useApiData";
import { type ScenarioId, DEFAULT_SCENARIO } from "../../shared/scenarios";
import type {
  PetrochemNode,
  PetrochemRiskNode,
  PetrochemTreeResponse,
  PetrochemCategory,
} from "../../shared/types";

// ─── 定数 ────────────────────────────────────────────────

const CATEGORY_COLORS: Record<PetrochemCategory, string> = {
  feedstock: "#94a3b8",
  refinery:  "#64748b",
  cracker:   "#f59e0b",
  monomer:   "#a78bfa",
  polymer:   "#60a5fa",
  product:   "#34d399",
  end_use:   "#fb923c",
};

const CATEGORY_LABELS: Record<PetrochemCategory, string> = {
  feedstock: "原料・留分",
  refinery:  "精製工程",
  cracker:   "分解・合成",
  monomer:   "モノマー",
  polymer:   "ポリマー",
  product:   "製品",
  end_use:   "最終用途",
};

/** Phase 4: 崩壊時の終端グレー色（「消えた・枯れた」印象） */
const COLLAPSE_COLOR = "#374151";

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** カテゴリ色 → グレーへの線形補間（崩壊の進行を「消滅」で表現） */
function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const clamp = Math.min(1, Math.max(0, t));
  const r = Math.round(r1 + (r2 - r1) * clamp);
  const g = Math.round(g1 + (g2 - g1) * clamp);
  const b = Math.round(b1 + (b2 - b1) * clamp);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Phase 3: ナフサクラッカー各留分の収率（IEA/ICIS 標準値）
 * エチレン~30%・プロピレン~16%・ブタジエン~4%・ベンゼン~6%
 */
const CRACKER_YIELD: Partial<Record<string, number>> = {
  ethylene:  0.30,
  propylene: 0.16,
  butadiene: 0.04,
  benzene:   0.06,
};

const X_STEP = 160;
const Y_STEP = 50;
const NODE_W = 138;
const NODE_H = 36;

// ─── 消費者影響定義 ─────────────────────────────────────

interface ConsumerImpact {
  icon: string;
  label: string;
  detail: string;
  nodeIds: string[];
}

const CONSUMER_IMPACTS: ConsumerImpact[] = [
  {
    icon: "🛒",
    label: "食品包装が消える",
    detail: "パン個包装・牛乳パック・食品トレーが入手困難。スーパーの生鮮コーナーが機能不全に",
    nodeIds: ["food_film_pe", "milk_carton_pe", "food_wrap_pe", "food_tray_ps", "food_container_pp"],
  },
  {
    icon: "🏥",
    label: "医療消耗品が枯渇",
    detail: "透析チューブ（34万人）・輸液バッグ・注射器の供給停止。在宅医療も病院も機能不全",
    nodeIds: ["dialysis_pvc", "iv_bag", "medical_pp"],
  },
  {
    icon: "🚰",
    label: "水道管が補修不能に",
    detail: "PVC・PE管の補修材料が枯渇。漏水放置→水圧低下→断水加速",
    nodeIds: ["water_pipe_pvc", "water_pipe_pe"],
  },
  {
    icon: "🚛",
    label: "物流・農業が止まる",
    detail: "タイヤ（合成ゴム）不足でトラック運行減少。化学肥料不足で翌年の作付けに深刻影響",
    nodeIds: ["truck_logistics", "agriculture"],
  },
];

// ─── フェーズ判定 ────────────────────────────────────────

interface Phase {
  label: string;
  description: string;
  color: string;
}

function getPhase(day: number, depletionDay: number): Phase {
  if (day === 0) return { label: "平常時", description: "供給制約なし。石化製品の供給は正常", color: "#22c55e" };
  if (day < 7)  return { label: "初動期", description: "ナフサ在庫を消費中。クラッカー稼働は維持", color: "#22c55e" };
  if (day < depletionDay * 0.5) return { label: "減産開始", description: "ナフサクラッカーが減産。エチレン・プロピレン生産量が低下し始める", color: "#f59e0b" };
  if (day < depletionDay) return { label: "逼迫", description: "石化基礎製品が逼迫。ポリマー（PE・PP・PVC）の製造が制約を受ける", color: "#f59e0b" };
  return { label: "枯渇・停止", description: "ナフサ在庫が枯渇。石化製品の新規製造が停止し、既存在庫のみで対応", color: "#ef4444" };
}

// ─── クライアントサイドリスク計算 ───────────────────────

const NAPHTHA_DEPLETION_DAYS: Record<ScenarioId, number> = {
  optimistic:  60,
  realistic:   30,
  pessimistic: 14,
};

function calcRisk(nodes: PetrochemNode[], scenario: ScenarioId, day: number): Map<string, PetrochemRiskNode> {
  const depletionDay = NAPHTHA_DEPLETION_DAYS[scenario];
  const result = new Map<string, PetrochemRiskNode>();

  for (const node of nodes) {
    const factor = node.naptha_factor;
    if (factor === null || factor === 0) {
      result.set(node.id, { ...node, riskLevel: 0, impactDay: 0, riskReason: "ナフサ非依存" });
      continue;
    }

    let impactMultiplier = 0.5;
    if (node.depth >= 5 && node.depth <= 6) impactMultiplier = 0.7;
    if (node.depth === 7) impactMultiplier = 0.9;
    const impactDay = Math.round(depletionDay * impactMultiplier);

    let riskLevel = 0;
    if (day >= impactDay && depletionDay > impactDay) {
      const progress = Math.min((day - impactDay) / (depletionDay - impactDay), 1);
      riskLevel = factor * progress;
    }

    let riskReason = "影響なし";
    if (riskLevel > 0.7) riskReason = "ナフサ枯渇により生産停止リスク";
    else if (riskLevel > 0.4) riskReason = "ナフサ制約により減産中";
    else if (riskLevel > 0.1) riskReason = "ナフサ在庫逼迫の影響開始";

    result.set(node.id, {
      ...node,
      riskLevel: Math.round(riskLevel * 100) / 100,
      impactDay,
      riskReason,
    });
  }

  return result;
}

// ─── レイアウト計算 ──────────────────────────────────────

interface LayoutNode extends PetrochemNode {
  x: number;
  y: number;
}

function buildLayout(nodes: PetrochemNode[]): LayoutNode[] {
  const byDepth = new Map<number, PetrochemNode[]>();
  for (const n of nodes) {
    const arr = byDepth.get(n.depth) ?? [];
    arr.push(n);
    byDepth.set(n.depth, arr);
  }

  const maxDepth = Math.max(...Array.from(byDepth.keys()), 0);

  // 各depthでの順序: 親ID→自IDでソート
  const sorted = new Map<number, PetrochemNode[]>();
  for (let d = 0; d <= maxDepth; d++) {
    const group = byDepth.get(d) ?? [];
    sorted.set(d, [...group].sort((a, b) => {
      const ap = a.parent_id ?? "";
      const bp = b.parent_id ?? "";
      return ap.localeCompare(bp) || a.id.localeCompare(b.id);
    }));
  }

  let maxCount = 0;
  sorted.forEach((arr) => { if (arr.length > maxCount) maxCount = arr.length; });

  const layoutNodes: LayoutNode[] = [];
  sorted.forEach((arr, depth) => {
    const totalH = arr.length * Y_STEP;
    const startY = (maxCount * Y_STEP - totalH) / 2 + Y_STEP / 2;
    arr.forEach((node, idx) => {
      layoutNodes.push({ ...node, x: depth * X_STEP + 16, y: startY + idx * Y_STEP });
    });
  });

  return layoutNodes;
}

// ─── SVGエッジ ───────────────────────────────────────────

interface EdgePathProps {
  src: LayoutNode;
  tgt: LayoutNode;
  riskLevel: number;
  highlighted: boolean;
}

const EdgePath: FC<EdgePathProps> = ({ src, tgt, riskLevel, highlighted }) => {
  const x1 = src.x + NODE_W;
  const y1 = src.y + NODE_H / 2;
  const x2 = tgt.x;
  const y2 = tgt.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
  // Phase 4: 通常色 #475569 → COLLAPSE_COLOR へ線形補間
  const stroke = highlighted ? "#60a5fa" : lerpColor("#475569", COLLAPSE_COLOR, riskLevel);
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={highlighted || riskLevel > 0.4 ? 2 : 1.5}
      opacity={0.8}
    />
  );
};

// ─── SVGノード ───────────────────────────────────────────

interface NodeRectProps {
  node: LayoutNode;
  riskNode: PetrochemRiskNode | undefined;
  isHighlighted: boolean;
  isCollapsed: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onDetail: () => void;
}

const NodeRect: FC<NodeRectProps> = ({
  node, riskNode, isHighlighted, isCollapsed, hasChildren, onToggle, onDetail,
}) => {
  const baseColor = CATEGORY_COLORS[node.category] ?? "#94a3b8";
  const risk = riskNode?.riskLevel ?? 0;

  // Phase 4: カテゴリ色 → COLLAPSE_COLOR へ線形補間
  const nodeColor = isHighlighted ? "#60a5fa" : lerpColor(baseColor, COLLAPSE_COLOR, risk);
  const fillOpacity = 0.08 + risk * 0.22; // 0.08(平常) → 0.30(崩壊)

  // Phase 3: 収率データ（crackerアウトプットのみ）
  const yieldPercent = CRACKER_YIELD[node.id] ?? null;
  // 収率ゲージがある場合はラベルを上寄せ
  const labelY = yieldPercent !== null ? 13 : NODE_H / 2;

  // リスクバーの色: #f59e0b → COLLAPSE_COLOR へ補間（risk 0.4→1.0 の範囲）
  const riskBarColor = lerpColor("#f59e0b", COLLAPSE_COLOR, Math.max(0, (risk - 0.4) / 0.6));

  return (
    <g transform={`translate(${node.x},${node.y})`}>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={3}
        fill={nodeColor}
        fillOpacity={fillOpacity}
        stroke={nodeColor}
        strokeWidth={isHighlighted ? 2 : 1}
        strokeDasharray={risk > 0.4 ? "4 2" : undefined}
        onClick={hasChildren ? onToggle : onDetail}
        style={{ cursor: "pointer" }}
      />
      {/* メインラベル */}
      <text
        x={6}
        y={labelY}
        dominantBaseline="middle"
        fontSize={9}
        fontFamily="'JetBrains Mono', monospace"
        fill={isCollapsed ? "#6b7280" : "#e2e8f0"}
        style={{ pointerEvents: "none" }}
      >
        {node.label.length > 15 ? node.label.slice(0, 14) + "…" : node.label}
      </text>
      {/* Phase 3: 収率ゲージ（crackerアウトプットのみ） */}
      {yieldPercent !== null && (
        <>
          {/* 背景バー */}
          <rect x={6} y={21} width={NODE_W - 24} height={3} rx={1} fill="#1e2a36" />
          {/* 収率バー（カテゴリ色・リスクに応じてグレーへ） */}
          <rect
            x={6}
            y={21}
            width={(NODE_W - 24) * yieldPercent}
            height={3}
            rx={1}
            fill={nodeColor}
            opacity={0.7}
          />
          {/* 収率% テキスト */}
          <text
            x={NODE_W - 16}
            y={23}
            dominantBaseline="middle"
            fontSize={7}
            fontFamily="'JetBrains Mono', monospace"
            fill={nodeColor}
            opacity={0.8}
            style={{ pointerEvents: "none" }}
          >
            {Math.round(yieldPercent * 100)}%
          </text>
        </>
      )}
      {/* リスクバー（底部） */}
      {risk > 0 && (
        <rect
          width={NODE_W * risk}
          height={2}
          y={NODE_H - 2}
          rx={1}
          fill={riskBarColor}
        />
      )}
      {/* 折りたたみ/展開インジケータ */}
      {hasChildren && (
        <text
          x={NODE_W - 10}
          y={NODE_H / 2}
          dominantBaseline="middle"
          fontSize={8}
          fill="#64748b"
          style={{ pointerEvents: "none" }}
        >
          {isCollapsed ? "▶" : "▼"}
        </text>
      )}
      {/* 詳細ボタン（葉ノード） */}
      {!hasChildren && (
        <rect
          x={NODE_W - 14}
          y={4}
          width={10}
          height={NODE_H - 8}
          rx={2}
          fill="#1e2a36"
          stroke="#334155"
          strokeWidth={1}
          onClick={onDetail}
          style={{ cursor: "pointer" }}
        />
      )}
    </g>
  );
};

// ─── フォールバック ──────────────────────────────────────

const EMPTY_TREE: PetrochemTreeResponse = { nodes: [], edges: [] };

// ─── ページ ──────────────────────────────────────────────

export const PetrochemTree: FC = () => {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const [day, setDay] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ node: PetrochemNode; risk: PetrochemRiskNode | undefined } | null>(null);

  const { data: treeData } = useApiData<PetrochemTreeResponse>("/api/petrochemtree", EMPTY_TREE);

  const nodes = treeData?.nodes ?? [];
  const edges = treeData?.edges ?? [];

  // depth >= 6 を初期折りたたみ
  useEffect(() => {
    if (nodes.length === 0) return;
    const initCollapsed = new Set<string>();
    for (const n of nodes) {
      if (n.depth >= 5) initCollapsed.add(n.id);
    }
    setCollapsed(initCollapsed);
  }, [nodes.length]);

  // クライアントサイドでリスク計算（API不要・即時反映）
  const riskMap = useMemo(() => calcRisk(nodes, scenario, day), [nodes, scenario, day]);

  const layout = useMemo(() => buildLayout(nodes), [nodes]);
  const layoutMap = useMemo(() => new Map(layout.map((n) => [n.id, n])), [layout]);

  const childrenMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of edges) {
      const arr = m.get(e.source_id) ?? [];
      arr.push(e.target_id);
      m.set(e.source_id, arr);
    }
    return m;
  }, [edges]);

  // 先祖に collapsed ノードがなければ表示
  function isVisible(nodeId: string): boolean {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    if (node.parent_id === null) return true;
    if (collapsed.has(node.parent_id)) return false;
    return isVisible(node.parent_id);
  }

  function toggleCollapse(nodeId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  const visibleNodes = layout.filter((n) => isVisible(n.id));
  const visibleEdges = edges.filter(
    (e) => isVisible(e.source_id) && isVisible(e.target_id),
  );

  const maxX = Math.max(...(visibleNodes.length > 0 ? visibleNodes.map((n) => n.x + NODE_W) : [800])) + 32;
  const maxY = Math.max(...(visibleNodes.length > 0 ? visibleNodes.map((n) => n.y + NODE_H) : [400])) + 40;

  const categories: PetrochemCategory[] = ["feedstock", "refinery", "cracker", "monomer", "polymer", "product", "end_use"];

  const expandAll = () => setCollapsed(new Set());
  const collapseDeep = () => {
    const next = new Set<string>();
    for (const n of nodes) {
      if (n.depth >= 5) next.add(n.id);
    }
    setCollapsed(next);
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold font-mono">
            <span className="text-[#f59e0b]">PETROCHEM</span> CHAIN
          </h1>
          <ScenarioSelector selected={scenario} onChange={setScenario} />
        </div>
        <p className="text-neutral-500 text-sm">
          原油→ナフサ→石化製品→社会インフラの連鎖依存構造
        </p>
      </div>

      <AlertBanner
        level="warning"
        message="ナフサ在庫は約14日分。逼迫するとクラッカーが減産開始し、透析チューブ・食品包装・水道管（PVC/PE）が順次影響を受ける"
      />

      {/* 日数スライダー */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="font-mono text-xs text-neutral-400 tracking-wider block">
              制約日数をスライドすると連鎖崩壊の進行が見えます
            </span>
          </div>
          <span className="font-mono text-sm font-bold" style={{ color: getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]).color }}>
            {day === 0 ? "平常時" : `発生後 ${day} 日`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={90}
          step={1}
          value={day}
          onChange={(e) => setDay(parseInt(e.target.value, 10))}
          className="w-full accent-[#f59e0b]"
          data-no-swipe
        />
        {/* フェーズラベル */}
        <div className="flex justify-between text-[9px] font-mono text-neutral-600 relative">
          <span>0</span>
          <span className="absolute left-[7%]">7日<br/>減産</span>
          <span className="absolute left-[33%]">30日<br/>現実枯渇</span>
          <span className="absolute left-[67%]">60日<br/>楽観枯渇</span>
          <span>90</span>
        </div>
        {/* 現在フェーズの説明 */}
        <div
          className="rounded p-2 border text-xs font-mono"
          style={{
            borderColor: getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]).color + "44",
            backgroundColor: getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]).color + "11",
          }}
        >
          <span
            className="font-bold mr-2"
            style={{ color: getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]).color }}
          >
            [{getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]).label}]
          </span>
          <span className="text-neutral-400">
            {getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]).description}
          </span>
        </div>
      </div>

      {/* 凡例 + 操作 */}
      <div className="bg-panel border border-border rounded-lg p-4">
        <div className="flex flex-wrap gap-3 mb-3">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[cat], opacity: 0.8 }} />
              <span className="text-[10px] font-mono text-neutral-400">{CATEGORY_LABELS[cat]}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={expandAll}
            className="text-[10px] font-mono px-2 py-1 rounded border border-border text-neutral-400 hover:text-white hover:border-neutral-500"
          >
            全展開
          </button>
          <button
            onClick={collapseDeep}
            className="text-[10px] font-mono px-2 py-1 rounded border border-border text-neutral-400 hover:text-white hover:border-neutral-500"
          >
            深部を折りたたむ
          </button>
          <span className="text-[10px] font-mono text-neutral-600 self-center">
            ▼/▶ クリックで折りたたみ、葉ノードクリックで詳細
          </span>
        </div>
      </div>

      {/* SVGツリー */}
      <div className="bg-panel border border-border rounded-lg p-3">
        {nodes.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-8">データ読み込み中...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <svg
              viewBox={`0 0 ${maxX} ${maxY}`}
              style={{ display: "block", width: "100%", minWidth: Math.min(maxX, 600), height: "auto", backgroundColor: "#151c24" }}
            >
              {/* 背景: ライトモード等でSVG背景が白くなるのを防ぐ（petrochem-bgクラスでCSS上書きを回避） */}
              <rect width={maxX} height={maxY} className="petrochem-bg" fill="#151c24" />
              {/* エッジ（ノードより先に描画してノードに重ならないように） */}
              {visibleEdges.map((edge) => {
                const src = layoutMap.get(edge.source_id);
                const tgt = layoutMap.get(edge.target_id);
                if (!src || !tgt) return null;
                const srcRisk = riskMap.get(edge.source_id)?.riskLevel ?? 0;
                const tgtRisk = riskMap.get(edge.target_id)?.riskLevel ?? 0;
                const edgeRisk = Math.max(srcRisk, tgtRisk);
                return (
                  <EdgePath
                    key={edge.id}
                    src={src}
                    tgt={tgt}
                    riskLevel={edgeRisk}
                    highlighted={highlightId === edge.target_id || highlightId === edge.source_id}
                  />
                );
              })}
              {/* ノード */}
              {visibleNodes.map((node) => (
                <NodeRect
                  key={node.id}
                  node={node}
                  riskNode={riskMap.get(node.id)}
                  isHighlighted={highlightId === node.id}
                  isCollapsed={collapsed.has(node.id)}
                  hasChildren={childrenMap.has(node.id)}
                  onToggle={() => toggleCollapse(node.id)}
                  onDetail={() =>
                    setDetail(
                      detail?.node.id === node.id
                        ? null
                        : { node, risk: riskMap.get(node.id) },
                    )
                  }
                />
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* 消費者影響サマリー */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-neutral-400 tracking-wider">
          ↓ あなたの生活への影響（{day === 0 ? "平常時" : `発生後${day}日`}）
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONSUMER_IMPACTS.map((impact) => {
            const maxRisk = Math.max(
              ...impact.nodeIds.map((id) => riskMap.get(id)?.riskLevel ?? 0),
            );
            const isAffected = maxRisk > 0.1;
            const isCritical = maxRisk > 0.7;
            const borderColor = isCritical ? "#ef4444" : isAffected ? "#f59e0b" : "#1e2a36";
            const bgColor = isCritical ? "#ef444411" : isAffected ? "#f59e0b11" : "transparent";
            return (
              <div
                key={impact.label}
                className="rounded-lg p-3 border space-y-1 transition-all"
                style={{ borderColor, backgroundColor: bgColor }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{impact.icon}</span>
                  <span
                    className="font-mono text-sm font-bold"
                    style={{ color: isCritical ? "#ef4444" : isAffected ? "#f59e0b" : "#64748b" }}
                  >
                    {impact.label}
                  </span>
                  {isCritical && (
                    <span className="text-[9px] font-mono bg-[#ef4444] text-white px-1 rounded ml-auto">危機</span>
                  )}
                  {isAffected && !isCritical && (
                    <span className="text-[9px] font-mono bg-[#f59e0b] text-black px-1 rounded ml-auto">影響</span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-500 leading-relaxed">{impact.detail}</p>
                {isAffected && (
                  <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${maxRisk * 100}%`,
                        backgroundColor: isCritical ? "#ef4444" : "#f59e0b",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 詳細パネル */}
      {detail && (
        <div className="bg-panel border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-mono font-bold text-sm" style={{ color: CATEGORY_COLORS[detail.node.category] }}>
              {detail.node.label}
            </h3>
            <button
              onClick={() => setDetail(null)}
              className="text-neutral-500 hover:text-white text-xs font-mono"
            >
              ✕
            </button>
          </div>
          <p className="text-neutral-400 text-xs leading-relaxed">{detail.node.description}</p>
          {detail.risk && detail.risk.riskLevel > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${detail.risk.riskLevel * 100}%`,
                      backgroundColor: lerpColor("#f59e0b", COLLAPSE_COLOR, Math.max(0, (detail.risk.riskLevel - 0.4) / 0.6)),
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-neutral-400">
                  リスク {Math.round(detail.risk.riskLevel * 100)}%
                </span>
              </div>
              <p className="text-[10px] font-mono text-neutral-500">{detail.risk.riskReason}</p>
              <p className="text-[10px] font-mono text-neutral-600">
                影響顕在化: 発生後 {detail.risk.impactDay} 日〜
              </p>
            </div>
          )}
          {detail.node.naptha_factor !== null && (
            <p className="text-[10px] font-mono text-neutral-600">
              ナフサ依存度: {Math.round((detail.node.naptha_factor ?? 0) * 100)}%
            </p>
          )}
        </div>
      )}

      {/* 出典 */}
      <div className="text-[10px] text-neutral-600 font-mono space-y-0.5">
        <p>出典: 資源エネルギー庁 石油統計 / JPCA石油化学工業協会 / 化学日報 / 農水省</p>
        <Link to="/methodology" className="underline hover:text-neutral-400">計算モデルの前提条件 →</Link>
      </div>
    </div>
  );
};
