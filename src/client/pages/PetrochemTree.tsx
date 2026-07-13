/**
 * PetrochemTree — 石化サプライチェーン樹形図（React Flow 実装・PX-F Phase 2 移行後）
 *
 * 機能:
 *  - dagre LR auto-layout + pan/zoom/minimap（読み取り専用）
 *  - シナリオ切替 / 日数スライダー / フェーズバッジ
 *  - ナフサ枯渇連動の灰化（depth ベースの影響日数補正）
 *  - 右端ボタンで下流折りたたみ（多親DAG対応の BFS）
 *  - 検索フィルタ + クリックフォーカスパス（祖先+子孫強調）
 *  - CONSUMER_IMPACTS カード（6 persona 入口・複数起点フォーカス）
 *  - 初期 0〜4階層表示 + 階層セレクタ + モバイル対応
 *
 * 旧 SVG 実装は `PetrochemTreeLegacy.tsx` に archive。
 */

import { type FC, useMemo, useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";

import { useApiData } from "../hooks/useApiData";
import { PageHero } from "../components/PageHero";
import { ScenarioSelector } from "../components/ScenarioSelector";
import { useScenarioParam } from "../hooks/useScenarioParam";
import { type ScenarioId } from "../../shared/scenarios";
import type { PetrochemNode, PetrochemEdge, PetrochemTreeResponse, PetrochemCategory } from "../../shared/types";

const CATEGORY_COLOR: Record<PetrochemCategory, string> = {
  feedstock:    "#94a3b8",
  refinery:     "#64748b",
  cracker:      "#f59e0b",
  monomer:      "#a78bfa",
  intermediate: "#c084fc",
  polymer:      "#60a5fa",
  product:      "#34d399",
  end_use:      "#fb923c",
};

/** 崩壊色（グレーアウト先） */
const COLLAPSE_COLOR = "#94a3b8";

/** シナリオ別ナフサ枯渇日数（PetrochemTree.tsx と同値） */
const NAPHTHA_DEPLETION_DAYS: Record<ScenarioId, number> = {
  optimistic:  60,
  realistic:   30,
  pessimistic: 14,
  ceasefire:   45,
  intermittent: 40, // 断続制約（Phase 26）: 緩和窓でナフサ調達が周期的に回復
};

// ─── 色補間 ────────────────────────────────────────────

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

// ─── リスク計算 ────────────────────────────────────────

interface NodeRisk {
  riskLevel: number;
  impactDay: number;
}

function calcRisk(nodes: PetrochemNode[], scenario: ScenarioId, day: number): Map<string, NodeRisk> {
  const depletionDay = NAPHTHA_DEPLETION_DAYS[scenario];
  const result = new Map<string, NodeRisk>();

  for (const node of nodes) {
    const factor = node.naptha_factor;
    if (factor === null || factor === 0) {
      result.set(node.id, { riskLevel: 0, impactDay: 0 });
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

    result.set(node.id, {
      riskLevel: Math.round(riskLevel * 100) / 100,
      impactDay,
    });
  }
  return result;
}

// ─── フェーズ判定 ─────────────────────────────────────

interface PhaseInfo {
  label: string;
  description: string;
  color: string;
}

function getPhase(day: number, depletionDay: number): PhaseInfo {
  if (day === 0) return { label: "平常時", description: "供給制約なし", color: "#16a34a" };
  if (day < 7)  return { label: "初動期", description: "ナフサ在庫を消費中・クラッカー稼働維持", color: "#16a34a" };
  if (day < depletionDay * 0.5) return { label: "減産開始", description: "エチレン・プロピレン生産量低下", color: "#d97706" };
  if (day < depletionDay) return { label: "逼迫", description: "ポリマー製造に制約", color: "#d97706" };
  return { label: "枯渇・停止", description: "石化製品の新規製造停止、既存在庫のみ", color: "#dc2626" };
}

// ─── カスタムノード ───────────────────────────────────

type PetrochemNodeData = PetrochemNode & {
  riskLevel: number;
  impactDay: number;
  /** 下流ノード数（0 なら折りたたみボタン非表示） */
  downstreamCount: number;
  /** 自身が折りたたまれているか（下流を隠しているか） */
  isCollapsed: boolean;
  /** 折りたたみトグルコールバック */
  onToggleCollapse: (id: string) => void;
  /** フォーカス/検索の強調状態 (highlighted=完全表示, dimmed=減光, focused=focusNode本体) */
  focusState: "highlighted" | "dimmed" | "focused";
  /** 検索マッチ */
  searchMatch: boolean;
} & Record<string, unknown>;

const PetrochemRfNode: FC<NodeProps<Node<PetrochemNodeData>>> = ({ data }) => {
  const baseColor = CATEGORY_COLOR[data.category];
  const color = data.riskLevel > 0 ? lerpColor(baseColor, COLLAPSE_COLOR, data.riskLevel) : baseColor;
  const collapsedByRisk = data.riskLevel > 0.7;
  const hasDownstream = data.downstreamCount > 0;

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    data.onToggleCollapse(data.id);
  };

  const focusOpacity = data.focusState === "dimmed" ? 0.25 : 1;
  const focusRingClass = data.focusState === "focused"
    ? "ring-2 ring-offset-1"
    : data.searchMatch
    ? "ring-2"
    : "";
  const ringStyle = data.focusState === "focused"
    ? { ["--tw-ring-color" as string]: "#2563eb" }
    : data.searchMatch
    ? { ["--tw-ring-color" as string]: "#d97706" }
    : {};

  return (
    <div
      className={`relative rounded-md border pr-7 pl-3 py-2 text-xs font-medium shadow-sm bg-panel text-text transition-opacity ${collapsedByRisk ? "line-through opacity-75" : ""} ${focusRingClass}`}
      style={{ borderColor: color, minWidth: 150, opacity: focusOpacity * (collapsedByRisk ? 0.75 : 1), ...ringStyle }}
      title={data.description}
    >
      {/* ハンドルは pointer-events:none で接続イベントを無効化（読み取り専用）し、ボタンクリックを確実に拾う */}
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ background: color, pointerEvents: "none" }} />
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="truncate">{data.label}</span>
      </div>
      {data.riskLevel > 0.1 && (
        <div className="mt-1 text-[10px] text-text-muted">
          risk {Math.round(data.riskLevel * 100)}% / day {data.impactDay}
        </div>
      )}
      {hasDownstream && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleToggle}
          className="nodrag nopan nowheel absolute top-0 right-0 h-full w-7 flex items-center justify-center border-l text-[11px] font-bold hover:bg-bg active:bg-bg transition-colors cursor-pointer"
          style={{ borderColor: color, color, zIndex: 10 }}
          aria-label={data.isCollapsed ? `${data.downstreamCount} 件の下流を展開` : `下流を折りたたむ`}
          title={data.isCollapsed ? `+${data.downstreamCount} を展開` : "下流を折りたたむ"}
        >
          {data.isCollapsed ? `+${data.downstreamCount}` : "◀"}
        </button>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ background: color, pointerEvents: "none" }} />
    </div>
  );
};

