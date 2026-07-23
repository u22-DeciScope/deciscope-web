import { describe, expect, it } from "vitest";

import type {
  LiveAnalysisPayload,
  MeetingAIAnalysis,
  TreeSnapshotPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import { normalizeAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import {
  analysisTreeNodeCount,
  analysisTreeVersion,
  initialMeetingAnalysisState,
  meetingAnalysisReducer,
  selectedAnalysisTree,
} from "./meetingAnalysisState";

function live(version = 11, nodeCount = 27): MeetingAIAnalysis {
  const payload: LiveAnalysisPayload = {
    items: [
      { id: "risk-1", kind: "risk", severity: "high", title: "リスク", body: "", status: "open" },
    ],
    tree: {
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        id: index === 0 ? "root" : `node-${index}`,
        kind: index === 0 ? "topic" : "issue",
        label: `node ${index}`,
      })),
      edges: [],
    },
    treeVersion: version,
  };
  return { analysisType: "live", status: "completed", version, payload };
}

function final(status: "running" | "completed", payload: MeetingAIAnalysis["payload"] = null) {
  return { analysisType: "final" as const, status, version: 1, payload };
}

function withLive() {
  return meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
    type: "analysis_event",
    analysis: live(),
  });
}

describe("meetingAnalysisReducer last-known-good tree", () => {
  it("keeps live v11 and 27 nodes for final running v1", () => {
    const state = meetingAnalysisReducer(withLive(), {
      type: "analysis_event",
      analysis: final("running"),
    });
    expect(state.analysisRuntimeStatus).toMatchObject({
      liveVersion: 11,
      finalVersion: 1,
      finalStatus: "running",
    });
    expect(analysisTreeNodeCount(state)).toBe(27);
  });

  it("keeps the tree for final completed without a tree", () => {
    const state = meetingAnalysisReducer(withLive(), {
      type: "analysis_event",
      analysis: final("completed", {
        decisions: [],
        actionItems: [],
        openIssues: [],
        keyPoints: [],
        nextMeetingTopics: [],
      }),
    });
    expect(analysisTreeNodeCount(state)).toBe(27);
  });

  it("keeps the tree for ended and websocket close", () => {
    const ended = meetingAnalysisReducer(withLive(), { type: "meeting_status", status: "ended" });
    const closed = meetingAnalysisReducer(ended, { type: "websocket_closed" });
    expect(analysisTreeNodeCount(closed)).toBe(27);
    expect(closed.analysisRuntimeStatus).toMatchObject({
      meetingStatus: "ended",
      websocketClosed: true,
    });
  });

  it("clears only when the session changes", () => {
    const same = meetingAnalysisReducer(withLive(), {
      type: "session_changed",
      sessionId: "session-a",
    });
    expect(analysisTreeNodeCount(same)).toBe(27);
    const changed = meetingAnalysisReducer(same, {
      type: "session_changed",
      sessionId: "session-b",
    });
    expect(analysisTreeNodeCount(changed)).toBe(0);
  });

  it("atomically prefers only a valid final tree snapshot", () => {
    const invalid: TreeSnapshotPayload = { tree: { nodes: [], edges: [] }, treeVersion: 12 };
    const unchanged = meetingAnalysisReducer(withLive(), {
      type: "rest_snapshot",
      analyses: { sessionId: "session-a", live: null, final: null, treeSnapshot: invalid },
    });
    expect(analysisTreeNodeCount(unchanged)).toBe(27);

    const valid: TreeSnapshotPayload = {
      treeVersion: 12,
      tree: {
        nodes: [{ id: "root", kind: "topic", label: "最終ツリー" }],
        edges: [],
      },
    };
    const replaced = meetingAnalysisReducer(unchanged, {
      type: "rest_snapshot",
      analyses: { sessionId: "session-a", live: null, final: null, treeSnapshot: valid },
    });
    expect(analysisTreeNodeCount(replaced)).toBe(1);
    expect(replaced.finalTreeSnapshot?.treeVersion).toBe(12);
  });

  it("rejects an empty live payload as an implicit tree clear", () => {
    const state = meetingAnalysisReducer(withLive(), {
      type: "analysis_event",
      analysis: {
        analysisType: "live",
        status: "completed",
        version: 12,
        payload: { items: [], tree: { nodes: [], edges: [] }, treeVersion: 12 },
      },
    });
    expect(analysisTreeNodeCount(state)).toBe(27);
    expect((state.liveAnalysis?.payload as LiveAnalysisPayload).items).toHaveLength(1);
  });
});

