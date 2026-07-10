import { describe, expect, it } from "vitest";

import { buildWorkspaceMeetingSessionTranscriptWebSocketUrl } from "~/api/transcripts/transcriptSegmentsApi";

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
