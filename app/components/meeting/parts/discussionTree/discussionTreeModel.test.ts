import { describe, expect, it } from "vitest";

import { buildDiscussionTreeModel } from "./discussionTreeModel";
import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

const edge = (source: string, target: string): TreeEdgePayload => ({
  id: `edge-${source}-${target}`,
  source,
  target,
});

describe("buildDiscussionTreeModel", () => {
  it("parentId があればエッジから親を推論せず parentId を使う", () => {
    const nodes: TreeNodePayload[] = [
      { id: "root", kind: "topic", label: "会議" },
      { id: "agenda-1", kind: "topic", parentId: "root", label: "文字起こし精度" },
      { id: "agenda-2", kind: "topic", parentId: "root", label: "AI分析の制御" },
      { id: "risk-1", kind: "risk", parentId: "agenda-2", label: "重複リスク" },
    ];
    // 古い和集合エッジ(risk-1 が agenda-1 にもつながっている)が混ざっていても、
    // parentId 側が優先される。
    const edges = [
      edge("root", "agenda-1"),
      edge("root", "agenda-2"),
      edge("agenda-1", "risk-1"),
      edge("agenda-2", "risk-1"),
    ];

    const model = buildDiscussionTreeModel(nodes, edges);
    expect(model.rootId).toBe("root");
    expect(model.parentOf.get("risk-1")).toBe("agenda-2");
    expect(model.depthOf.get("risk-1")).toBe(2);
    expect(model.childrenOf.get("agenda-1")).toEqual([]);
  });

  it("parentId の循環・自己参照・欠損は root の子へ退避して無限ループしない", () => {
    const nodes: TreeNodePayload[] = [
      { id: "root", kind: "topic", label: "会議" },
      { id: "a", kind: "issue", parentId: "b", label: "A" },
      { id: "b", kind: "issue", parentId: "a", label: "B" },
      { id: "c", kind: "issue", parentId: "c", label: "C" },
      { id: "d", kind: "issue", parentId: "missing", label: "D" },
    ];

    const model = buildDiscussionTreeModel(nodes, []);
    expect(model.rootId).toBe("root");
    for (const id of ["c", "d"]) {
      expect(model.parentOf.get(id)).toBe("root");
    }
    // 循環(a<->b)はどちらかが root へ退避され、全ノードが到達可能になる。
    for (const id of ["a", "b", "c", "d"]) {
      expect(model.parentOf.has(id)).toBe(true);
      expect(model.depthOf.has(id)).toBe(true);
    }
  });

  it("parentId が無い旧payloadはBFSフォールバックで従来どおり構築する", () => {
    const nodes: TreeNodePayload[] = [
      { id: "topic-main", kind: "topic", label: "全体" },
      { id: "issue-1", kind: "issue", label: "論点1" },
      { id: "orphan", kind: "question", label: "孤立" },
    ];
    const edges = [edge("topic-main", "issue-1")];

    const model = buildDiscussionTreeModel(nodes, edges);
    expect(model.rootId).toBe("topic-main");
    expect(model.parentOf.get("issue-1")).toBe("topic-main");
    // BFS未到達ノードは root の子として救済される(従来挙動の防御)。
    expect(model.parentOf.get("orphan")).toBe("topic-main");
  });
});
