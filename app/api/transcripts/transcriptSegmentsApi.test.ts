import { describe, expect, it } from "vitest";

import {
  buildWorkspaceMeetingSessionTranscriptWebSocketUrl,
  parseTranscriptWebSocketEvent,
} from "~/api/transcripts/transcriptSegmentsApi";

describe("workspace transcript WebSocket URL", () => {
  it("uses only the workspace-scoped route and never embeds a shared token", () => {
    const url = new URL(
      buildWorkspaceMeetingSessionTranscriptWebSocketUrl("workspace-1", "session-1"),
    );

    expect(url.pathname).toContain(
      "/v1/workspaces/workspace-1/meeting-sessions/session-1/transcript-stream",
    );
    expect(url.searchParams.has("token")).toBe(false);
  });
});

describe("meeting_session.status_changed parsing", () => {
  it("ending statusのイベントを破棄せずパースする", () => {
    const parsed = parseTranscriptWebSocketEvent(
      JSON.stringify({
        type: "meeting_session.status_changed",
        sentAtUtc: "2026-07-12T10:00:00Z",
        data: { sessionId: "session-1", status: "ending" },
      }),
    );

    expect(parsed.sessionStatus).not.toBeNull();
    expect(parsed.sessionStatus?.status).toBe("ending");
  });

  it("endedイベントはendedAt/endReason付きでパースされる", () => {
    const parsed = parseTranscriptWebSocketEvent(
      JSON.stringify({
        type: "meeting_session.status_changed",
        sentAtUtc: "2026-07-12T10:01:00Z",
        data: {
          sessionId: "session-1",
          status: "ended",
          endedAt: "2026-07-12T10:00:59Z",
          endReason: "manual_end_requested",
        },
      }),
    );

    expect(parsed.sessionStatus?.status).toBe("ended");
    expect(parsed.sessionStatus?.endedAt).toBe("2026-07-12T10:00:59Z");
    expect(parsed.sessionStatus?.endReason).toBe("manual_end_requested");
  });
});
