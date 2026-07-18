import { describe, expect, it } from "vitest";

import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import {
  analysisTreeNodeCount,
  initialMeetingAnalysisState,
  meetingAnalysisReducer,
  treeApplyDecision,
  type MeetingAnalysisState,
} from "./meetingAnalysisState";

// session_497ed2b0aedf9dc6 の version 11→12 を模したfixture。
// v12で希少植物の2ノード(item-todo-15d69fb0e46d / question-auto-990f08d9c259)が
// dynamic topicへ昇格した瞬間、既存ツリーが画面から消えた問題の回帰テスト。

const v11Nodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "環境アセスメント検討会" },
  { id: "agenda-1", kind: "topic", parentId: "root", label: "渡り鳥の調査計画" },
  { id: "agenda-2", kind: "topic", parentId: "root", label: "騒音測定の実施方法" },
  { id: "agenda-3", kind: "topic", parentId: "root", label: "住民説明資料の作成" },
  { id: "topic-night", kind: "topic", parentId: "root", label: "夜間音響の追加調査" },
  { id: "topic-unclassified", kind: "topic", parentId: "root", label: "追加論点" },
  { id: "group-obs", kind: "group", parentId: "agenda-1", label: "観測地点" },
  { id: "item-q-obs", kind: "question", parentId: "group-obs", label: "観測点の妥当性" },
  { id: "item-todo-obs", kind: "todo", parentId: "group-obs", label: "観測地点の追加設置" },
  { id: "item-issue-noise", kind: "issue", parentId: "agenda-2", label: "夜間低周波音への懸念" },
  { id: "item-todo-doc", kind: "todo", parentId: "agenda-3", label: "公開方針を検討" },
  {
    id: "item-todo-15d69fb0e46d",
    kind: "todo",
    parentId: "topic-unclassified",
    label: "植物種の予備調査の検討",
  },
  {
    id: "question-auto-990f08d9c259",
    kind: "question",
    parentId: "topic-unclassified",
    label: "予備調査を実施するか",
  },
];

const edgesFromParents = (nodes: TreeNodePayload[]): TreeEdgePayload[] =>
  nodes
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `${node.parentId}->${node.id}`,
      source: node.parentId as string,
      target: node.id,
    }));

const v11Edges = edgesFromParents(v11Nodes);

const v12Nodes: TreeNodePayload[] = [
  ...v11Nodes
    .filter((node) => node.id !== "topic-unclassified")
    .map((node) =>
      node.id === "item-todo-15d69fb0e46d" || node.id === "question-auto-990f08d9c259"
        ? { ...node, parentId: "candidate-2e0a7402415d" }
        : node,
    ),
  {
    id: "candidate-2e0a7402415d",
    kind: "topic",
    parentId: "root",
    label: "気象データ確認に伴う測定条件",
  },
];

const v12Edges = edgesFromParents(v12Nodes);

function livePayload(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
  treeVersion: number,
  overrides: Partial<LiveAnalysisPayload> = {},
): LiveAnalysisPayload {
  return {
    items: [],
    tree: { nodes, edges },
    treeVersion,
    payloadKind: "full_snapshot",
    nodeCount: nodes.length,
    edgeCount: edges.length,
    ...overrides,
  };
}

const v11Completed: MeetingAIAnalysis = {
  analysisType: "live",
  status: "completed",
  version: 11,
  payload: livePayload(v11Nodes, v11Edges, 11),
};

const v12Completed: MeetingAIAnalysis = {
  analysisType: "live",
  status: "completed",
  version: 12,
  payload: livePayload(v12Nodes, v12Edges, 12, {
    removedNodeIds: ["topic-unclassified"],
    treeChanges: {
      treeVersion: 12,
      newNodeIds: ["candidate-2e0a7402415d"],
      reparentedNodeIds: ["item-todo-15d69fb0e46d", "question-auto-990f08d9c259"],
    },
    basedOnTreeVersion: 11,
  }),
};

function stateWith(...events: MeetingAIAnalysis[]): MeetingAnalysisState {
  let state = initialMeetingAnalysisState("session_497ed2b0aedf9dc6");
  for (const analysis of events) {
    state = meetingAnalysisReducer(state, { type: "analysis_event", analysis });
  }
  return state;
}

function liveTreeNodeIds(state: MeetingAnalysisState): string[] {
  const payload = state.liveAnalysis?.payload as LiveAnalysisPayload | null;
  return (payload?.tree?.nodes ?? []).map((node) => node.id);
}