const nodeTypes = { petrochem: PetrochemRfNode };

// ─── Layout ────────────────────────────────────────────

const NODE_WIDTH = 170;
const NODE_HEIGHT = 52;

/** 起点ノード ID から上流（親側）全 ID を BFS で収集 */
function collectAncestors(edges: PetrochemEdge[], rootId: string): Set<string> {
  const parentsByChild = new Map<string, string[]>();
  for (const e of edges) {
    const arr = parentsByChild.get(e.target_id) ?? [];
    arr.push(e.source_id);
    parentsByChild.set(e.target_id, arr);
  }
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const p of parentsByChild.get(id) ?? []) {
      if (!visited.has(p)) {
        visited.add(p);
        stack.push(p);
      }
    }
  }
  return visited;
}

/** 起点ノード ID から下流（子側）全 ID を BFS で収集 */
function collectDescendants(edges: PetrochemEdge[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenByParent.get(e.source_id) ?? [];
    arr.push(e.target_id);
    childrenByParent.set(e.source_id, arr);
  }
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const c of childrenByParent.get(id) ?? []) {
      if (!visited.has(c)) {
        visited.add(c);
        stack.push(c);
      }
    }
  }
  return visited;
}

/** collapsedIds 起点に下流 BFS し、隠れるべきノード ID セットを返す
 *
 * 折りたたみ起点は「自身より祖先側に別の collapsed root が無い場合のみ可視」。
 * つまり、上位ノードが折り畳まれている時、下位の折り畳み起点はそのまま隠す。
 * これにより ethylene (d4) が初期折り畳み状態で、ユーザが refinery (d1) を閉じた時、
 * ethylene は親 naphtha_cracker が非表示になるため自身も非表示へフォールスルーし、
 * DAG 全体の連続性が保たれる。
 */
