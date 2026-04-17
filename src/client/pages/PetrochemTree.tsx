/**
 * PetrochemTree — 石化サプライチェーン樹形図
 * ライトモード完全対応 + インタラクティブ強化版
 *
 * 機能:
 * - ライトモード対応（白背景・ダークテキスト）
 * - ズーム/パン（wheelズーム + ドラッグパン）
 * - ホバーツールチップ（SVG外div・コンテナ相対座標）
 * - フォーカスパス（葉ノードクリックで上流/下流ハイライト）
 * - 検索フィルタ（ノード名でリアルタイムハイライト）
 * - ズーム in/out/リセット ボタン
 */

import { type FC, useState, useMemo, useEffect, useRef, useCallback } from "react";
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

// ─── カラー定数（ライトモード対応） ────────────────────────────

const CATEGORY_COLORS: Record<PetrochemCategory, string> = {
  feedstock: "#94a3b8",
  refinery:  "#64748b",
  cracker:   "#f59e0b",
  monomer:   "#a78bfa",
  polymer:   "var(--color-info-lighter)",
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

/** ライトモード崩壊色（グレー系・「消えた」印象） */
const COLLAPSE_COLOR = "#94a3b8";
/** エッジ通常色 */
const EDGE_COLOR = "#cbd5e1";
/** エッジ フォーカス/ハイライト色 */
const EDGE_FOCUS = "#2563eb";
/** フォーカスパス ノード stroke */
const FOCUS_STROKE = "#2563eb";
/** 検索マッチ ノード stroke */
const SEARCH_STROKE = "#d97706";

// ─── Phase 3: ナフサクラッカー収率（IEA/ICIS 標準値） ────────

const CRACKER_YIELD: Partial<Record<string, number>> = {
  ethylene:  0.30,
  propylene: 0.16,
  butadiene: 0.04,
  benzene:   0.06,
};

// ─── レイアウト定数 ───────────────────────────────────────────

const X_STEP = 160;
const Y_STEP = 50;
const NODE_W = 138;
const NODE_H = 36;

const NAPHTHA_DEPLETION_DAYS: Record<ScenarioId, number> = {
  optimistic:  60,
  realistic:   30,
  pessimistic: 14,
  ceasefire:   45, // 停戦前（45日）はrealisticと同等、停戦後は段階的回復
};

// ─── ヘルパー関数 ─────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const c = Math.min(1, Math.max(0, t));
  const r = Math.round(r1 + (r2 - r1) * c);
  const g = Math.round(g1 + (g2 - g1) * c);
  const b = Math.round(b1 + (b2 - b1) * c);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

interface PhaseInfo {
  label: string;
  description: string;
  color: string;
}

function getPhase(day: number, depletionDay: number): PhaseInfo {
  if (day === 0) return { label: "平常時", description: "供給制約なし。石化製品の供給は正常", color: "#16a34a" };
  if (day < 7)  return { label: "初動期", description: "ナフサ在庫を消費中。クラッカー稼働は維持", color: "#16a34a" };
  if (day < depletionDay * 0.5) return { label: "減産開始", description: "ナフサクラッカーが減産。エチレン・プロピレン生産量が低下し始める", color: "#d97706" };
  if (day < depletionDay) return { label: "逼迫", description: "石化基礎製品が逼迫。ポリマー（PE・PP・PVC）の製造が制約を受ける", color: "#d97706" };
  return { label: "枯渇・停止", description: "ナフサ在庫が枯渇。石化製品の新規製造が停止し、既存在庫のみで対応", color: "#dc2626" };
}

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
    if (node.depth >= 8) impactMultiplier = 0.95;
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

interface ViewBox { x: number; y: number; w: number; h: number; }

function computeInitViewBox(layout: LayoutNode[]): ViewBox {
  if (layout.length === 0) return { x: -16, y: -16, w: 832, h: 432 };
  const maxX = Math.max(...layout.map(n => n.x + NODE_W)) + 32;
  const maxY = Math.max(...layout.map(n => n.y + NODE_H)) + 40;
  return { x: -16, y: -16, w: maxX + 32, h: maxY + 32 };
}

// ─── 消費者影響定義 ───────────────────────────────────────────

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

// ─── ツールチップ コンポーネント ──────────────────────────────

interface TooltipData {
  node: PetrochemNode;
  risk: PetrochemRiskNode | undefined;
  x: number;
  y: number;
}

const Tooltip: FC<{ data: TooltipData; containerW: number; containerH: number }> = ({
  data, containerW, containerH,
}) => {
  const { node, risk, x, y } = data;
  const baseColor = CATEGORY_COLORS[node.category] ?? "#94a3b8";
  const effectiveRisk = risk?.riskLevel ?? 0;
  const nodeColor = lerpColor(baseColor, COLLAPSE_COLOR, effectiveRisk);
  const TW = 228;
  const TH = 190;
  const tx = Math.min(x + 14, containerW - TW - 8);
  const ty = Math.max(8, Math.min(y - 70, containerH - TH - 8));

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{ left: tx, top: ty, width: TW }}
    >
      <div className="bg-panel border border-border rounded-lg shadow-lg p-3 text-[10px] font-mono space-y-1.5">
        <div className="font-bold text-[11px] leading-tight" style={{ color: nodeColor }}>
          {node.label}
        </div>
        <span
          className="inline-block text-[9px] px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: CATEGORY_COLORS[node.category] }}
        >
          {CATEGORY_LABELS[node.category]}
        </span>
        {node.description && (
          <div className="text-text-muted leading-relaxed border-t border-border pt-1.5">
            {node.description.length > 90 ? node.description.slice(0, 89) + "…" : node.description}
          </div>
        )}
        {risk !== undefined && risk.riskLevel > 0 && (
          <div className="space-y-1 border-t border-border pt-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${risk.riskLevel * 100}%`,
                    backgroundColor: lerpColor("#d97706", COLLAPSE_COLOR, Math.max(0, (risk.riskLevel - 0.4) / 0.6)),
                  }}
                />
              </div>
              <span className="text-text-muted shrink-0 text-[9px]">
                {Math.round(risk.riskLevel * 100)}%
              </span>
            </div>
            <div className="text-text-muted">{risk.riskReason}</div>
          </div>
        )}
        {node.naptha_factor !== null && (
          <div className="text-neutral-400 border-t border-border pt-1">
            ナフサ依存度: {Math.round((node.naptha_factor ?? 0) * 100)}%
          </div>
        )}
      </div>
    </div>
  );
};

