import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMeetingEndFlow } from "./useMeetingEndFlow";
import {
  endWorkspaceMeetingSession,
  getWorkspaceMeetingSession,
  type MeetingSessionDto,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";

vi.mock("~/api/meetingSessions/meetingSessionsApi", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("~/api/meetingSessions/meetingSessionsApi")>();
  return {
    ...original,
    endWorkspaceMeetingSession: vi.fn(),
    getWorkspaceMeetingSession: vi.fn(),
  };
});

const endMock = vi.mocked(endWorkspaceMeetingSession);
const getMock = vi.mocked(getWorkspaceMeetingSession);

function session(status: MeetingSessionStatus, endedAt?: string): MeetingSessionDto {
  return { sessionId: "session-1", status, ...(endedAt ? { endedAt } : {}) };
}

type HookProps = {
  observedStatus: MeetingSessionStatus | null;
  observedEndedAt: string;
  wsConnected: boolean;
};

function renderEndFlow(initial: Partial<HookProps> = {}) {
  return renderHook(
    (props: HookProps) =>
      useMeetingEndFlow({
        workspaceId: "ws-1",
        sessionId: "session-1",
        observedStatus: props.observedStatus,
        observedEndedAt: props.observedEndedAt,
        wsConnected: props.wsConnected,
        pollIntervalMs: 20,
      }),
    {
      initialProps: {
        observedStatus: "recording" as MeetingSessionStatus | null,
        observedEndedAt: "",
        wsConnected: true,
        ...initial,
      },
    },
  );
}

