import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LiveAnalysisPayload,
  MeetingAIAnalyses,
  MeetingAIAnalysis,
} from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import { resetMeetingAnalysisSessionStoresForTest } from "~/hooks/meetingAnalysisSessionStore";
import { useMeetingTranscriptSession } from "~/hooks/useMeetingTranscriptSession";

const api = vi.hoisted(() => ({
  getAnalyses: vi.fn(),
  getSession: vi.fn(),
  getHistory: vi.fn(),
}));

vi.mock("~/api/aiAnalysis/aiAnalysisApi", async () => ({
  ...(await vi.importActual<typeof import("~/api/aiAnalysis/aiAnalysisApi")>(
    "~/api/aiAnalysis/aiAnalysisApi",
  )),
  getWorkspaceMeetingSessionAIAnalyses: api.getAnalyses,
}));

vi.mock("~/api/meetingSessions/meetingSessionsApi", async () => ({
  ...(await vi.importActual<typeof import("~/api/meetingSessions/meetingSessionsApi")>(
    "~/api/meetingSessions/meetingSessionsApi",
  )),
  getWorkspaceMeetingSession: api.getSession,
}));

vi.mock("~/api/transcripts/transcriptSegmentsApi", async () => ({
  ...(await vi.importActual<typeof import("~/api/transcripts/transcriptSegmentsApi")>(
    "~/api/transcripts/transcriptSegmentsApi",
  )),
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory: api.getHistory,
}));

vi.mock("~/utils/realtimeRecovery", async () => ({
  ...(await vi.importActual<typeof import("~/utils/realtimeRecovery")>("~/utils/realtimeRecovery")),
  realtimeRecoveryDecision: () => ({ action: "retry", delayMs: 0, probe: false }),
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  private listeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(code = 1000, reason = "") {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason, wasClean: code === 1000 });
  }

  emit(type: string, event: Record<string, unknown> = {}) {
    if (type === "open") {
      this.readyState = FakeWebSocket.OPEN;
    }
    if (type === "close") {
      this.readyState = FakeWebSocket.CLOSED;
    }
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

function liveAnalysis(version: number, treeVersion: number, nodeIds: string[]): MeetingAIAnalysis {
  const payload: LiveAnalysisPayload = {
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
  };
  return {
    sessionId: "session-a",
    analysisType: "live",
    status: "completed",
    version,
    updatedAtUtc: `2026-07-22T08:00:0${treeVersion}Z`,
    payload,
  };
}

function analyses(live: MeetingAIAnalysis): MeetingAIAnalyses {
  return { sessionId: "session-a", live, final: null, treeSnapshot: null, liveHistory: [] };
}

describe("useMeetingTranscriptSession analysis recovery", () => {
  beforeEach(() => {
    resetMeetingAnalysisSessionStoresForTest();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    api.getSession.mockReset().mockImplementation((_workspaceId: string, sessionId: string) =>
      Promise.resolve({
        sessionId,
        status: "recording",
        createdAt: "2026-07-22T07:55:00Z",
        updatedAt: "2026-07-22T08:00:00Z",
      } satisfies MeetingSessionDto),
    );
    api.getHistory.mockReset().mockResolvedValue({ segments: [], unavailable: false });
    api.getAnalyses
      .mockReset()
      .mockResolvedValue(analyses(liveAnalysis(1, 1, ["root", "issue-1"])));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains a WS tree through disconnect, stale REST hydrate, reconnect, and remount", async () => {
    const view = renderHook(() =>
      useMeetingTranscriptSession("session-a", "session-a", "workspace-a"),
    );

    await waitFor(() => {
      expect(view.result.current.discussionTree.treeVersion).toBe(1);
      expect(FakeWebSocket.instances).toHaveLength(1);
    });
    act(() => FakeWebSocket.instances[0].emit("open"));

    const wsV2 = liveAnalysis(2, 2, ["root", "issue-1", "issue-2"]);
    act(() => {
      FakeWebSocket.instances[0].emit("message", {
        data: JSON.stringify({
          type: "ai_analysis.updated",
          sentAtUtc: wsV2.updatedAtUtc,
          data: wsV2,
        }),
      });
    });
    expect(view.result.current.discussionTree.treeVersion).toBe(2);
    expect(view.result.current.discussionTree.tree?.nodes).toHaveLength(3);

    act(() =>
      FakeWebSocket.instances[0].emit("close", {
        code: 1006,
        reason: "network interruption",
        wasClean: false,
      }),
    );
    expect(view.result.current.discussionTree.treeVersion).toBe(2);

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    act(() => FakeWebSocket.instances[1].emit("open"));
    await waitFor(() => expect(api.getAnalyses).toHaveBeenCalledTimes(2));
    expect(view.result.current.discussionTree.treeVersion).toBe(2);
    expect(view.result.current.discussionTree.tree?.nodes).toHaveLength(3);

    view.unmount();
    api.getAnalyses.mockRejectedValue(new Error("temporary REST failure"));
    const remounted = renderHook(() =>
      useMeetingTranscriptSession("session-a", "session-a", "workspace-a"),
    );
    expect(remounted.result.current.discussionTree.treeVersion).toBe(2);
    expect(remounted.result.current.discussionTree.tree?.nodes).toHaveLength(3);
  });
});
