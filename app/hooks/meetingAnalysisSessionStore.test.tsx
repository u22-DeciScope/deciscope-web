import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import { analysisTreeNodeCount } from "~/hooks/meetingAnalysisState";
import {
  resetMeetingAnalysisSessionStoresForTest,
  useMeetingAnalysisSessionStore,
} from "~/hooks/meetingAnalysisSessionStore";

function completedTree(sessionId: string, version: number): MeetingAIAnalysis {
  const payload: LiveAnalysisPayload = {
    items: [],
    tree: {
      nodes: [
        { id: "root", kind: "topic", label: sessionId },
        { id: `issue-${version}`, kind: "issue", label: "論点" },
      ],
      edges: [],
    },
    treeVersion: version,
    treePayloadState: "snapshot",
    payloadKind: "full_snapshot",
  };
  return {
    sessionId,
    analysisType: "live",
    status: "completed",
    version,
    payload,
  };
}

function agendaProjection(corrected: boolean): MeetingAIAnalysis {
  const parentId = corrected ? "topic-agenda" : "topic-dynamic";
  return {
    sessionId: "session-a",
    analysisType: "live",
    status: "completed",
    version: 12,
    updatedAtUtc: corrected ? "2026-07-26T04:00:00.001Z" : "2026-07-26T04:00:00.000Z",
    payload: {
      items: [],
      tree: {
        nodes: [
          { id: "root", kind: "topic", label: "会議" },
          {
            id: parentId,
            kind: "topic",
            parentId: "root",
            label: "復旧対応",
            ...(corrected ? { agendaRefs: ["agenda-2"] } : {}),
          },
          { id: "fact-recovery", kind: "fact", parentId, label: "正常化" },
        ],
        edges: [
          { id: `root-${parentId}`, source: "root", target: parentId },
          { id: `${parentId}-fact-recovery`, source: parentId, target: "fact-recovery" },
        ],
      },
      treeVersion: 12,
      treePayloadState: "snapshot",
      payloadKind: "full_snapshot",
      agendaProgress: {
        entries: [
          {
            id: "agenda-2",
            sourceType: "fixed_agenda",
            title: "復旧対応",
            computedStatus: corrected ? "discussed" : "discussing",
            effectiveStatus: corrected ? "discussed" : "discussing",
            focusNodeIds: corrected ? ["topic-agenda"] : [],
            linkState: corrected ? "materialized-topic" : "not-linkable",
          },
        ],
      },
    },
  };
}

describe("meeting analysis session store", () => {
  beforeEach(() => resetMeetingAnalysisSessionStoresForTest());

  it("keeps the last-known-good tree across hook/component unmount and remount", () => {
    const first = renderHook(() => useMeetingAnalysisSessionStore("session-a"));
    act(() => {
      first.result.current.dispatch({
        type: "analysis_event",
        analysis: completedTree("session-a", 4),
      });
    });
    expect(analysisTreeNodeCount(first.result.current.state)).toBe(2);
    first.unmount();

    const remounted = renderHook(() => useMeetingAnalysisSessionStore("session-a"));
    expect(analysisTreeNodeCount(remounted.result.current.state)).toBe(2);
    expect(remounted.result.current.state.analysisRuntimeStatus.liveVersion).toBe(4);
  });

  it("isolates trees by session id", () => {
    const view = renderHook(({ sessionId }) => useMeetingAnalysisSessionStore(sessionId), {
      initialProps: { sessionId: "session-a" },
    });
    act(() => {
      view.result.current.dispatch({
        type: "analysis_event",
        analysis: completedTree("session-a", 4),
      });
    });

    view.rerender({ sessionId: "session-b" });
    expect(view.result.current.state.sessionId).toBe("session-b");
    expect(analysisTreeNodeCount(view.result.current.state)).toBe(0);

    view.rerender({ sessionId: "session-a" });
    expect(view.result.current.state.sessionId).toBe("session-a");
    expect(analysisTreeNodeCount(view.result.current.state)).toBe(2);
  });

  it("keeps a same-version corrected WS projection as LKG across stale REST and remount", () => {
    const oldRest = agendaProjection(false);
    const correctedWs = agendaProjection(true);
    const view = renderHook(() => useMeetingAnalysisSessionStore("session-a"));
    act(() => {
      view.result.current.dispatch({
        type: "rest_snapshot",
        analyses: {
          sessionId: "session-a",
          live: oldRest,
          final: null,
          treeSnapshot: null,
          liveHistory: [],
        },
      });
      view.result.current.dispatch({ type: "analysis_event", analysis: correctedWs });
      view.result.current.dispatch({
        type: "rest_snapshot",
        analyses: {
          sessionId: "session-a",
          live: oldRest,
          final: null,
          treeSnapshot: null,
          liveHistory: [],
        },
      });
    });
    const acceptedState = view.result.current.state;
    expect(analysisTreeNodeCount(acceptedState)).toBe(3);
    const payload = acceptedState.liveAnalysis?.payload as LiveAnalysisPayload;
    expect(payload.tree?.nodes?.find((node) => node.id === "topic-agenda")).toMatchObject({
      agendaRefs: ["agenda-2"],
    });
    expect(payload.agendaProgress?.entries[0]).toMatchObject({
      computedStatus: "discussed",
      effectiveStatus: "discussed",
    });

    act(() => {
      view.result.current.dispatch({ type: "analysis_event", analysis: correctedWs });
    });
    expect(view.result.current.state).toBe(acceptedState);
    view.unmount();

    const remounted = renderHook(() => useMeetingAnalysisSessionStore("session-a"));
    expect(remounted.result.current.state.liveAnalysis?.updatedAtUtc).toBe(
      "2026-07-26T04:00:00.001Z",
    );
    expect(analysisTreeNodeCount(remounted.result.current.state)).toBe(3);
  });
});
