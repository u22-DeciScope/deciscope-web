import { describe, expect, it } from "vitest";

import {
  initialMeetingRuntimeState,
  meetingRuntimeReducer,
} from "~/api/meetings/meetingRuntimeReducer";
import type { MeetingRealtimeEventDto } from "~/api/meetings/meetingEventsApi";
import type { MeetingDto } from "~/api/meetings/meetingsApi";

const meeting: MeetingDto = {
  id: "meeting-1",
  workspace_id: "workspace-1",
  title: "Meeting",
  status: "active",
  source: "test",
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:01:00Z",
};

function event(
  seq: number,
  type: string,
  payload: Record<string, unknown>,
): MeetingRealtimeEventDto {
  return { meeting_id: meeting.id, seq, type, ts_ms: seq * 1000, payload };
}

describe("meeting runtime resynchronization", () => {
  it("applies durable state fetched after a temporary WebSocket disconnection", () => {
    const loaded = meetingRuntimeReducer(initialMeetingRuntimeState, {
      type: "loaded",
      meeting,
      events: [event(1, "meeting.state", { status: "active" })],
      segments: [],
    });
    const recovered = meetingRuntimeReducer(loaded, {
      type: "resynced",
      meeting: { ...meeting, updated_at: "2026-07-10T00:02:00Z" },
      events: [event(2, "tree.update", { version: 2, nodes: [], edges: [] })],
      segments: [],
    });

    expect(recovered.lastSeq).toBe(2);
    expect(recovered.tree?.version).toBe(2);
  });

  it("does not rewind newer WebSocket state when an older REST response completes", () => {
    const loaded = meetingRuntimeReducer(initialMeetingRuntimeState, {
      type: "loaded",
      meeting,
      events: [event(5, "tree.update", { version: 5, nodes: [], edges: [] })],
      segments: [],
    });
    const recovered = meetingRuntimeReducer(loaded, {
      type: "resynced",
      meeting: { ...meeting, updated_at: "2026-07-10T00:00:30Z" },
      events: [event(4, "tree.update", { version: 4, nodes: [], edges: [] })],
      segments: [],
    });

    expect(recovered.lastSeq).toBe(5);
    expect(recovered.tree?.version).toBe(5);
    expect(recovered.meeting?.updated_at).toBe(loaded.meeting?.updated_at);
  });

  it("converges to ended from the REST meeting snapshot when the end event was missed", () => {
    const loaded = meetingRuntimeReducer(initialMeetingRuntimeState, {
      type: "loaded",
      meeting,
      events: [],
      segments: [],
    });
    const recovered = meetingRuntimeReducer(loaded, {
      type: "resynced",
      meeting: {
        ...meeting,
        status: "ended",
        updated_at: "2026-07-10T00:03:00Z",
        ended_at: "2026-07-10T00:03:00Z",
      },
      events: [],
      segments: [],
    });

    expect(recovered.meeting?.status).toBe("ended");
  });
});