// ─── SVGエッジ ────────────────────────────────────────────────

interface EdgePathProps {
  src: LayoutNode;
  tgt: LayoutNode;
  riskLevel: number;
  isFocusPath: boolean;
  highlighted: boolean;
  isDimmed: boolean;
}

const EdgePath: FC<EdgePathProps> = ({ src, tgt, riskLevel, isFocusPath, highlighted, isDimmed }) => {
  const x1 = src.x + NODE_W;
  const y1 = src.y + NODE_H / 2;
  const x2 = tgt.x;
  const y2 = tgt.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;
  const d = `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
  const isActive = highlighted || isFocusPath;
  const stroke = isActive ? EDGE_FOCUS : lerpColor(EDGE_COLOR, COLLAPSE_COLOR, riskLevel);
  const strokeWidth = isActive ? 2 : 1.5;
  const opacity = isDimmed ? 0.10 : (isActive ? 1 : 0.65);

  return (
    <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={opacity} />
  );
};

// ─── SVGノード ────────────────────────────────────────────────

interface NodeRectProps {
  node: LayoutNode;
  riskNode: PetrochemRiskNode | undefined;
  isHighlighted: boolean;
  isFocusPath: boolean;
  isSearchMatch: boolean;
  isDimmed: boolean;
  isCollapsed: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onMouseEnter: (e: React.MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
}

const NodeRect: FC<NodeRectProps> = ({
  node, riskNode, isHighlighted, isFocusPath, isSearchMatch, isDimmed,
  isCollapsed, hasChildren, onToggle, onFocus, onMouseEnter, onMouseLeave,
}) => {
  const baseColor = CATEGORY_COLORS[node.category] ?? "#94a3b8";
  const risk = riskNode?.riskLevel ?? 0;
  const fillColor = lerpColor(baseColor, COLLAPSE_COLOR, risk);

  let strokeColor: string;
  let strokeWidth: number;
  if (isHighlighted || isFocusPath) {
    strokeColor = FOCUS_STROKE;
    strokeWidth = 2;
  } else if (isSearchMatch) {
    strokeColor = SEARCH_STROKE;
    strokeWidth = 2;
  } else {
    strokeColor = fillColor;
    strokeWidth = 1;
  }

  const fillOpacity = isDimmed ? 0.04 : (0.12 + risk * 0.18);
  const textOpacity = isDimmed ? 0.2 : 1;
  const yieldPercent = CRACKER_YIELD[node.id] ?? null;
  const labelY = yieldPercent !== null ? 13 : NODE_H / 2;
  const riskBarColor = lerpColor("#d97706", COLLAPSE_COLOR, Math.max(0, (risk - 0.4) / 0.6));

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      data-node={node.id}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* ノード背景 */}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={4}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={risk > 0.4 && !isFocusPath && !isSearchMatch && !isHighlighted ? "4 2" : undefined}
        onClick={hasChildren ? onToggle : onFocus}
        style={{ cursor: "pointer" }}
      />
      {/* ラベル */}
      <text
        x={6}
        y={labelY}
        dominantBaseline="middle"
        fontSize={9}
        fontFamily="'JetBrains Mono', monospace"
        fill="var(--color-text)"
        fillOpacity={textOpacity}
        style={{ pointerEvents: "none" }}
      >
        {node.label.length > 15 ? node.label.slice(0, 14) + "…" : node.label}
      </text>
      {/* 収率ゲージ（crackerアウトプットのみ） */}
      {yieldPercent !== null && (
        <>
          <rect x={6} y={21} width={NODE_W - 24} height={3} rx={1} fill="var(--color-border)" />
          <rect
            x={6} y={21}
            width={(NODE_W - 24) * yieldPercent}
            height={3} rx={1}
            fill={fillColor}
            opacity={isDimmed ? 0.15 : 0.8}
          />
          <text
            x={NODE_W - 16} y={23}
            dominantBaseline="middle"
            fontSize={7}
            fontFamily="'JetBrains Mono', monospace"
            fill={fillColor}
            opacity={isDimmed ? 0.15 : 0.8}
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
          opacity={isDimmed ? 0.15 : 1}
        />
      )}
      {/* 折りたたみ/展開インジケータ */}
      {hasChildren && (
        <text
          x={NODE_W - 10} y={NODE_H / 2}
          dominantBaseline="middle"
          fontSize={8}
          fill="#94a3b8"
          style={{ pointerEvents: "none" }}
        >
          {isCollapsed ? "▶" : "▼"}
        </text>
      )}
      {/* 詳細ボタン（葉ノード） */}
      {!hasChildren && (
        <rect
          x={NODE_W - 14} y={4}
          width={10} height={NODE_H - 8}
          rx={2}
          fill="var(--color-bg)"
          stroke="var(--color-border)"
          strokeWidth={1}
          onClick={onFocus}
          style={{ cursor: "pointer" }}
        />
      )}
    </g>
  );
};

// ─── フォールバック ───────────────────────────────────────────

const EMPTY_TREE: PetrochemTreeResponse = { nodes: [], edges: [] };

// ─── メインページ ─────────────────────────────────────────────

export const PetrochemTree: FC = () => {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  // シナリオ・日数
  const [scenario, setScenario] = useState<ScenarioId>(DEFAULT_SCENARIO);
  const [day, setDay] = useState(0);

  // 折りたたみ
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // フォーカスパス（葉ノードクリックで上流/下流ハイライト）
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // 詳細パネル
  const [detail, setDetail] = useState<{ node: PetrochemNode; risk: PetrochemRiskNode | undefined } | null>(null);

  // 検索
  const [search, setSearch] = useState("");

  // ツールチップ
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // ズーム/パン
  const [vb, setVb] = useState<ViewBox | null>(null);
  const vbRef = useRef<ViewBox | null>(null);
  vbRef.current = vb;
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{
    cx: number; cy: number;
    vbX: number; vbY: number; vbW: number; vbH: number;
  } | null>(null);
  const didInitVb = useRef(false);

  // DOM refs
  const svgRef = useRef<SVGSVGElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // データ取得
  const { data: treeData } = useApiData<PetrochemTreeResponse>("/api/petrochemtree", EMPTY_TREE);
  const nodes = treeData?.nodes ?? [];
  const edges = treeData?.edges ?? [];

  // 折りたたみ初期化（depth >= 5 を折りたたむ）
  useEffect(() => {
    if (nodes.length === 0) return;
    const initCollapsed = new Set<string>();
    for (const n of nodes) {
      if (n.depth >= 5) initCollapsed.add(n.id);
    }
    setCollapsed(initCollapsed);
  }, [nodes.length]);

  // リスク・レイアウト計算
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

  // viewBox 初期化（データロード後 1 回のみ）
  useEffect(() => {
    if (layout.length > 0 && !didInitVb.current) {
      setVb(computeInitViewBox(layout));
      didInitVb.current = true;
    }
  }, [layout]);

  // wheel ズーム（passive: false が必要なため useEffect で登録）
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const current = vbRef.current;
      if (!current) return;
      const rect = el.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY < 0 ? 0.85 : 1.18;
      const newW = Math.min(current.w * 4, Math.max(200, current.w * factor));
      const newH = newW * (current.h / current.w);
      const dw = newW - current.w;
      const dh = newH - current.h;
      const newVb: ViewBox = {
        x: current.x - dw * rx,
        y: current.y - dh * ry,
        w: newW,
        h: newH,
      };
      vbRef.current = newVb;
      setVb(newVb);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // フォーカスパス計算（クリックノードの上流祖先 + 下流子孫）
  const focusedPath = useMemo<Set<string> | null>(() => {
    if (!focusedNodeId) return null;
    const result = new Set<string>();
    // 上流（ルートまで辿る）
    let cur: string | null = focusedNodeId;
    while (cur !== null) {
      result.add(cur);
      const n = nodes.find(nd => nd.id === cur);
      cur = n?.parent_id ?? null;
    }
    // 下流（子孫 BFS）
    const queue: string[] = [focusedNodeId];
    while (queue.length > 0) {
      const id = queue.shift();
      if (id === undefined) break;
      result.add(id);
      for (const childId of (childrenMap.get(id) ?? [])) {
        queue.push(childId);
      }
    }
    return result;
  }, [focusedNodeId, nodes, childrenMap]);

  // 検索マッチ
  const searchMatches = useMemo<Set<string> | null>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return new Set(nodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id));
  }, [search, nodes]);

  // ツールチップ対象ノード
  const tooltipNode = useMemo(() => {
    if (!hoveredNodeId) return null;
    return nodes.find(n => n.id === hoveredNodeId) ?? null;
  }, [hoveredNodeId, nodes]);

  // 可視判定
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

  // dim 状態（検索またはフォーカス中に非対象ノードを薄くする）
  const hasSearch = searchMatches !== null;
  const hasFocus = focusedPath !== null;

  function isNodeDimmed(nodeId: string): boolean {
    if (hasSearch) return !(searchMatches?.has(nodeId) ?? false);
    if (hasFocus) return !(focusedPath?.has(nodeId) ?? false);
    return false;
  }

  function isEdgeDimmed(sourceId: string, targetId: string): boolean {
    if (hasSearch) {
      return !(searchMatches?.has(sourceId) ?? false) && !(searchMatches?.has(targetId) ?? false);
    }
    if (hasFocus) {
      return !(focusedPath?.has(sourceId) ?? false) || !(focusedPath?.has(targetId) ?? false);
    }
    return false;
  }

  // ズームコントロール
  const zoomIn = useCallback(() => {
    setVb(prev => {
      if (!prev) return prev;
      const f = 0.8;
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const nw = prev.w * f;
      const nh = prev.h * f;
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setVb(prev => {
      if (!prev) return prev;
      const f = 1.25;
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const nw = prev.w * f;
      const nh = prev.h * f;
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
    });
  }, []);

  const zoomReset = useCallback(() => {
    setVb(computeInitViewBox(layout));
  }, [layout]);

  // ドラッグパン
  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-node]")) return;
    const current = vbRef.current;
    if (!current) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = {
      cx: e.clientX, cy: e.clientY,
      vbX: current.x, vbY: current.y, vbW: current.w, vbH: current.h,
    };
  }, []);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // ドラッグパン処理
    if (isDraggingRef.current && dragStartRef.current && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const cur = vbRef.current;
      if (!cur) return;
      const scaleX = cur.w / rect.width;
      const scaleY = cur.h / rect.height;
      const dx = (e.clientX - dragStartRef.current.cx) * scaleX;
      const dy = (e.clientY - dragStartRef.current.cy) * scaleY;
      const newVb: ViewBox = {
        x: dragStartRef.current.vbX - dx,
        y: dragStartRef.current.vbY - dy,
        w: dragStartRef.current.vbW,
        h: dragStartRef.current.vbH,
      };
      vbRef.current = newVb;
      setVb(newVb);
    }
    // ツールチップ位置更新
    if (hoveredNodeId !== null && svgContainerRef.current) {
      const rect = svgContainerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [hoveredNodeId]);

  const handleSvgMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const categories: PetrochemCategory[] = ["feedstock", "refinery", "cracker", "monomer", "polymer", "product", "end_use"];
  const expandAll = () => setCollapsed(new Set());
  const collapseDeep = () => {
    const next = new Set<string>();
    for (const n of nodes) {
      if (n.depth >= 5) next.add(n.id);
    }
    setCollapsed(next);
  };

  const viewBoxStr = vb ? `${vb.x} ${vb.y} ${vb.w} ${vb.h}` : "0 0 800 400";
  const phaseInfo = getPhase(day, NAPHTHA_DEPLETION_DAYS[scenario]);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold font-mono">
            <span className="text-warning-soft">PETROCHEM</span> CHAIN
          </h1>
          <ScenarioSelector selected={scenario} onChange={setScenario} />
        </div>
        <p className="text-text-muted text-sm">
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
          <span className="font-mono text-xs text-text-muted tracking-wider">
            制約日数をスライドすると連鎖制約の進行が見えます
          </span>
          <span className="font-mono text-sm font-bold" style={{ color: phaseInfo.color }}>
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
          className="w-full accent-warning-soft"
          data-no-swipe
        />
        <div className="flex justify-between text-[9px] font-mono text-[#94a3b8] relative">
          <span>0</span>
          <span className="absolute left-[7%]">7日<br/>減産</span>
          <span className="absolute left-[33%]">30日<br/>現実枯渇</span>
          <span className="absolute left-[67%]">60日<br/>楽観枯渇</span>
          <span>90</span>
        </div>
        <div
          className="rounded-lg p-2.5 border text-xs font-mono"
          style={{
            borderColor: phaseInfo.color + "55",
            backgroundColor: phaseInfo.color + "0d",
          }}
        >
          <span className="font-bold mr-2" style={{ color: phaseInfo.color }}>
            [{phaseInfo.label}]
          </span>
          <span className="text-text-muted">{phaseInfo.description}</span>
        </div>
      </div>

      {/* 凡例 + 操作 + 検索 */}
      <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
        {/* カテゴリ凡例 */}
        <div className="flex flex-wrap gap-3">
          {categories.map((cat) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm border"
                style={{
                  backgroundColor: CATEGORY_COLORS[cat] + "33",
                  borderColor: CATEGORY_COLORS[cat],
                }}
              />
              <span className="text-[10px] font-mono text-text-muted">{CATEGORY_LABELS[cat]}</span>
            </div>
          ))}
        </div>
        {/* 操作ボタン */}
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={expandAll}
            className="text-[10px] font-mono px-2 py-1 rounded border border-border text-text-muted hover:text-text hover:border-neutral-400 transition-colors"
          >
            全展開
          </button>
          <button
            onClick={collapseDeep}
            className="text-[10px] font-mono px-2 py-1 rounded border border-border text-text-muted hover:text-text hover:border-neutral-400 transition-colors"
          >
            深部を折りたたむ
          </button>
          {/* フォーカスクリア */}
          {focusedNodeId && (
            <button
              onClick={() => { setFocusedNodeId(null); setDetail(null); }}
              className="text-[10px] font-mono px-2 py-1 rounded border border-info text-info hover:bg-[#eff6ff] transition-colors"
            >
              ハイライト解除
            </button>
          )}
          {/* ズームコントロール */}
          <div className="flex gap-1 ml-auto">
            <button
              onClick={zoomIn}
              className="text-[11px] font-mono w-7 h-7 rounded border border-border text-text-muted hover:text-text hover:border-neutral-400 transition-colors flex items-center justify-center"
              title="ズームイン"
            >
              ＋
            </button>
            <button
              onClick={zoomOut}
              className="text-[11px] font-mono w-7 h-7 rounded border border-border text-text-muted hover:text-text hover:border-neutral-400 transition-colors flex items-center justify-center"
              title="ズームアウト"
            >
              −
            </button>
            <button
              onClick={zoomReset}
              className="text-[10px] font-mono px-2 py-1 rounded border border-border text-text-muted hover:text-text hover:border-neutral-400 transition-colors"
              title="ズームリセット"
            >
              全体表示
            </button>
          </div>
        </div>
        {/* 検索フィルタ */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ノード名で検索… (例: エチレン)"
            className="w-full text-[10px] font-mono px-3 py-1.5 rounded border border-border text-text placeholder-neutral-400 focus:outline-none focus:border-accent bg-panel transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-text-muted text-xs transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        {searchMatches !== null && (
          <div className="text-[9px] font-mono text-text-muted">
            {searchMatches.size > 0
              ? `${searchMatches.size} ノードがマッチ — amber 色でハイライト表示`
              : "マッチするノードなし"}
          </div>
        )}
        <div className="text-[9px] font-mono text-[#94a3b8]">
          ▼/▶ で折りたたみ · 葉ノードクリックで上流/下流ハイライト · wheel でズーム · ドラッグでパン
        </div>
      </div>

      {/* SVGツリー */}
      <div
        ref={svgContainerRef}
        className="relative overflow-hidden rounded-lg border border-border bg-panel"
        style={{ height: 420 }}
      >
        {nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[#94a3b8] text-sm font-mono">データ読み込み中...</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={viewBoxStr}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              cursor: isDragging ? "grabbing" : "grab",
              userSelect: "none",
            }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
          >
            {/* エッジ（ノードより先に描画） */}
            {visibleEdges.map((edge) => {
              const src = layoutMap.get(edge.source_id);
              const tgt = layoutMap.get(edge.target_id);
              if (!src || !tgt) return null;
              const srcRisk = riskMap.get(edge.source_id)?.riskLevel ?? 0;
              const tgtRisk = riskMap.get(edge.target_id)?.riskLevel ?? 0;
              const isFPath = (focusedPath?.has(edge.source_id) && focusedPath?.has(edge.target_id)) ?? false;
              return (
                <EdgePath
                  key={edge.id}
                  src={src}
                  tgt={tgt}
                  riskLevel={Math.max(srcRisk, tgtRisk)}
                  isFocusPath={isFPath}
                  highlighted={highlightId === edge.target_id || highlightId === edge.source_id}
                  isDimmed={isEdgeDimmed(edge.source_id, edge.target_id)}
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
                isFocusPath={focusedPath?.has(node.id) ?? false}
                isSearchMatch={searchMatches?.has(node.id) ?? false}
                isDimmed={isNodeDimmed(node.id)}
                isCollapsed={collapsed.has(node.id)}
                hasChildren={childrenMap.has(node.id)}
                onToggle={() => toggleCollapse(node.id)}
                onFocus={() => {
                  const newId = focusedNodeId === node.id ? null : node.id;
                  setFocusedNodeId(newId);
                  setDetail(newId ? { node, risk: riskMap.get(node.id) } : null);
                }}
                onMouseEnter={(e) => {
                  if (isDraggingRef.current) return;
                  setHoveredNodeId(node.id);
                  const container = svgContainerRef.current;
                  if (container) {
                    const rect = container.getBoundingClientRect();
                    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => {
                  setHoveredNodeId(null);
                  setTooltipPos(null);
                }}
              />
            ))}
          </svg>
        )}
        {/* ホバーツールチップ（drag中は非表示） */}
        {!isDragging && tooltipNode !== null && tooltipPos !== null && (
          <Tooltip
            data={{
              node: tooltipNode,
              risk: riskMap.get(tooltipNode.id),
              x: tooltipPos.x,
              y: tooltipPos.y,
            }}
            containerW={svgContainerRef.current?.clientWidth ?? 600}
            containerH={svgContainerRef.current?.clientHeight ?? 420}
          />
        )}
      </div>

      {/* 消費者影響サマリー */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-text-muted tracking-wider">
          ↓ あなたの生活への影響（{day === 0 ? "平常時" : `発生後${day}日`}）
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONSUMER_IMPACTS.map((impact) => {
            const maxRisk = Math.max(
              ...impact.nodeIds.map((id) => riskMap.get(id)?.riskLevel ?? 0),
            );
            const isAffected = maxRisk > 0.1;
            const isCritical = maxRisk > 0.7;
            const borderColor = isCritical ? "#dc2626" : isAffected ? "#d97706" : "var(--color-border)";
            const bgColor = isCritical ? "rgba(220,38,38,0.08)" : isAffected ? "rgba(217,119,6,0.08)" : "transparent";
            const titleColor = isCritical ? "#dc2626" : isAffected ? "#d97706" : "var(--color-text-muted)";
            return (
              <div
                key={impact.label}
                className="rounded-lg p-3 border space-y-1 transition-all"
                style={{ borderColor, backgroundColor: bgColor }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{impact.icon}</span>
                  <span className="font-mono text-sm font-bold" style={{ color: titleColor }}>
                    {impact.label}
                  </span>
                  {isCritical && (
                    <span className="text-[9px] font-mono bg-primary text-white px-1 rounded ml-auto">危機</span>
                  )}
                  {isAffected && !isCritical && (
                    <span className="text-[9px] font-mono bg-warning text-white px-1 rounded ml-auto">影響</span>
                  )}
                </div>
                <p className="text-[10px] text-text-muted leading-relaxed">{impact.detail}</p>
                {isAffected && (
                  <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${maxRisk * 100}%`,
                        backgroundColor: isCritical ? "#dc2626" : "#d97706",
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
        <div className="bg-panel border border-border rounded-lg p-4 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-mono font-bold text-sm" style={{ color: CATEGORY_COLORS[detail.node.category] }}>
                {detail.node.label}
              </h3>
              <span
                className="text-[9px] font-mono px-1.5 py-0.5 rounded-full text-white"
                style={{ backgroundColor: CATEGORY_COLORS[detail.node.category] }}
              >
                {CATEGORY_LABELS[detail.node.category]}
              </span>
            </div>
            <button
              onClick={() => { setDetail(null); setFocusedNodeId(null); }}
              className="text-neutral-400 hover:text-text-muted text-xs font-mono transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
          <p className="text-text-muted text-xs leading-relaxed">{detail.node.description}</p>
          {detail.risk && detail.risk.riskLevel > 0 && (
            <div className="space-y-2 pt-1 border-t border-border">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${detail.risk.riskLevel * 100}%`,
                      backgroundColor: lerpColor("#d97706", COLLAPSE_COLOR, Math.max(0, (detail.risk.riskLevel - 0.4) / 0.6)),
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono font-bold text-text-muted shrink-0">
                  リスク {Math.round(detail.risk.riskLevel * 100)}%
                </span>
              </div>
              <div className="flex gap-4 text-[10px] font-mono flex-wrap">
                <span className="text-text-muted">
                  影響顕在化: <span className="text-warning font-bold">Day {detail.risk.impactDay}</span>〜
                </span>
                <span className="text-text-muted">{detail.risk.riskReason}</span>
              </div>
            </div>
          )}
          {detail.node.naptha_factor !== null && (
            <p className="text-[10px] font-mono text-[#94a3b8]">
              ナフサ依存度: {Math.round((detail.node.naptha_factor ?? 0) * 100)}%
            </p>
          )}
        </div>
      )}

      {/* 出典 */}
      <div className="text-[10px] text-[#94a3b8] font-mono space-y-0.5">
        <p>出典: 資源エネルギー庁 石油統計 / JPCA石油化学工業協会 / 化学日報 / 農水省</p>
        <Link to="/methodology" className="underline hover:text-text-muted transition-colors">計算モデルの前提条件 →</Link>
      </div>
    </div>
  );
};
