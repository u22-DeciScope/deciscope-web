import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

// バックエンドが正規化した parentId(各ノード唯一の親)からツリー構造を構築する。
// parentId を持たない旧payloadに対してのみ、後方互換としてエッジBFSで親を推定する。
// フロント独自の判断で親を付け替えることはしない(不正データへの防御のみ行う)。
export type DiscussionTreeModel = {
  rootId: string | null;
  parentOf: Map<string, string | null>;
  childrenOf: Map<string, string[]>;
  depthOf: Map<string, number>;
  descendantKindCounts: Map<string, Record<string, number>>;
  descendantTotal: Map<string, number>;
};

export function buildDiscussionTreeModel(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
): DiscussionTreeModel {
  const rootId =
    nodes.find((node) => node.id === "root")?.id ??
    nodes.find((node) => !node.parentId && (node.kind ?? "topic") === "topic")?.id ??
    nodes.find((node) => (node.kind ?? "topic") === "topic")?.id ??
    nodes[0]?.id ??
    null;

  const hasParentIds = nodes.some((node) => typeof node.parentId === "string" && node.parentId);
  const { parentOf, depthOf } = hasParentIds
    ? parentsFromParentIds(nodes, rootId)
    : parentsFromEdgesBfs(nodes, edges, rootId);

  const childrenOf = new Map<string, string[]>();
  for (const node of nodes) {
    childrenOf.set(node.id, []);
  }
  for (const node of nodes) {
    const parent = parentOf.get(node.id);
    if (parent === null || parent === undefined) {
      continue;
    }
    const siblings = childrenOf.get(parent);
    if (siblings) {
      siblings.push(node.id);
    } else {
      childrenOf.set(parent, [node.id]);
    }
  }

  const kindOf = new Map<string, string>();
  for (const node of nodes) {
    kindOf.set(node.id, node.kind ?? "topic");
  }

  const descendantKindCounts = new Map<string, Record<string, number>>();
  const descendantTotal = new Map<string, number>();
  const postOrderVisited = new Set<string>();

  // childrenOf は parentOf(各ノード1親)から構築しているため木構造だが、念のため
  // visited でサイクル(無限再帰)を防ぐ。
  function computeDescendants(id: string): Record<string, number> {
    if (postOrderVisited.has(id)) {
      return descendantKindCounts.get(id) ?? {};
    }
    postOrderVisited.add(id);

    const counts: Record<string, number> = {};
    let total = 0;
    const children = childrenOf.get(id) ?? [];
    for (const childId of children) {
      const childKind = kindOf.get(childId) ?? "topic";
      counts[childKind] = (counts[childKind] ?? 0) + 1;
      total += 1;

      const childDescendantCounts = computeDescendants(childId);
      for (const [kind, count] of Object.entries(childDescendantCounts)) {
        counts[kind] = (counts[kind] ?? 0) + count;
      }
      total += descendantTotal.get(childId) ?? 0;
    }

    descendantKindCounts.set(id, counts);
    descendantTotal.set(id, total);
    return counts;
  }

  for (const node of nodes) {
    if (!postOrderVisited.has(node.id)) {
      computeDescendants(node.id);
    }
  }

  return { rootId, parentOf, childrenOf, depthOf, descendantKindCounts, descendantTotal };
}

// parentsFromParentIds はバックエンド正規化済みの parentId をそのまま使う。
// 防御: 存在しない親・自己参照・循環を検出した場合のみ root の子へ退避し、
// 無限ループや表示不能を防ぐ(親の付け替え判断はしない)。
function parentsFromParentIds(nodes: TreeNodePayload[], rootId: string | null) {
  const parentOf = new Map<string, string | null>();
  const depthOf = new Map<string, number>();
  const nodeIds = new Set(nodes.map((node) => node.id));

  const rawParent = new Map<string, string | null>();
  for (const node of nodes) {
    if (node.id === rootId) {
      rawParent.set(node.id, null);
      continue;
    }
    const parent = node.parentId;
    if (parent && parent !== node.id && nodeIds.has(parent)) {
      rawParent.set(node.id, parent);
    } else {
      rawParent.set(node.id, rootId);
    }
  }

  // 深さを親チェーンから計算。循環を踏んだノードは root 直下へ退避する。
  for (const node of nodes) {
    const seen = new Set<string>();
    const chain: string[] = [];
    let current: string | null = node.id;
    let cyclic = false;
    while (current !== null && current !== rootId) {
      if (seen.has(current)) {
        cyclic = true;
        break;
      }
      seen.add(current);
      chain.push(current);
      current = rawParent.get(current) ?? null;
    }
    if (cyclic) {
      rawParent.set(node.id, rootId);
      parentOf.set(node.id, rootId);
      depthOf.set(node.id, rootId !== null ? 1 : 0);
      continue;
    }
    // chain は node.id から root 直前までの経路。深さ = 経路長。
    for (let i = 0; i < chain.length; i++) {
      const id = chain[i];
      if (id === undefined || depthOf.has(id)) {
        continue;
      }
      depthOf.set(id, chain.length - i);
      parentOf.set(id, rawParent.get(id) ?? null);
    }
  }
  if (rootId !== null) {
    parentOf.set(rootId, null);
    depthOf.set(rootId, 0);
  }
  return { parentOf, depthOf };
}

// parentsFromEdgesBfs は parentId を持たない旧payload向けの後方互換。
// root からのBFSで最初に到達した親を採用する(従来挙動)。
function parentsFromEdgesBfs(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
  rootId: string | null,
) {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    } else {
      adjacency.set(edge.source, [edge.target]);
    }
  }

  const parentOf = new Map<string, string | null>();
  const depthOf = new Map<string, number>();
  const visited = new Set<string>();

  if (rootId !== null) {
    parentOf.set(rootId, null);
    depthOf.set(rootId, 0);
    visited.add(rootId);

    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      const currentDepth = depthOf.get(current) ?? 0;
      const targets = adjacency.get(current) ?? [];
      for (const target of targets) {
        if (visited.has(target)) {
          continue;
        }
        visited.add(target);
        parentOf.set(target, current);
        depthOf.set(target, currentDepth + 1);
        queue.push(target);
      }
    }
  }

  // BFSで未到達のノードは孤立防止のため root の子として扱う(root が無ければ独立ルート扱い)。
  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }
    visited.add(node.id);
    if (rootId !== null) {
      parentOf.set(node.id, rootId);
      depthOf.set(node.id, 1);
    } else {
      parentOf.set(node.id, null);
      depthOf.set(node.id, 0);
    }
  }
  return { parentOf, depthOf };
}

// 「root以外で子を持つ全ノード」の id 集合。初期表示(全折りたたみ)と
// 「全折りたたみ」ボタンの両方から使う。
export function collapsibleNodeIds(model: DiscussionTreeModel): Set<string> {
  const ids = new Set<string>();
  for (const [id, children] of model.childrenOf.entries()) {
    if (id !== model.rootId && children.length > 0) {
      ids.add(id);
    }
  }
  return ids;
}

// あるノードが可視かどうか(祖先のいずれかが collapsed に含まれていれば非可視)。
export function isNodeVisible(
  model: DiscussionTreeModel,
  collapsed: ReadonlySet<string>,
  nodeId: string,
): boolean {
  let ancestor = model.parentOf.get(nodeId) ?? null;
  while (ancestor !== null) {
    if (collapsed.has(ancestor)) {
      return false;
    }
    ancestor = model.parentOf.get(ancestor) ?? null;
  }
  return true;
}
