import { describe, expect, it } from "vitest";

import type {
  LiveAnalysisPayload,
  MeetingAIAnalysis,
  TreeSnapshotPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import {
  analysisTreeNodeCount,
  initialMeetingAnalysisState,
  meetingAnalysisReducer,
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