function versionedLive(
  analysisVersion: number,
  treeVersion: number,
  nodeIds: string[],
  updatedAtUtc = `2026-07-22T08:00:0${treeVersion}Z`,
): MeetingAIAnalysis {
  return {
    analysisType: "live",
    status: "completed",
    version: analysisVersion,
    updatedAtUtc,
    payload: {
      items: [],
      tree: {
        nodes: nodeIds.map((id, index) => ({
          id,
          kind: index === 0 ? "topic" : "issue",
          label: id,
        })),
        edges: [],
      },
      treeVersion,
      treePayloadState: "snapshot",
      payloadKind: "full_snapshot",
    },
  };
}

describe("meetingAnalysisReducer payload merge and REST/WS ordering", () => {
  it.each([
    [
      "omitted",
      {
        items: [
          { id: "new", kind: "risk", severity: "high", title: "x", body: "", status: "open" },
        ],
      },
    ],
    ["null", { items: [], tree: null }],
    ["empty", { items: [], tree: { nodes: [], edges: [] } }],
  ])("retains the completed tree for a %s tree payload", (_name, rawPayload) => {
    const current = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(5, 5, ["root", "issue-1"]),
    });
    const incoming = normalizeAIAnalysis({
      sessionId: "session-a",
      analysisType: "live",
      status: "completed",
      version: 6,
      payload: rawPayload,
    });
    expect(incoming).not.toBeNull();
    const next = meetingAnalysisReducer(current, {
      type: "analysis_event",
      analysis: incoming as MeetingAIAnalysis,
    });
    expect(analysisTreeVersion(next)).toBe(5);
    expect(analysisTreeNodeCount(next)).toBe(2);
  });

  it("clears the tree only for an explicit completed reset", () => {
    const current = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(5, 5, ["root", "issue-1"]),
    });
    const reset = normalizeAIAnalysis({
      sessionId: "session-a",
      analysisType: "live",
      status: "completed",
      version: 6,
      payload: { items: [], tree: null, treeReset: true, treeVersion: 6 },
    });
    const next = meetingAnalysisReducer(current, {
      type: "analysis_event",
      analysis: reset as MeetingAIAnalysis,
    });
    expect(analysisTreeNodeCount(next)).toBe(0);
    expect((next.liveAnalysis?.payload as LiveAnalysisPayload).treeReset).toBe(true);
  });

  it("uses a newer treeVersion when the analysis version is unchanged", () => {
    const current = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(10, 7, ["root", "issue-1"]),
    });
    const next = meetingAnalysisReducer(current, {
      type: "analysis_event",
      analysis: versionedLive(10, 8, ["root", "issue-1", "issue-2"]),
    });
    expect(analysisTreeVersion(next)).toBe(8);
    expect(analysisTreeNodeCount(next)).toBe(3);
  });

  it("does not rewind a newer WS tree with an older same-version REST response", () => {
    const wsState = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(10, 8, ["root", "issue-1", "issue-2"], "2026-07-22T08:00:08Z"),
    });
    const afterRest = meetingAnalysisReducer(wsState, {
      type: "rest_snapshot",
      analyses: {
        sessionId: "session-a",
        live: versionedLive(10, 7, ["root", "old-issue"], "2026-07-22T08:00:07Z"),
        final: null,
        treeSnapshot: null,
      },
    });
    expect(analysisTreeVersion(afterRest)).toBe(8);
    expect(
      ((afterRest.liveAnalysis?.payload as LiveAnalysisPayload).tree?.nodes ?? []).map(
        (node) => node.id,
      ),
    ).toEqual(["root", "issue-1", "issue-2"]);
  });

  it("does not let an older durable tree snapshot mask a newer WS tree", () => {
    const wsState = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(10, 9, ["root", "issue-1", "issue-2"]),
    });
    const afterRest = meetingAnalysisReducer(wsState, {
      type: "rest_snapshot",
      analyses: {
        sessionId: "session-a",
        live: null,
        final: null,
        treeSnapshot: {
          treeVersion: 8,
          generatedAtUtc: "2026-07-22T08:00:08Z",
          tree: {
            nodes: [{ id: "root", kind: "topic", label: "古いtree" }],
            edges: [],
          },
        },
      },
    });
    expect(selectedAnalysisTree(afterRest)).toMatchObject({ source: "live", treeVersion: 9 });
    expect(analysisTreeNodeCount(afterRest)).toBe(3);
  });

  it("merges running and failed status without replacing the completed tree", () => {
    const completed = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(10, 8, ["root", "issue-1"]),
    });
    const running = meetingAnalysisReducer(completed, {
      type: "analysis_event",
      analysis: { analysisType: "live", status: "running", version: 10, payload: null },
    });
    const failed = meetingAnalysisReducer(running, {
      type: "analysis_event",
      analysis: { analysisType: "live", status: "failed", version: 11, payload: null },
    });
    expect(running.analysisRuntimeStatus.liveStatus).toBe("running");
    expect(failed.analysisRuntimeStatus.liveStatus).toBe("failed");
    expect(analysisTreeVersion(failed)).toBe(8);
    expect(analysisTreeNodeCount(failed)).toBe(2);
  });

  it("keeps live v14 for final running and summary-only final completed", () => {
    const liveState = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(
        14,
        14,
        Array.from({ length: 21 }, (_, i) => (i ? `n-${i}` : "root")),
      ),
    });
    const finalRunning = meetingAnalysisReducer(liveState, {
      type: "analysis_event",
      analysis: final("running"),
    });
    const finalCompleted = meetingAnalysisReducer(finalRunning, {
      type: "analysis_event",
      analysis: final("completed", {
        decisions: [],
        actionItems: [],
        openIssues: [],
        keyPoints: [],
        nextMeetingTopics: [],
      }),
    });

    for (const state of [finalRunning, finalCompleted]) {
      expect(selectedAnalysisTree(state)).toMatchObject({
        source: "live",
        treeVersion: 14,
        selectionReason: "live_only",
      });
      expect(analysisTreeNodeCount(state)).toBe(21);
    }
  });

  it("uses a genuinely newer final tree snapshot across independent analysis version series", () => {
    const liveState = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(15, 15, ["root", "live-node"]),
    });
    const afterFinalSummary = meetingAnalysisReducer(liveState, {
      type: "analysis_event",
      analysis: final("completed", {
        decisions: [],
        actionItems: [],
        openIssues: [],
        keyPoints: [],
        nextMeetingTopics: [],
      }),
    });
    const withFinalTree = meetingAnalysisReducer(afterFinalSummary, {
      type: "rest_snapshot",
      analyses: {
        sessionId: "session-a",
        live: null,
        final: null,
        treeSnapshot: {
          treeVersion: 16,
          generatedAtUtc: "2026-07-23T00:14:12Z",
          tree: {
            nodes: [
              { id: "root", kind: "topic", label: "root" },
              { id: "final-node", kind: "decision", label: "final" },
            ],
            edges: [],
          },
        },
      },
    });
    expect(selectedAnalysisTree(withFinalTree)).toMatchObject({
      source: "final_snapshot",
      treeVersion: 16,
      selectionReason: "newer_final_tree_version",
    });
  });

  it("does not change tree source for recording to ending to ended status transitions", () => {
    let state = meetingAnalysisReducer(initialMeetingAnalysisState("session-a"), {
      type: "analysis_event",
      analysis: versionedLive(15, 15, ["root", "issue-1"]),
    });
    for (const status of ["recording", "ending", "ended"] as const) {
      state = meetingAnalysisReducer(state, { type: "meeting_status", status });
      expect(selectedAnalysisTree(state)).toMatchObject({ source: "live", treeVersion: 15 });
      expect(analysisTreeNodeCount(state)).toBe(2);
    }
  });
});
