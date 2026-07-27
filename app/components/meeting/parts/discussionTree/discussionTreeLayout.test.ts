import { describe, expect, it } from "vitest";

import { normalizeAIAnalysis, type LiveAnalysisPayload } from "~/api/aiAnalysis/aiAnalysisApi";
import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

import { stageTentativeTree } from "./DiscussionTree";
import {
  calculateDiscussionTreeBounds,
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutDiscussionTree,
  normalizeEdges,
  orderDiscussionTreeNodesParentFirst,
  uniqueDiscussionTreeNodes,
} from "./discussionTreeLayout";
import {
  rawSession1fdcLiveAnalysis,
  session1fdcSnapshots,
} from "./__fixtures__/session1fdcTreeSnapshots";
import {
  session28f3GroupChildren,
  session28f3ReparentedNodeIds,
  session28f3Snapshots,
} from "./__fixtures__/session28f3TreeSnapshots";

const boundaryCounts = [19, 20, 21, 22, 23, 24, 25, 30, 40];

describe("discussion tree node-count boundaries", () => {
  it.each(boundaryCounts)("keeps all %i nodes finite and reachable for rendering", (count) => {
    const nodes = boundaryNodes(count);
    const edges = parentEdges(nodes);
    const layout = layoutDiscussionTree(nodes, edges);

    expect(layout.inputNodeCount).toBe(count);
    expect(layout.outputNodeCount).toBe(count);
    expect(layout.invalidPositionNodeIds).toEqual([]);
    expect(layout.unreachableNodeIds).toEqual([]);
    expect(layout.bounds).not.toBeNull();
    expect(layout.positions.get("root")).toBeDefined();
    for (const position of layout.positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });
});

describe("session_1fdc26b44086f0b8 actual tree structure", () => {
  it.each([12, 13, 14, 15] as const)(
    "keeps snapshot v%i from normalize through stage and layout",
    (version) => {
      const analysis = normalizeAIAnalysis(rawSession1fdcLiveAnalysis(version));
      const payload = analysis?.payload as LiveAnalysisPayload;
      const staged = stageTentativeTree(payload.tree?.nodes ?? [], payload.tree?.edges ?? [], []);
      const layout = layoutDiscussionTree(staged.nodes, staged.edges);

      expect(payload.tree?.nodes).toHaveLength(version === 12 ? 19 : 21);
      expect(staged.nodes).toHaveLength(version === 12 ? 19 : 21);
      expect(layout.outputNodeCount).toBe(version === 12 ? 19 : 21);
      expect(layout.positions.has("root")).toBe(true);
      expect(layout.invalidPositionNodeIds).toEqual([]);
      expect(layout.cycleDetected).toBe(false);
    },
  );

  it("uses the canonical parent when old and new reparent edges coexist", () => {
    const v14 = session1fdcSnapshots[14];
    const target = v14.nodes.find((node) => node.id === "item-issue-discussion-78a7f63f99de");
    expect(target?.parentId).toBe("topic-agenda-7dd3ab9e5ea9");
    const edges = normalizeEdges(v14.nodes, [
      ...v14.edges,
      {
        id: "stale-parent",
        source: "candidate-3ade9c3ca58b",
        target: "item-issue-discussion-78a7f63f99de",
      },
    ]);
    expect(edges.filter((edge) => edge.target === target?.id)).toEqual([
      expect.objectContaining({ source: "topic-agenda-7dd3ab9e5ea9" }),
    ]);
  });
});

describe("session_28f3f2e6706a28a4 exact v12→v13→v14 group boundary", () => {
  it.each([12, 13, 14] as const)("preserves every node and finite position at v%i", (version) => {
    const snapshot = session28f3Snapshots[version];
    const layout = layoutDiscussionTree(snapshot.nodes, snapshot.edges);

    expect(snapshot.nodes).toHaveLength(version === 13 ? 23 : 21);
    expect(snapshot.treeHash).toBe(version === 13 ? "4d20f581d3ad4232" : "110377280ea42539");
    expect(layout).toMatchObject({
      inputNodeCount: snapshot.nodes.length,
      outputNodeCount: snapshot.nodes.length,
      missingParentNodeIds: [],
      unreachableNodeIds: [],
      invalidPositionNodeIds: [],
      cycleDetected: false,
      layoutError: null,
    });
    expect(layout.bounds).not.toBeNull();
  });

  it("records the exact two groups and eight v13 reparent operations", () => {
    const v12 = session28f3Snapshots[12];
    const v13 = session28f3Snapshots[13];
    const v14 = session28f3Snapshots[14];
    const parent = (version: typeof v12, id: string) =>
      version.nodes.find((node) => node.id === id)?.parentId;

    expect(v13.groupIds).toEqual(Object.keys(session28f3GroupChildren));
    expect(session28f3ReparentedNodeIds).toHaveLength(8);
    for (const nodeId of session28f3ReparentedNodeIds) {
      expect(parent(v13, nodeId)).not.toBe(parent(v12, nodeId));
      expect(parent(v14, nodeId)).toBe(parent(v12, nodeId));
      expect(v13.depthByNodeId[nodeId]).toBe(3);
      expect(v12.depthByNodeId[nodeId]).toBe(2);
    }
  });

  it("discards old reparent edges and emits parents before children even for child-first input", () => {
    const snapshot = session28f3Snapshots[13];
    const targetId = session28f3ReparentedNodeIds[0];
    const oldParent = session28f3Snapshots[12].nodes.find((node) => node.id === targetId)?.parentId;
    const canonicalParent = snapshot.nodes.find((node) => node.id === targetId)?.parentId;
    const normalized = normalizeEdges(snapshot.nodes, [
      ...snapshot.edges,
      {
        id: "stale-v12-parent",
        source: oldParent!,
        target: targetId,
      },
    ]);
    const ordered = orderDiscussionTreeNodesParentFirst([...snapshot.nodes].reverse(), normalized);
    const indexById = new Map(ordered.map((node, index) => [node.id, index]));

    expect(normalized.filter((edge) => edge.target === targetId)).toEqual([
      expect.objectContaining({ source: canonicalParent }),
    ]);
    for (const node of ordered) {
      if (node.parentId) {
        expect(indexById.get(node.parentId)).toBeLessThan(indexById.get(node.id)!);
      }
    }
  });

  it("demonstrates why absolute Dagre positions are valid only for the edge-only strategy", () => {
    const parentAbsolute = { x: 900, y: 400 };
    const childAbsolute = { x: 1180, y: 520 };
    const correctChildRelative = {
      x: childAbsolute.x - parentAbsolute.x,
      y: childAbsolute.y - parentAbsolute.y,
    };
    const subflowWithAbsoluteChild = {
      x: parentAbsolute.x + childAbsolute.x,
      y: parentAbsolute.y + childAbsolute.y,
    };
    const subflowWithRelativeChild = {
      x: parentAbsolute.x + correctChildRelative.x,
      y: parentAbsolute.y + correctChildRelative.y,
    };

    expect(subflowWithAbsoluteChild).toEqual({ x: 2080, y: 920 });
    expect(subflowWithRelativeChild).toEqual(childAbsolute);
    // Production uses no React Flow parentId, so Dagre's absolute coordinate
    // remains childAbsolute and cannot receive the parent offset a second time.
    expect(childAbsolute).toEqual({ x: 1180, y: 520 });
  });
});

describe("discussion tree layout failure containment", () => {
  it("uses last-known-good positions when the layout engine throws", () => {
    const nodes = boundaryNodes(21);
    const edges = parentEdges(nodes);
    const good = layoutDiscussionTree(nodes, edges);
    const failed = layoutDiscussionTree(nodes, edges, good.positions, () => {
      throw new Error("dagre failed");
    });

    expect(failed.layoutError).toBe("dagre failed");
    expect(failed.usedFallback).toBe(true);
    expect(failed.outputNodeCount).toBe(21);
    expect(failed.positions).toEqual(good.positions);
  });

  it("falls back to finite positions when the engine emits no coordinates", () => {
    const nodes = boundaryNodes(24);
    const result = layoutDiscussionTree(nodes, parentEdges(nodes), new Map(), () => {});
    expect(result.invalidPositionNodeIds).toHaveLength(24);
    expect(result.outputNodeCount).toBe(24);
    for (const position of result.positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });

  it("reuses only the affected node's last-known-good position when one coordinate is NaN", () => {
    const nodes = boundaryNodes(21);
    const edges = parentEdges(nodes);
    const good = layoutDiscussionTree(nodes, edges);
    const invalidId = "detail-3";
    const result = layoutDiscussionTree(nodes, edges, good.positions, (graph) => {
      for (const [id, position] of good.positions) {
        graph.setNode(id, {
          ...graph.node(id),
          x: position.x + NODE_WIDTH / 2,
          y: position.y + NODE_HEIGHT / 2,
        });
      }
      graph.setNode(invalidId, { ...graph.node(invalidId), x: Number.NaN });
    });

    expect(result.invalidPositionNodeIds).toEqual([invalidId]);
    expect(result.positions.get(invalidId)).toEqual(good.positions.get(invalidId));
    expect(result.outputNodeCount).toBe(21);
  });

  it("rejects non-finite bounds instead of passing them to viewport logic", () => {
    expect(
      calculateDiscussionTreeBounds(new Map([["root", { x: Number.POSITIVE_INFINITY, y: 0 }]])),
    ).toBeNull();
  });

  it("deduplicates IDs and reports missing parents/cycles without returning an empty layout", () => {
    const nodes: TreeNodePayload[] = [
      { id: "root", kind: "topic", label: "root" },
      { id: "a", kind: "group", parentId: "b", label: "a" },
      { id: "b", kind: "group", parentId: "a", label: "b" },
      { id: "missing-child", kind: "issue", parentId: "missing", label: "missing" },
      { id: "a", kind: "issue", parentId: "root", label: "duplicate" },
    ];
    const unique = uniqueDiscussionTreeNodes(nodes);
    const result = layoutDiscussionTree(nodes, []);

    expect(unique.duplicateNodeIds).toEqual(["a"]);
    expect(result.duplicateNodeIds).toEqual(["a"]);
    expect(result.missingParentNodeIds).toEqual(["missing-child"]);
    expect(result.cycleDetected).toBe(true);
    expect(result.outputNodeCount).toBe(4);
    expect(result.positions.has("root")).toBe(true);
  });
});

function boundaryNodes(count: number): TreeNodePayload[] {
  const nodes: TreeNodePayload[] = [
    { id: "root", kind: "topic", label: "会議" },
    { id: "topic-1", kind: "topic", parentId: "root", label: "論点" },
    { id: "group-1", kind: "group", parentId: "topic-1", label: "グループ" },
  ];
  for (let index = nodes.length; index < count; index += 1) {
    nodes.push({
      id: `detail-${index}`,
      kind: index % 3 === 0 ? "todo" : index % 3 === 1 ? "issue" : "risk",
      parentId: "group-1",
      label: `詳細 ${index}`,
    });
  }
  return nodes;
}

function parentEdges(nodes: TreeNodePayload[]): TreeEdgePayload[] {
  return nodes.flatMap((node) =>
    node.parentId
      ? [
          {
            id: `edge-${node.parentId}-${node.id}`,
            source: node.parentId,
            target: node.id,
          },
        ]
      : [],
  );
}
