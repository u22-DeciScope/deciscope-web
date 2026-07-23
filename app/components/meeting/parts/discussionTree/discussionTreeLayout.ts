import dagre from "@dagrejs/dagre";

import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

import { buildDiscussionTreeModel } from "./discussionTreeModel";

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 90;

export type DiscussionTreePosition = { x: number; y: number };

export type DiscussionTreeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiscussionTreeLayoutResult = {
  positions: Map<string, DiscussionTreePosition>;
  inputNodeCount: number;
  outputNodeCount: number;
  invalidPositionNodeIds: string[];
  duplicateNodeIds: string[];
  missingParentNodeIds: string[];
  unreachableNodeIds: string[];
  cycleDetected: boolean;
  layoutError: string | null;
  usedFallback: boolean;
  bounds: DiscussionTreeBounds | null;
};

type DagreGraph = Parameters<typeof dagre.layout>[0];
type DagreLayoutEngine = (graph: DagreGraph) => unknown;

export function uniqueDiscussionTreeNodes(nodes: TreeNodePayload[]): {
  nodes: TreeNodePayload[];
  duplicateNodeIds: string[];
} {
  const seen = new Set<string>();
  const duplicateNodeIds = new Set<string>();
  const unique: TreeNodePayload[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) {
      duplicateNodeIds.add(node.id);
      continue;
    }
    seen.add(node.id);
    unique.push(node);
  }
  return { nodes: unique, duplicateNodeIds: [...duplicateNodeIds] };
}

// parentIdがある新payloadではparentIdを正本にしてedgeを再構成する。これにより
// reparent更新時に旧edgeと新edgeが同時に届いても、Dagreへ複数親を渡さない。
// parentIdが無い旧payloadではrootからのBFSで最初の親だけを採用する。
export function normalizeEdges(
  inputNodes: TreeNodePayload[],
  inputEdges: TreeEdgePayload[],
): TreeEdgePayload[] {
  const { nodes } = uniqueDiscussionTreeNodes(inputNodes);
  if (nodes.length === 0) {
    return [];
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const hasParentIds = nodes.some((node) => Boolean(node.parentId));
  if (hasParentIds) {
    const model = buildDiscussionTreeModel(nodes, []);
    return nodes.flatMap((node) => {
      const parent = model.parentOf.get(node.id);
      return parent ? [{ id: `edge-${parent}-${node.id}`, source: parent, target: node.id }] : [];
    });
  }

  const rootId =
    nodes.find((node) => node.id === "root")?.id ??
    nodes.find((node) => (node.kind ?? "topic") === "topic")?.id ??
    nodes[0]?.id;
  if (!rootId) {
    return [];
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of inputEdges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      continue;
    }
    const targets = adjacency.get(edge.source) ?? [];
    if (!targets.includes(edge.target)) {
      targets.push(edge.target);
      adjacency.set(edge.source, targets);
    }
  }

  const parents = new Map<string, string>();
  const visited = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const source = queue.shift();
    if (!source) {
      continue;
    }
    for (const target of adjacency.get(source) ?? []) {
      if (visited.has(target)) {
        continue;
      }
      visited.add(target);
      parents.set(target, source);
      queue.push(target);
    }
  }
  for (const node of nodes) {
    if (node.id !== rootId && !parents.has(node.id)) {
      parents.set(node.id, rootId);
    }
  }
  return nodes.flatMap((node) => {
    const parent = parents.get(node.id);
    return parent ? [{ id: `edge-${parent}-${node.id}`, source: parent, target: node.id }] : [];
  });
}