function computeHiddenIds(_nodes: PetrochemNode[], edges: PetrochemEdge[], collapsedIds: Set<string>): Set<string> {
  if (collapsedIds.size === 0) return new Set();
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();
  for (const e of edges) {
    const kids = childrenByParent.get(e.source_id) ?? [];
    kids.push(e.target_id);
    childrenByParent.set(e.source_id, kids);
    const parents = parentsByChild.get(e.target_id) ?? [];
    parents.push(e.source_id);
    parentsByChild.set(e.target_id, parents);
  }

  const hidden = new Set<string>();
  const visit = (id: string) => {
    for (const child of childrenByParent.get(id) ?? []) {
      if (hidden.has(child)) continue;
      hidden.add(child);
      visit(child);
    }
  };
  for (const root of collapsedIds) visit(root);

  // 折りたたみ起点自体: 祖先に別の collapsed root が 1 つでもあれば hidden のまま、
  // なければ可視化。多親 DAG では「すべての親系統が collapsed で遮られている」
  // ことまでは要求しない（どれか 1 系統でも繋がっていれば可視のまま）。
  const hasCollapsedAncestor = (id: string): boolean => {
    const seen = new Set<string>([id]);
    const stack = [...(parentsByChild.get(id) ?? [])];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (collapsedIds.has(cur)) return true;
      for (const p of parentsByChild.get(cur) ?? []) stack.push(p);
    }
    return false;
  };

  for (const root of collapsedIds) {
    if (!hasCollapsedAncestor(root)) hidden.delete(root);
  }
  return hidden;
}

interface FocusContext {
  /** フォーカス起点（単一クリック時）— リング描画用。複数根フォーカス時は null */
  focusId: string | null;
  /** フォーカス集合（起点＋祖先＋子孫の和集合） */
  focusSet: Set<string>;
  searchQuery: string;
}

// ─── 消費者影響カード定義 ─────────────────────────────

interface ConsumerImpact {
  icon: string;
  label: string;
  detail: string;
  nodeIds: string[];
}

const CONSUMER_IMPACTS: ConsumerImpact[] = [
  {
    icon: "🛒",
    label: "食品包装が逼迫",
    detail: "パン個包装・牛乳パック・食品トレーが入手困難。生鮮コーナーが機能不全",
    nodeIds: ["food_film_pe", "milk_carton_pe", "food_wrap_pe", "food_tray_ps", "food_container_pp"],
  },
  {
    icon: "🏥",
    label: "医療消耗品が逼迫",
    detail: "透析チューブ（34万人）・輸液バッグ・注射器・医療用手袋の供給停止",
    nodeIds: ["dialysis_pvc", "iv_bag", "medical_pp", "medical_glove_nbr"],
  },
  {
    icon: "🚰",
    label: "水道管が補修不能に",
    detail: "PVC・PE管の補修材料が逼迫。漏水放置→水圧低下→断水加速",
    nodeIds: ["water_pipe_pvc", "water_pipe_pe"],
  },
  {
    icon: "🚛",
    label: "物流・農業が停止",
    detail: "タイヤ・インナーチューブ不足でトラック運行減少。化学肥料不足で翌年の作付けに影響",
    nodeIds: ["truck_logistics", "agriculture", "tire_butyl"],
  },
  {
    icon: "🚗",
    label: "自動車生産が停止",
    detail: "シール/窓枠・シートクッション・エアバッグ基布・タイヤ全系統の部材供給停止",
    nodeIds: ["car_seal_epdm", "mattress_pu", "textile_pa", "tire", "electronics_housing"],
  },
  {
    icon: "🏠",
    label: "住宅の断熱・冷凍保管が逼迫",
    detail: "硬質PUフォーム（冷蔵庫・住宅断熱・冷凍倉庫）不足でコールドチェーン維持に影響",
    nodeIds: ["insulation_pu"],
  },
];

