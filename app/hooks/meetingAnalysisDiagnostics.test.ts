import { beforeEach, describe, expect, it } from "vitest";

import type {
  LiveAnalysisPayload,
  MeetingAIAnalyses,
  MeetingAIAnalysis,
} from "~/api/aiAnalysis/aiAnalysisApi";
import { recordAnalysisStoreTransition } from "~/hooks/meetingAnalysisDiagnostics";
import {
  getMeetingAnalysisSessionStore,
  resetMeetingAnalysisSessionStoresForTest,
} from "~/hooks/meetingAnalysisSessionStore";
import {
  analysisTreeNodeCount,
  initialMeetingAnalysisState,
  meetingAnalysisReducer,
  type MeetingAnalysisState,
} from "~/hooks/meetingAnalysisState";
import {
  configureClientDiagnosticsForTest,
  recentDiagnosticEvents,
  resetClientDiagnosticsForTest,
} from "~/utils/clientDiagnostics/clientDiagnostics";
import type { DiagnosticEventName } from "~/utils/clientDiagnostics/diagnosticsTypes";
import { clearIntentionalTreeTeardown } from "~/utils/clientDiagnostics/treeEmptiness";

const SESSION_ID = "session_abc";
const WORKSPACE_ID = "w_test";

function liveAnalysis(
  version: number,
  nodeCount: number,
  overrides: Partial<LiveAnalysisPayload> = {},
): MeetingAIAnalysis {
  const payload: LiveAnalysisPayload = {
    items: [],
    tree: {
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        id: index === 0 ? "root" : `node-${index}`,
        kind: index === 0 ? "topic" : "issue",
        label: `論点 ${index}`,
        ...(index === 0 ? {} : { parentId: "root" }),
      })),
      edges: [],
    },
    treeVersion: version,
    treePayloadState: "snapshot",
    payloadKind: "full_snapshot",
    ...overrides,
  };
  return {
    sessionId: SESSION_ID,
    analysisType: "live",
    status: "completed",
    version,
    updatedAtUtc: new Date(Date.UTC(2026, 6, 25, 10, version)).toISOString(),
    payload,
  };
}

function restAnalyses(live: MeetingAIAnalysis | null): MeetingAIAnalyses {
  return { sessionId: SESSION_ID, live, final: null, treeSnapshot: null, liveHistory: [] };
}

function stateWithNodes(version: number, nodeCount: number): MeetingAnalysisState {
  return meetingAnalysisReducer(initialMeetingAnalysisState(SESSION_ID), {
    type: "analysis_event",
    analysis: liveAnalysis(version, nodeCount),
  });
}

function eventNames(): DiagnosticEventName[] {
  return recentDiagnosticEvents(500).map((event) => event.event);
}

function lastEvent(name: DiagnosticEventName) {
  return recentDiagnosticEvents(500)
    .filter((event) => event.event === name)
    .at(-1);
}

beforeEach(() => {
  resetClientDiagnosticsForTest();
  resetMeetingAnalysisSessionStoresForTest();
  clearIntentionalTreeTeardown();
});

describe("tree_became_empty detection", () => {
  it("is not recorded for a normal tree update", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(1, 5) });
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(2, 7) });

    expect(analysisTreeNodeCount(store.getSnapshot())).toBe(7);
    expect(eventNames()).not.toContain("tree_became_empty");
    expect(eventNames()).toContain("tree_state_changed");
  });

  it("is recorded when a 5 node tree becomes empty without an explanation", () => {
    const before = stateWithNodes(3, 5);
    const after = initialMeetingAnalysisState(SESSION_ID);

    recordAnalysisStoreTransition({
      sessionId: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      action: { type: "analysis_event", analysis: liveAnalysis(4, 0) },
      before,
      after,
    });

    const anomaly = lastEvent("tree_became_empty");
    expect(anomaly).toBeDefined();
    expect(anomaly?.nodeCount).toBe(0);
    expect(anomaly?.sessionId).toBe(SESSION_ID);
    expect(anomaly?.workspaceId).toBe(WORKSPACE_ID);
    const details = anomaly?.details as Record<string, unknown>;
    expect(details.previousNodeCount).toBe(5);
    expect(details.previousTreeVersion).toBe(3);
    expect(details.previousRootNodeId).toBe("root");
    expect(details.previousSnapshotSource).toBe("live");
    expect(details.cause).toBe("analysis_event");
    expect(details.lastSnapshot).toMatchObject({ transport: "websocket" });
  });

  it("attaches the preceding diagnostic events to the anomaly", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(1, 5) });

    recordAnalysisStoreTransition({
      sessionId: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      action: { type: "rest_snapshot", analyses: restAnalyses(liveAnalysis(2, 0)) },
      before: stateWithNodes(1, 5),
      after: initialMeetingAnalysisState(SESSION_ID),
    });

    const details = lastEvent("tree_became_empty")?.details as Record<string, unknown>;
    const recent = details.recentEvents as Array<Record<string, unknown>>;
    expect(Array.isArray(recent)).toBe(true);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(100);
    // 縮小形であること(ツリー本体やラベルを含まない)。
    expect(Object.keys(recent[0]).sort()).toEqual(["av", "e", "n", "s", "seq", "st", "t", "tv"]);
  });

  it("is not recorded for an explicit reset", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(1, 5) });
    store.dispatch({ type: "explicit_reset" });

    expect(analysisTreeNodeCount(store.getSnapshot())).toBe(0);
    expect(eventNames()).not.toContain("tree_became_empty");
    expect(eventNames()).toContain("store_reset_requested");
    expect(eventNames()).toContain("store_reset_executed");
    expect(
      (lastEvent("store_reset_executed")?.details as Record<string, unknown>).previousNodeCount,
    ).toBe(5);
  });

  it("is not recorded when moving to another session", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(1, 5) });
    store.dispatch({ type: "session_changed", sessionId: "session_other" });

    expect(eventNames()).not.toContain("tree_became_empty");
    expect((lastEvent("store_reset_requested")?.details as Record<string, unknown>).cause).toBe(
      "session_changed",
    );
  });
});

