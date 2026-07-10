import dagre from "@dagrejs/dagre";

import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 90;

// edges が空のフィクスチャでは、topic 以外のノードを直前の topic にぶら下げて
// 旧インデント表示と同じ親子関係を再現する。
export function normalizeEdges(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
): TreeEdgePayload[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  if (validEdges.length === 0) {
    return legacyTopicChainEdges(nodes);
  }

  // バックエンドの修復(connectOrphanLiveAnalysisTreeNodes)が効かなかった場合のフロント側の
  // 保険。有効な edge が一部でもあれば all-or-nothing で捨てずに残しつつ、incoming edge を
  // 持たない孤立ノード(非topicノード・主topic以外のtopicノード)だけを主topicノードへ
  // 繋ぎ直し、ツリーから外れて描画されなくなることを防ぐ。
  return [...validEdges, ...orphanRescueEdges(nodes, validEdges)];
}

function legacyTopicChainEdges(nodes: TreeNodePayload[]): TreeEdgePayload[] {
  const fallback: TreeEdgePayload[] = [];
  let lastTopicId: string | null = null;
  for (const node of nodes) {
    if ((node.kind ?? "topic") === "topic") {
      lastTopicId = node.id;
    } else if (lastTopicId) {
      fallback.push({
        id: `${lastTopicId}->${node.id}`,
        source: lastTopicId,
        target: node.id,
      });
    }
  }
  return fallback;
}

function orphanRescueEdges(
  nodes: TreeNodePayload[],
  validEdges: TreeEdgePayload[],
): TreeEdgePayload[] {
  if (nodes.length === 0) {
    return [];
  }
  const mainTopicId =
    nodes.find((node) => (node.kind ?? "topic") === "topic")?.id ?? nodes[0].id;

  const hasIncoming = new Set(validEdges.map((edge) => edge.target));
  const seenEdgeKeys = new Set(validEdges.map((edge) => `${edge.source}->${edge.target}`));

  const fallback: TreeEdgePayload[] = [];
  for (const node of nodes) {
    if (node.id === mainTopicId || hasIncoming.has(node.id)) {
      continue;
    }
    const key = `${mainTopicId}->${node.id}`;
    if (seenEdgeKeys.has(key)) {
      continue;
    }
    seenEdgeKeys.add(key);
    fallback.push({ id: key, source: mainTopicId, target: node.id });
  }
  return fallback;
}

export function layoutPositions(nodes: TreeNodePayload[], edges: TreeEdgePayload[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 72 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const laidOut = graph.node(node.id);
    positions.set(node.id, {
      x: laidOut.x - NODE_WIDTH / 2,
      y: laidOut.y - NODE_HEIGHT / 2,
    });
  }
  return positions;
}
