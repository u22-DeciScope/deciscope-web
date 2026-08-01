import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MeetingSessionMediaHealth } from "~/api/transcripts/transcriptSegmentsApi";
import { useBotStatusToasts } from "~/hooks/useBotStatusToasts";

describe("useBotStatusToasts media health", () => {
  it("shows one transport warning and replaces it with a duration-aware recovery", () => {
    const stalled: MeetingSessionMediaHealth = {
      sessionId: "session-1",
      eventId: "stall-1:started",
      state: "audio_receive_stalled",
      event: "started",
      occurredAtUtc: "2026-08-01T00:50:25Z",
    };
    const { result, rerender } = renderHook(
      ({ mediaHealth }) =>
        useBotStatusToasts("session-1", "recording", {
          isLocalEnd: false,
          botConnectionLost: false,
          transcriptHealth: "audio_stalled",
          mediaHealth,
        }),
      { initialProps: { mediaHealth: stalled as MeetingSessionMediaHealth | null } },
    );

    expect(result.current.toasts).toEqual([
      expect.objectContaining({ id: "audio-receive", tone: "warning" }),
    ]);

    act(() => {
      rerender({
        mediaHealth: {
          ...stalled,
          eventId: "stall-1:recovered",
          state: "ok",
          event: "recovered",
          occurredAtUtc: "2026-08-01T00:51:08Z",
          durationMs: 42917,
        },
      });
    });

    expect(result.current.toasts).toEqual([
      expect.objectContaining({
        id: "audio-receive-recovered",
        tone: "success",
        message: "音声受信が復旧しました（約43秒）。",
      }),
    ]);
  });
});