describe("snapshot adoption logging", () => {
  it("records why a stale REST snapshot was rejected", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(5, 6) });
    resetClientDiagnosticsForTest();

    store.dispatch({ type: "rest_snapshot", analyses: restAnalyses(liveAnalysis(3, 2)) });

    const rejected = lastEvent("snapshot_rejected");
    expect(rejected).toBeDefined();
    const details = rejected?.details as Record<string, unknown>;
    expect(details.transport).toBe("rest");
    expect(details.reason).toBe("ignored_stale");
    expect(details.currentAnalysisVersion).toBe(5);
    expect(details.incomingAnalysisVersion).toBe(3);
    expect(details.currentTreeVersion).toBe(5);
    expect(details.incomingTreeVersion).toBe(3);
    expect(details.currentNodeCount).toBe(6);
    expect(details.incomingNodeCount).toBe(2);
    expect(details.payloadPresent).toBe(true);
    expect(details.updateKind).toBe("full_snapshot");
    expect(details.currentUpdatedAt).toBeTruthy();
    expect(details.incomingUpdatedAt).toBeTruthy();
    // 古いsnapshotは採用されず、ツリーは維持される。
    expect(analysisTreeNodeCount(store.getSnapshot())).toBe(6);
  });

  it("records why a newer WebSocket snapshot was adopted", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(5, 6) });
    resetClientDiagnosticsForTest();

    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(6, 9) });

    const adopted = lastEvent("snapshot_adopted");
    expect(adopted).toBeDefined();
    const details = adopted?.details as Record<string, unknown>;
    expect(details.transport).toBe("websocket");
    expect(details.reason).toBe("applied");
    expect(details.currentAnalysisVersion).toBe(5);
    expect(details.incomingAnalysisVersion).toBe(6);
    expect(details.currentTreeVersion).toBe(5);
    expect(details.incomingTreeVersion).toBe(6);
    expect(details.updateKind).toBe("full_snapshot");
    expect(details.resultingNodeCount).toBe(9);
    expect(analysisTreeNodeCount(store.getSnapshot())).toBe(9);
  });

  it("marks a status-only update as a rejected snapshot with its reason", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(5, 6) });
    resetClientDiagnosticsForTest();

    store.dispatch({
      type: "analysis_event",
      analysis: {
        sessionId: SESSION_ID,
        analysisType: "live",
        status: "running",
        version: 6,
        payload: null,
      },
    });

    const details = lastEvent("snapshot_rejected")?.details as Record<string, unknown>;
    expect(details.updateKind).toBe("status_only");
    expect(details.payloadPresent).toBe(false);
    expect(details.reason).toBe("no_tree");
    expect(analysisTreeNodeCount(store.getSnapshot())).toBe(6);
  });

  it("does not put meeting content into diagnostic details", () => {
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    store.dispatch({ type: "analysis_event", analysis: liveAnalysis(1, 5) });

    const serialized = JSON.stringify(recentDiagnosticEvents(500));
    expect(serialized).not.toContain("論点");
    expect(serialized).not.toContain("label");
  });
});

describe("diagnostics failure isolation", () => {
  it("keeps updating the discussion tree when the diagnostics API fails", async () => {
    configureClientDiagnosticsForTest({
      networkEnabled: true,
      transport: {
        send: async () => {
          throw new Error("diagnostics API unavailable");
        },
        sendSync: () => {
          throw new Error("diagnostics API unavailable");
        },
      },
    });
    const store = getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);

    expect(() => {
      store.dispatch({ type: "analysis_event", analysis: liveAnalysis(1, 5) });
      store.dispatch({ type: "analysis_event", analysis: liveAnalysis(2, 8) });
    }).not.toThrow();

    expect(analysisTreeNodeCount(store.getSnapshot())).toBe(8);
    expect(store.getSnapshot().analysisRuntimeStatus.liveVersion).toBe(2);
  });

  it("records the store lifecycle so a re-created store is visible in the log", () => {
    getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    expect(eventNames()).toContain("tree_store_initialized");

    resetMeetingAnalysisSessionStoresForTest();
    getMeetingAnalysisSessionStore(SESSION_ID, WORKSPACE_ID);
    const initializations = recentDiagnosticEvents(500).filter(
      (event) => event.event === "tree_store_initialized",
    );
    expect(initializations).toHaveLength(2);
  });
});