export function layoutDiscussionTree(
  inputNodes: TreeNodePayload[],
  inputEdges: TreeEdgePayload[],
  previousPositions: ReadonlyMap<string, DiscussionTreePosition> = new Map(),
  layoutEngine: DagreLayoutEngine = dagre.layout,
): DiscussionTreeLayoutResult {
  const { nodes, duplicateNodeIds } = uniqueDiscussionTreeNodes(inputNodes);
  const diagnostics = analyzeInputStructure(nodes, inputEdges);
  const edges = normalizeEdges(nodes, inputEdges);
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 72 });
  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  let layoutError: string | null = null;
  try {
    layoutEngine(graph);
  } catch (cause) {
    layoutError = cause instanceof Error ? cause.message : String(cause);
  }

  const model = buildDiscussionTreeModel(nodes, edges);
  const positions = new Map<string, DiscussionTreePosition>();
  const invalidPositionNodeIds: string[] = [];
  const siblingOffsets = new Map<number, number>();
  for (const [index, node] of nodes.entries()) {
    const laidOut = layoutError ? undefined : graph.node(node.id);
    const candidate = laidOut
      ? { x: laidOut.x - NODE_WIDTH / 2, y: laidOut.y - NODE_HEIGHT / 2 }
      : undefined;
    if (candidate && isFinitePosition(candidate)) {
      positions.set(node.id, candidate);
      continue;
    }
    invalidPositionNodeIds.push(node.id);
    const previous = previousPositions.get(node.id);
    if (previous && isFinitePosition(previous)) {
      positions.set(node.id, previous);
      continue;
    }
    const depth = model.depthOf.get(node.id) ?? 0;
    const siblingIndex = siblingOffsets.get(depth) ?? 0;
    siblingOffsets.set(depth, siblingIndex + 1);
    positions.set(node.id, {
      x: depth * (NODE_WIDTH + 72),
      y: siblingIndex * (NODE_HEIGHT + 24),
    });
  }

  return {
    positions,
    inputNodeCount: inputNodes.length,
    outputNodeCount: positions.size,
    invalidPositionNodeIds,
    duplicateNodeIds,
    missingParentNodeIds: diagnostics.missingParentNodeIds,
    unreachableNodeIds: diagnostics.unreachableNodeIds,
    cycleDetected: diagnostics.cycleDetected,
    layoutError,
    usedFallback: layoutError !== null || invalidPositionNodeIds.length > 0,
    bounds: calculateDiscussionTreeBounds(positions),
  };
}

// 後方互換の公開API。新規コードはdiagnosticsを返すlayoutDiscussionTreeを使う。
export function layoutPositions(nodes: TreeNodePayload[], edges: TreeEdgePayload[]) {
  return layoutDiscussionTree(nodes, edges).positions;
}

export function calculateDiscussionTreeBounds(
  positions: ReadonlyMap<string, DiscussionTreePosition>,
): DiscussionTreeBounds | null {
  if (positions.size === 0) {
    return null;
  }
  const values = [...positions.values()].filter(isFinitePosition);
  if (values.length !== positions.size) {
    return null;
  }
  const left = Math.min(...values.map((position) => position.x));
  const top = Math.min(...values.map((position) => position.y));
  const right = Math.max(...values.map((position) => position.x + NODE_WIDTH));
  const bottom = Math.max(...values.map((position) => position.y + NODE_HEIGHT));
  const bounds = { x: left, y: top, width: right - left, height: bottom - top };
  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}

function analyzeInputStructure(nodes: TreeNodePayload[], edges: TreeEdgePayload[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const missingParentNodeIds = nodes
    .filter((node) => node.parentId && !nodeIds.has(node.parentId))
    .map((node) => node.id);
  const parentById = new Map<string, string>();
  const hasParentIds = nodes.some((node) => Boolean(node.parentId));
  if (hasParentIds) {
    for (const node of nodes) {
      if (node.parentId && nodeIds.has(node.parentId)) {
        parentById.set(node.id, node.parentId);
      }
    }
  } else {
    for (const edge of edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target) && !parentById.has(edge.target)) {
        parentById.set(edge.target, edge.source);
      }
    }
  }

  let cycleDetected = false;
  for (const node of nodes) {
    const seen = new Set<string>();
    let current: string | undefined = node.id;
    while (current) {
      if (seen.has(current)) {
        cycleDetected = true;
        break;
      }
      seen.add(current);
      current = parentById.get(current);
    }
  }

  const rootId =
    nodes.find((node) => node.id === "root")?.id ??
    nodes.find((node) => !parentById.has(node.id))?.id ??
    nodes[0]?.id;
  const reachable = new Set<string>();
  if (rootId) {
    const queue = [rootId];
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source || reachable.has(source)) {
        continue;
      }
      reachable.add(source);
      for (const [target, parent] of parentById) {
        if (parent === source && !reachable.has(target)) {
          queue.push(target);
        }
      }
    }
  }
  return {
    missingParentNodeIds,
    unreachableNodeIds: nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id),
    cycleDetected,
  };
}

function isFinitePosition(position: DiscussionTreePosition) {
  return Number.isFinite(position.x) && Number.isFinite(position.y);
}