beforeEach(() => {
  endMock.mockReset();
  getMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMeetingEndFlow", () => {
  it("終了APIがendingを返したらendingのまま待機し、endedモーダルを表示しない (8.1)", async () => {
    endMock.mockResolvedValue(session("ending"));
    const { result } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });

    expect(endMock).toHaveBeenCalledTimes(1);
    expect(result.current.effectiveStatus).toBe("ending");
    expect(result.current.isFinalizing).toBe(true);
    expect(result.current.showEndedModal).toBe(false);
  });

  it("ending待機中にWSでendedを受信したら終了完了モーダルへ切り替える (8.2)", async () => {
    endMock.mockResolvedValue(session("ending"));
    const { result, rerender } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });
    expect(result.current.showEndedModal).toBe(false);

    // WS(status_changed)で正式なendedを受信。
    rerender({
      observedStatus: "ended",
      observedEndedAt: "2026-07-12T10:00:00Z",
      wsConnected: true,
    });

    await waitFor(() => {
      expect(result.current.showEndedModal).toBe(true);
    });
    expect(result.current.effectiveStatus).toBe("ended");
    expect(result.current.isFinalizing).toBe(false);
    expect(result.current.endedAt).toBe("2026-07-12T10:00:00Z");
  });

  it("終了APIが即endedを返したらendingに留まらず完了モーダルへ進む (8.3)", async () => {
    endMock.mockResolvedValue(session("ended", "2026-07-12T10:00:00Z"));
    const { result } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });

    expect(endMock).toHaveBeenCalledTimes(1);
    expect(result.current.showEndedModal).toBe(true);
    expect(result.current.endedAt).toBe("2026-07-12T10:00:00Z");
  });

  it("二重クリックでも終了APIは1回だけ呼ばれ同じfinalizationを待つ (8.4)", async () => {
    let resolveEnd: (value: MeetingSessionDto) => void = () => {};
    endMock.mockImplementation(
      () => new Promise<MeetingSessionDto>((resolve) => (resolveEnd = resolve)),
    );
    const { result } = renderEndFlow();

    await act(async () => {
      const first = result.current.requestEnd();
      const second = result.current.requestEnd();
      resolveEnd(session("ending"));
      await Promise.all([first, second]);
    });

    expect(endMock).toHaveBeenCalledTimes(1);
    expect(result.current.effectiveStatus).toBe("ending");
  });

  it("ending中にWSが切断されたらREST pollingでendedを確認し、確認後に停止する (8.5)", async () => {
    endMock.mockResolvedValue(session("ending"));
    getMock
      .mockResolvedValueOnce(session("ending"))
      .mockResolvedValue(session("ended", "2026-07-12T10:05:00Z"));
    const { result, rerender } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });

    // WS切断 → polling fallbackへ。
    rerender({ observedStatus: "recording", observedEndedAt: "", wsConnected: false });

    await waitFor(() => {
      expect(result.current.showEndedModal).toBe(true);
    });
    expect(result.current.effectiveStatus).toBe("ended");
    expect(getMock).toHaveBeenCalled();

    const callsAtEnd = getMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getMock.mock.calls.length).toBe(callsAtEnd);
  });

  it("再読み込みでending状態を観測した場合、終了APIを再送信せずに待機画面へ復帰する (8.6)", async () => {
    const { result, rerender } = renderEndFlow({ observedStatus: "ending" });

    expect(result.current.isFinalizing).toBe(true);
    expect(result.current.showEndedModal).toBe(false);
    expect(endMock).not.toHaveBeenCalled();

    rerender({ observedStatus: "ended", observedEndedAt: "", wsConnected: true });
    await waitFor(() => {
      expect(result.current.showEndedModal).toBe(true);
    });
  });

  it("終了APIリクエスト自体の失敗はエラー表示し、再試行できる (8.7)", async () => {
    endMock.mockRejectedValueOnce(new Error("network down")).mockResolvedValue(session("ending"));
    const { result } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });
    expect(result.current.endError).toContain("会議の終了に失敗しました");
    expect(result.current.showEndedModal).toBe(false);

    await act(async () => {
      await result.current.requestEnd();
    });
    expect(endMock).toHaveBeenCalledTimes(2);
    expect(result.current.effectiveStatus).toBe("ending");
    expect(result.current.endError).toBeNull();
  });

  it("ending後にfailedになった場合もendedへ偽装せずterminalとして扱い、行き止まりにしない (8.7)", async () => {
    endMock.mockResolvedValue(session("ending"));
    const { result, rerender } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });

    rerender({ observedStatus: "failed", observedEndedAt: "", wsConnected: true });

    await waitFor(() => {
      expect(result.current.showEndedModal).toBe(true);
    });
    expect(result.current.effectiveStatus).toBe("failed");
  });

  it("unmount時にpollingが停止しstate更新が起きない (8.8)", async () => {
    endMock.mockResolvedValue(session("ending"));
    getMock.mockResolvedValue(session("ending"));
    const { result, rerender, unmount } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });
    rerender({ observedStatus: "recording", observedEndedAt: "", wsConnected: false });

    await waitFor(() => {
      expect(getMock).toHaveBeenCalled();
    });

    unmount();
    const callsAtUnmount = getMock.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 120));
    // タイマーがcleanupされ、unmount後の追加pollingが起きない
    // (in-flight分の+1までは許容する)。
    expect(getMock.mock.calls.length).toBeLessThanOrEqual(callsAtUnmount + 1);
  });

  it("WS接続中はpollingせず、terminalなWS通知が常にoverrideより優先される", async () => {
    endMock.mockResolvedValue(session("ending"));
    const { result, rerender } = renderEndFlow();

    await act(async () => {
      await result.current.requestEnd();
    });
    expect(getMock).not.toHaveBeenCalled();

    // WS由来のterminal(stale)はREST由来のendingより優先。
    rerender({ observedStatus: "stale", observedEndedAt: "", wsConnected: true });
    await waitFor(() => {
      expect(result.current.effectiveStatus).toBe("stale");
    });
  });

  it("状態が変わらないrerenderでは戻り値の参照が安定している(chrome登録ループの回帰防止)", () => {
    const { result, rerender } = renderEndFlow();
    const first = result.current;

    rerender({ observedStatus: "recording", observedEndedAt: "", wsConnected: true });
    expect(result.current).toBe(first);

    // WS接続状態だけの変化(polling制御用)でも戻り値は同一参照のまま。
    rerender({ observedStatus: "recording", observedEndedAt: "", wsConnected: false });
    expect(result.current).toBe(first);
  });
});
