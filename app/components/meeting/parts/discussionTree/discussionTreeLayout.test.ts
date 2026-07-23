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
  uniqueDiscussionTreeNodes,
} from "./discussionTreeLayout";
import {
  rawSession1fdcLiveAnalysis,
  session1fdcSnapshots,
} from "./__fixtures__/session1fdcTreeSnapshots";

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
