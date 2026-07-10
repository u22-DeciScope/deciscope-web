import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMeeting: vi.fn(),
  endMeeting: vi.fn(),
  listMeetingEvents: vi.fn(),
  listMeetingSegments: vi.fn(),
}));

vi.mock("~/api/meetings/meetingsApi", () => ({
  getMeeting: api.getMeeting,
  endMeeting: api.endMeeting,
}));

vi.mock("~/api/meetings/meetingEventsApi", () => ({
  listMeetingEvents: api.listMeetingEvents,
  listMeetingSegments: api.listMeetingSegments,
}));

import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";

type SocketEvent = { code?: number; reason?: string; wasClean?: boolean; data?: unknown };

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  private listeners = new Map<string, Array<(event: SocketEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: SocketEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send() {}

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  emit(type: string, event: SocketEvent = {}) {
    if (type === "open") this.readyState = FakeWebSocket.OPEN;
    if (type === "close") this.readyState = FakeWebSocket.CLOSED;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const activeMeeting = {
  id: "meeting-1",
  workspace_id: "workspace-1",
  title: "Meeting",
  status: "active",
  source: "test",
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:01:00Z",
};

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("useMeetingRuntime WebSocket recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.instances = [];
    api.getMeeting.mockReset();
    api.endMeeting.mockReset();
    api.listMeetingEvents.mockReset().mockResolvedValue({ events: [] });
    api.listMeetingSegments.mockReset().mockResolvedValue({ segments: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reconnects after a temporary close and REST-resyncs a missed ended state", async () => {
    api.getMeeting.mockResolvedValueOnce(activeMeeting).mockResolvedValueOnce({
      ...activeMeeting,
      status: "ended",
      updated_at: "2026-07-10T00:02:00Z",
      ended_at: "2026-07-10T00:02:00Z",
    });
    const { result } = renderHook(() => useMeetingRuntime("meeting-1"));
    await act(flushPromises);

    expect(FakeWebSocket.instances).toHaveLength(1);
    act(() => FakeWebSocket.instances[0].emit("open"));
    act(() => FakeWebSocket.instances[0].emit("close", { code: 1006 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => FakeWebSocket.instances[1].emit("open"));
    await act(flushPromises);

    expect(result.current.meeting?.status).toBe("ended");
    expect(api.getMeeting).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on a permanent policy/auth close", async () => {
    api.getMeeting.mockResolvedValue(activeMeeting);
    const { result } = renderHook(() => useMeetingRuntime("meeting-1"));
    await act(flushPromises);

    act(() => FakeWebSocket.instances[0].emit("open"));
    act(() => FakeWebSocket.instances[0].emit("close", { code: 1008 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.recoveryRequired).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
