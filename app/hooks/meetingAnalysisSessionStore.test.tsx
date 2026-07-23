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
});