function layoutWithDagre(
  nodes: PetrochemNode[],
  edges: PetrochemEdge[],
  riskMap: Map<string, NodeRisk>,
  collapsedIds: Set<string>,
  hiddenIds: Set<string>,
  onToggleCollapse: (id: string) => void,
  focus: FocusContext,
): { nodes: Node<PetrochemNodeData>[]; edges: Edge[] } {
  const visibleNodes = nodes.filter((n) => !hiddenIds.has(n.id));
  const visibleIdSet = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleIdSet.has(e.source_id) && visibleIdSet.has(e.target_id));

  // 下流ノード数（全データベースで・表示状態に関係なく）
  const downstreamCount = new Map<string, number>();
  const childrenByParent = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenByParent.get(e.source_id) ?? [];
    arr.push(e.target_id);
    childrenByParent.set(e.source_id, arr);
  }
  const countDownstream = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const kids = childrenByParent.get(id) ?? [];
    return kids.reduce((sum, k) => sum + 1 + countDownstream(k, seen), 0);
  };
  for (const n of nodes) downstreamCount.set(n.id, countDownstream(n.id, new Set()));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 20, ranksep: 70, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of visibleNodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of visibleEdges) g.setEdge(e.source_id, e.target_id);

  dagre.layout(g);

  const normalizedQuery = focus.searchQuery.trim().toLowerCase();
  const hasFocus = focus.focusId !== null;
  const hasSearch = normalizedQuery.length > 0;

  const rfNodes: Node<PetrochemNodeData>[] = visibleNodes.map((n) => {
    const { x, y } = g.node(n.id) ?? { x: 0, y: 0 };
    const risk = riskMap.get(n.id) ?? { riskLevel: 0, impactDay: 0 };
    const searchMatch = hasSearch && (
      n.label.toLowerCase().includes(normalizedQuery) ||
      n.id.toLowerCase().includes(normalizedQuery)
    );
    let focusState: PetrochemNodeData["focusState"];
    if (hasFocus) {
      if (n.id === focus.focusId) focusState = "focused";
      else if (focus.focusSet.has(n.id)) focusState = "highlighted";
      else focusState = "dimmed";
    } else if (hasSearch) {
      focusState = searchMatch ? "highlighted" : "dimmed";
    } else {
      focusState = "highlighted";
    }

    return {
      id: n.id,
      type: "petrochem",
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      data: {
        ...n,
        ...risk,
        downstreamCount: downstreamCount.get(n.id) ?? 0,
        isCollapsed: collapsedIds.has(n.id),
        onToggleCollapse,
        focusState,
        searchMatch,
      },
    };
  });

  const rfEdges: Edge[] = visibleEdges.map((e) => {
    const targetRisk = riskMap.get(e.target_id);
    const riskDim = targetRisk && targetRisk.riskLevel > 0.5;
    const inFocus = hasFocus && focus.focusSet.has(e.source_id) && focus.focusSet.has(e.target_id);
    const outOfFocus = hasFocus && !inFocus;
    const stroke = inFocus ? "#2563eb" : (riskDim ? COLLAPSE_COLOR : "var(--color-border)");
    const opacity = outOfFocus ? 0.15 : (riskDim ? 0.4 : 0.8);
    return {
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      label: e.flow_label ?? undefined,
      style: { stroke, strokeWidth: inFocus ? 2 : 1.2, opacity },
      labelStyle: { fill: "var(--color-text-muted)", fontSize: 10 },
      labelBgStyle: { fill: "var(--color-panel)" },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

const minimapNodeColor = (node: Node<PetrochemNodeData>): string => {
  const base = CATEGORY_COLOR[node.data.category];
  return node.data.riskLevel > 0 ? lerpColor(base, COLLAPSE_COLOR, node.data.riskLevel) : base;
};

/** ノード数変化で自動 fitView する内部コンポーネント */
const FitViewOnChange: FC<{ trigger: number }> = ({ trigger }) => {
  const rf = useReactFlow();
  useEffect(() => {
    const t = window.setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 50);
    return () => window.clearTimeout(t);
  }, [trigger, rf]);
  return null;
};

// ─── ページ ────────────────────────────────────────────

/**
 * 初期表示階層のデフォルト（0〜maxDepth を可視に）
 * 4: 主要基礎製品（ethylene/propylene/butadiene/benzene/toluene 等）までで全体が把握しやすい
 */
const INITIAL_MAX_DEPTH = 4;

/** maxDepth で自動折りたたむべきノード ID（depth === maxDepth かつ子を持つもの）*/
function computeInitialCollapsedIds(nodes: PetrochemNode[], edges: PetrochemEdge[], maxDepth: number): Set<string> {
  const hasChild = new Set(edges.map((e) => e.source_id));
  const result = new Set<string>();
  for (const n of nodes) {
    if (n.depth >= maxDepth && hasChild.has(n.id)) result.add(n.id);
  }
  return result;
}

export const PetrochemTree: FC = () => {
  const [scenario, setScenario] = useScenarioParam();
  const [day, setDay] = useState(0);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [maxDepth, setMaxDepth] = useState<number>(INITIAL_MAX_DEPTH);
  const [initialCollapsed, setInitialCollapsed] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusRoots, setFocusRoots] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { data } = useApiData<PetrochemTreeResponse>("/api/petrochemtree", { nodes: [], edges: [] });

  const depletionDay = NAPHTHA_DEPLETION_DAYS[scenario];
  const phase = getPhase(day, depletionDay);

  // 初回ロード時: depth <= maxDepth の範囲だけ可視にするため、その境界より深いノードへ到達する
  // 入口ノードを一括で折りたたむ
  useEffect(() => {
    if (!data || data.nodes.length === 0 || initialCollapsed) return;
    setCollapsedIds(computeInitialCollapsedIds(data.nodes, data.edges, maxDepth));
    setInitialCollapsed(true);
  }, [data, maxDepth, initialCollapsed]);

  const applyMaxDepth = (nextDepth: number) => {
    setMaxDepth(nextDepth);
    if (data) setCollapsedIds(computeInitialCollapsedIds(data.nodes, data.edges, nextDepth));
  };

  const onToggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const riskMap = useMemo(() => {
    if (!data) return new Map<string, NodeRisk>();
    return calcRisk(data.nodes, scenario, day);
  }, [data, scenario, day]);

  const hiddenIds = useMemo(() => {
    if (!data) return new Set<string>();
    return computeHiddenIds(data.nodes, data.edges, collapsedIds);
  }, [data, collapsedIds]);

  const focusSet = useMemo(() => {
    if (!data) return new Set<string>();
    const roots: string[] = focusId ? [focusId] : focusRoots;
    if (roots.length === 0) return new Set<string>();
    const set = new Set<string>();
    for (const root of roots) {
      set.add(root);
      for (const a of collectAncestors(data.edges, root)) set.add(a);
      for (const d of collectDescendants(data.edges, root)) set.add(d);
    }
    return set;
  }, [data, focusId, focusRoots]);

  const focusCtx: FocusContext = useMemo(() => ({ focusId, focusSet, searchQuery }), [focusId, focusSet, searchQuery]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return layoutWithDagre(data.nodes, data.edges, riskMap, collapsedIds, hiddenIds, onToggleCollapse, focusCtx);
  }, [data, riskMap, collapsedIds, hiddenIds, onToggleCollapse, focusCtx]);

  const onNodeClick = useCallback((_: unknown, node: Node<PetrochemNodeData>) => {
    setFocusRoots([]);
    setFocusId((prev) => (prev === node.data.id ? null : node.data.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setFocusId(null);
    setFocusRoots([]);
  }, []);

  const selectConsumerImpact = (nodeIds: string[]) => {
    setFocusId(null);
    setFocusRoots(nodeIds);
    setSearchQuery("");
  };

  const handleDayChange = (newDay: number) => setDay(Math.max(0, Math.min(60, newDay)));
  const expandAll = () => setCollapsedIds(new Set());
  const clearFocus = () => { setFocusId(null); setFocusRoots([]); setSearchQuery(""); };

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHero
        title="PETROCHEM CHAIN"
        subtitle="原油・天然ガスから石化製品・最終用途までの供給チェーン。シナリオ・日数でナフサ在庫低下の波及を確認"
      />

      <div className="flex flex-wrap items-center gap-3">
        <ScenarioSelector selected={scenario} onChange={setScenario} />
        <div
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: phase.color, color: phase.color }}
        >
          Day {day} — {phase.label}
        </div>
        <span className="text-xs text-text-muted hidden md:inline">{phase.description}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-muted">表示階層:</span>
        {[3, 4, 5, 6, 8].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => applyMaxDepth(d)}
            className={`rounded-md border px-2 py-1 transition-colors ${
              maxDepth === d
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-panel text-text hover:bg-bg"
            }`}
          >
            {d === 8 ? "全階層" : `0〜${d}階層`}
          </button>
        ))}
        {collapsedIds.size > 0 && (
          <button
            type="button"
            onClick={expandAll}
            className="ml-auto rounded-md border border-border bg-panel px-2 py-1 text-text hover:bg-bg transition-colors"
          >
            すべて展開（{collapsedIds.size}件）
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-text-muted w-24">日数（0〜60）</label>
        <input
          type="range"
          min={0}
          max={60}
          value={day}
          onChange={(e) => handleDayChange(parseInt(e.target.value, 10))}
          className="flex-1"
        />
        <span className="text-xs font-mono w-12 text-right">Day {day}</span>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-text-muted w-24">検索</label>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ノード名・IDで絞り込み（例: 透析 / nylon / pvc）"
          className="flex-1 rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-text placeholder:text-text-muted"
        />
        {(focusId || focusRoots.length > 0 || searchQuery) && (
          <button
            type="button"
            onClick={clearFocus}
            className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-text hover:bg-bg transition-colors"
          >
            フォーカス解除
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-panel h-[55vh] md:h-[70vh]">
        {!data && <div className="p-4 text-text-muted">データ読み込み中...</div>}
        {data && (
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.15, includeHiddenNodes: false }}
              minZoom={0.1}
              maxZoom={2.5}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={true}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--color-border)" gap={16} />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={minimapNodeColor}
                maskColor="rgba(0,0,0,0.1)"
                pannable
                zoomable
                position="top-right"
                style={{ width: 140, height: 90 }}
              />
              <FitViewOnChange trigger={nodes.length} />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>

      <div className="text-xs text-text-muted">
        表示: {nodes.length} / {data?.nodes.length ?? 0} ノード（折りたたみで {hiddenIds.size} 件非表示）・エッジ: {edges.length} / {data?.edges.length ?? 0} ・シナリオ {scenario}（枯渇 day {depletionDay}）
        {focusId && (
          <span className="ml-2">・フォーカス: {focusId}（パス {focusSet.size} ノード）</span>
        )}
        {focusRoots.length > 0 && (
          <span className="ml-2">・フォーカス: {focusRoots.length} 起点（パス {focusSet.size} ノード）</span>
        )}
      </div>

      {/* Persona 入口: 消費者影響カード */}
      <div className="mt-2">
        <div className="mb-2 text-xs text-text-muted">
          何から見るか — カードをクリックすると関連ノードとその全上流パスがハイライトされる
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {CONSUMER_IMPACTS.map((impact) => {
            const isActive = focusRoots.length > 0 && impact.nodeIds.every((id) => focusRoots.includes(id)) && focusRoots.length === impact.nodeIds.length;
            return (
              <button
                key={impact.label}
                type="button"
                onClick={() => selectConsumerImpact(impact.nodeIds)}
                className={`text-left rounded-md border p-3 text-xs transition-colors ${isActive ? "border-accent bg-bg" : "border-border bg-panel hover:bg-bg"}`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <span className="text-lg leading-none">{impact.icon}</span>
                  <span className="text-text">{impact.label}</span>
                </div>
                <div className="mt-1 text-[11px] text-text-muted leading-snug">{impact.detail}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
