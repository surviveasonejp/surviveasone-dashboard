/**
 * 石化樹形図APIハンドラ
 *
 * GET /api/petrochemtree       全ノード・エッジ（KVキャッシュ 24h）
 * GET /api/petrochemtree/risk  シナリオ別リスクレベル付きノード
 */

import petrochemData from "./data/petrochem.json";
import { getFromCache, setCache, scenarioCacheKey, CACHE_KEYS, CACHE_TTL } from "./kv-cache";
import type { PetrochemNode, PetrochemEdge, PetrochemRiskNode, PetrochemTreeResponse, PetrochemRiskResponse } from "../shared/types";
import type { ScenarioId } from "../shared/scenarios";

interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
}

// ─── D1クエリ ────────────────────────────────────────────

async function getAllPetrochemNodes(db: D1Database): Promise<PetrochemNode[]> {
  const result = await db.prepare(
    "SELECT id, label, category, depth, parent_id, naptha_factor, description FROM petrochem_nodes ORDER BY depth ASC, id ASC"
  ).all<PetrochemNode>();
  return result.results;
}

async function getAllPetrochemEdges(db: D1Database): Promise<PetrochemEdge[]> {
  const result = await db.prepare(
    "SELECT id, source_id, target_id, flow_label FROM petrochem_edges ORDER BY id ASC"
  ).all<PetrochemEdge>();
  return result.results;
}

// ─── リスク計算 ──────────────────────────────────────────

/** シナリオ別ナフサ枯渇日数 */
const NAPHTHA_DEPLETION_DAYS: Record<ScenarioId, number> = {
  optimistic:  60,
  realistic:   30,
  pessimistic: 14,
  ceasefire:   45, // 停戦前（45日）はrealisticと同等、停戦後は段階的回復
};

function calcPetrochemRisk(
  nodes: PetrochemNode[],
  scenario: ScenarioId,
  day: number,
): PetrochemRiskNode[] {
  const depletionDay = NAPHTHA_DEPLETION_DAYS[scenario];

  return nodes.map((node) => {
    const factor = node.naptha_factor;

    if (factor === null || factor === 0) {
      // ナフサ非依存ノード: リスクゼロ
      return { ...node, riskLevel: 0, impactDay: 0, riskReason: "ナフサ非依存" };
    }

    // 影響顕在化日数: depthに応じた遅延
    let impactMultiplier = 0.5;
    if (node.depth >= 5 && node.depth <= 6) impactMultiplier = 0.7;
    if (node.depth === 7) impactMultiplier = 0.9;
    if (node.depth >= 8) impactMultiplier = 0.95;
    const impactDay = Math.round(depletionDay * impactMultiplier);

    // リスクレベル: 線形補間
    let riskLevel = 0;
    if (day >= impactDay) {
      const progress = Math.min((day - impactDay) / (depletionDay - impactDay + 1), 1);
      riskLevel = factor * progress;
    }

    let riskReason = "影響なし";
    if (riskLevel > 0.7) riskReason = "ナフサ枯渇により生産停止リスク";
    else if (riskLevel > 0.4) riskReason = "ナフサ制約により減産中";
    else if (riskLevel > 0.1) riskReason = "ナフサ在庫逼迫の影響開始";

    return { ...node, riskLevel: Math.round(riskLevel * 100) / 100, impactDay, riskReason };
  });
}

// ─── ハンドラ ────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handlePetrochemTree(env: Env): Promise<Response> {
  // KVキャッシュ確認
  const cached = await getFromCache<PetrochemTreeResponse>(env.CACHE, CACHE_KEYS.PETROCHEM_TREE);
  if (cached) {
    return jsonResponse(cached.data);
  }

  // D1から取得（失敗時は静的JSONフォールバック）
  let nodes: PetrochemNode[];
  let edges: PetrochemEdge[];
  try {
    [nodes, edges] = await Promise.all([
      getAllPetrochemNodes(env.DB),
      getAllPetrochemEdges(env.DB),
    ]);
    // D1が空の場合は静的JSONを使用
    if (nodes.length === 0) {
      nodes = petrochemData.nodes as PetrochemNode[];
      edges = petrochemData.edges as PetrochemEdge[];
    }
  } catch {
    nodes = petrochemData.nodes as PetrochemNode[];
    edges = petrochemData.edges as PetrochemEdge[];
  }

  const data: PetrochemTreeResponse = { nodes, edges };
  await setCache(env.CACHE, CACHE_KEYS.PETROCHEM_TREE, data, CACHE_TTL.PETROCHEM);

  return jsonResponse(data);
}

export async function handlePetrochemRisk(url: URL, env: Env): Promise<Response> {
  const scenarioParam = url.searchParams.get("scenario") ?? "realistic";
  const dayParam = parseInt(url.searchParams.get("day") ?? "0", 10);

  const validScenarios: ScenarioId[] = ["optimistic", "realistic", "pessimistic"];
  if (!validScenarios.includes(scenarioParam as ScenarioId)) {
    return jsonResponse({ error: "Invalid scenario" }, 400);
  }
  if (isNaN(dayParam) || dayParam < 0 || dayParam > 365) {
    return jsonResponse({ error: "day must be 0-365" }, 400);
  }

  const scenario = scenarioParam as ScenarioId;
  const day = dayParam;

  const cacheKey = scenarioCacheKey("api:petrochemtree:risk", scenario, String(day));
  const cached = await getFromCache<PetrochemRiskResponse>(env.CACHE, cacheKey);
  if (cached) {
    return jsonResponse(cached.data);
  }

  // ノード取得（キャッシュorD1orフォールバック）
  let nodes: PetrochemNode[];
  try {
    const result = await getAllPetrochemNodes(env.DB);
    nodes = result.length > 0 ? result : (petrochemData.nodes as PetrochemNode[]);
  } catch {
    nodes = petrochemData.nodes as PetrochemNode[];
  }

  const riskNodes = calcPetrochemRisk(nodes, scenario, day);
  const data: PetrochemRiskResponse = { nodes: riskNodes, scenario, day };
  await setCache(env.CACHE, cacheKey, data, CACHE_TTL.PETROCHEM);

  return jsonResponse(data);
}