describe("meetingAnalysisReducer v11→v12 (session_497ed2b0aedf9dc6 regression)", () => {
  it("keeps every v11 node in v12 and adds only the promoted topic", () => {
    const state = stateWith(v11Completed, v12Completed);
    const ids = new Set(liveTreeNodeIds(state));
    for (const node of v11Nodes) {
      if (node.id === "topic-unclassified") {
        continue; // removedNodeIds で明示的に説明された正当な削除。
      }
      expect(ids.has(node.id), `v11 node ${node.id} must remain in v12`).toBe(true);
    }
    expect(ids.has("candidate-2e0a7402415d")).toBe(true);
    expect(analysisTreeNodeCount(state)).toBe(v12Nodes.length);
    const payload = state.liveAnalysis?.payload as LiveAnalysisPayload;
    expect(payload.tree?.edges?.length).toBe(v12Edges.length);
  });

  it("does not clear the tree on a running event with the previous payload", () => {
    const running: MeetingAIAnalysis = {
      analysisType: "live",
      status: "running",
      version: 11,
      payload: livePayload(v11Nodes, v11Edges, 11),
    };
    const state = stateWith(v11Completed, running);
    expect(analysisTreeNodeCount(state)).toBe(v11Nodes.length);
    expect(state.analysisRuntimeStatus.liveStatus).toBe("running");
  });

  it("does not clear the tree on a running event without payload", () => {
    const running: MeetingAIAnalysis = {
      analysisType: "live",
      status: "running",
      version: 11,
      payload: null,
    };
    const state = stateWith(v11Completed, running);
    expect(analysisTreeNodeCount(state)).toBe(v11Nodes.length);
  });

  it("does not clear the tree on a failed event", () => {
    const failed: MeetingAIAnalysis = {
      analysisType: "live",
      status: "failed",
      version: 12,
      payload: null,
    };
    const state = stateWith(v11Completed, v12Completed, failed);
    expect(analysisTreeNodeCount(state)).toBe(v12Nodes.length);
  });

  it("ignores a late v11 event after v12 was applied", () => {
    const state = stateWith(v11Completed, v12Completed, v11Completed);
    expect(state.analysisRuntimeStatus.liveVersion).toBe(12);
    expect(new Set(liveTreeNodeIds(state)).has("candidate-2e0a7402415d")).toBe(true);
    expect(treeApplyDecision(stateWith(v11Completed, v12Completed).liveAnalysis, v11Completed)).toBe(
      "ignored_stale",
    );
  });

  it("applies a duplicate v12 completed idempotently", () => {
    const state = stateWith(v11Completed, v12Completed, v12Completed);
    expect(analysisTreeNodeCount(state)).toBe(v12Nodes.length);
    expect(state.analysisRuntimeStatus.liveVersion).toBe(12);
  });

  it("preserves the last-known-good tree when nodes vanish without removedNodeIds", () => {
    const collapsed: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 13,
      payload: livePayload(
        v12Nodes.filter((node) => node.id === "root" || node.id === "candidate-2e0a7402415d"),
        [{ id: "root->candidate-2e0a7402415d", source: "root", target: "candidate-2e0a7402415d" }],
        13,
        { removedNodeIds: undefined, nodeCount: 2, edgeCount: 1 },
      ),
    };
    const before = stateWith(v11Completed, v12Completed);
    expect(treeApplyDecision(before.liveAnalysis, collapsed)).toBe("preserved_invalid");
    const state = meetingAnalysisReducer(before, { type: "analysis_event", analysis: collapsed });
    expect(analysisTreeNodeCount(state)).toBe(v12Nodes.length);
  });

  it("accepts a large removal when removedNodeIds explains it", () => {
    const removedIds = ["group-obs", "item-q-obs", "item-todo-obs", "item-issue-noise"];
    const pruned: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 13,
      payload: livePayload(
        v12Nodes.filter((node) => !removedIds.includes(node.id)),
        edgesFromParents(v12Nodes.filter((node) => !removedIds.includes(node.id))),
        13,
        { removedNodeIds: removedIds },
      ),
    };
    const before = stateWith(v11Completed, v12Completed);
    expect(treeApplyDecision(before.liveAnalysis, pruned)).toBe("applied");
    const state = meetingAnalysisReducer(before, { type: "analysis_event", analysis: pruned });
    expect(analysisTreeNodeCount(state)).toBe(v12Nodes.length - removedIds.length);
  });

  it("restores the v12 snapshot after reconnect via rest_snapshot", () => {
    const fresh = initialMeetingAnalysisState("session_497ed2b0aedf9dc6");
    const state = meetingAnalysisReducer(fresh, {
      type: "rest_snapshot",
      analyses: {
        sessionId: "session_497ed2b0aedf9dc6",
        live: v12Completed,
        final: null,
        treeSnapshot: null,
      },
    });
    expect(analysisTreeNodeCount(state)).toBe(v12Nodes.length);
    expect(state.analysisRuntimeStatus.liveVersion).toBe(12);
  });
});
