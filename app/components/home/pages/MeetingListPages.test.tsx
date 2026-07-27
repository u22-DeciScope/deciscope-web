import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import type { MeetingFinalSummaryPreview } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";

const mocks = vi.hoisted(() => ({
  listMeetingSessions: vi.fn<() => Promise<MeetingSessionDto[]>>(),
  deleteMeetingSession: vi.fn<(workspaceId: string, sessionId: string) => Promise<void>>(),
  listFinalSummaryPreviews: vi.fn<() => Promise<MeetingFinalSummaryPreview[]>>(),
  workspaceRole: "owner" as string,
}));

vi.mock("~/api/meetingSessions/meetingSessionsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/api/meetingSessions/meetingSessionsApi")>()),
  listWorkspaceMeetingSessions: mocks.listMeetingSessions,
  deleteWorkspaceMeetingSession: mocks.deleteMeetingSession,
}));

vi.mock("~/api/aiAnalysis/aiAnalysisApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/api/aiAnalysis/aiAnalysisApi")>()),
  listWorkspaceFinalSummaryPreviews: mocks.listFinalSummaryPreviews,
}));

vi.mock("~/context/AuthenticatedLayoutContext", () => ({
  useAuthenticatedLayout: () => ({
    workspaceId: "workspace-1",
    workspace: { id: "workspace-1", name: "テスト", role: mocks.workspaceRole },
  }),
}));

vi.mock("~/components/shared/layout/WorkspaceChromeContext", () => ({
  useWorkspaceChrome: vi.fn(),
}));

vi.mock("~/utils/meetingStartDebug", () => ({
  meetingStartDebug: vi.fn(),
  isMeetingStartDebugEnabled: () => false,
}));

import Home from "./HomePage";
import MeetingHistoryPage from "./MeetingHistoryPage";

describe("meeting list page layouts", () => {
  beforeEach(() => {
    mocks.listMeetingSessions.mockReset();
    mocks.deleteMeetingSession.mockReset();
    mocks.listFinalSummaryPreviews.mockReset();
    mocks.listFinalSummaryPreviews.mockResolvedValue([]);
    mocks.workspaceRole = "owner";
  });

  afterEach(() => cleanup());

  it("hides dashboard statistics and the empty active-meetings section", async () => {
    mocks.listMeetingSessions.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText("会議を読み込んでいます...")).toBeNull());
    expect(screen.queryByText("進行中の会議")).toBeNull();
    expect(screen.queryByText("会議数")).toBeNull();
    expect(
      screen.queryByText("進行中の会議はまだありません。会議を開始するとここに表示されます。"),
    ).toBeNull();
    expect(screen.getByText("最近の会議")).not.toBeNull();
  });

  it("keeps the active-meetings section when an active meeting exists", async () => {
    mocks.listMeetingSessions.mockResolvedValue([
      {
        sessionId: "session-active",
        status: "active",
        displayTitle: "デザインレビュー",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText("進行中の会議")).not.toBeNull();
    expect(screen.getByText("デザインレビュー")).not.toBeNull();
  });

  it("removes history statistics while retaining the meeting list section", async () => {
    mocks.listMeetingSessions.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <MeetingHistoryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText("会議履歴を読み込んでいます...")).toBeNull());
    expect(screen.queryByText("今月の会議")).toBeNull();
    expect(screen.queryByText("正常終了")).toBeNull();
    expect(screen.getByText("終了した会議")).not.toBeNull();
  });

  it("shows the total finished meeting count next to 最近の会議", async () => {
    mocks.listMeetingSessions.mockResolvedValue([
      {
        sessionId: "session-1",
        status: "ended",
        displayTitle: "定例会議1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
      {
        sessionId: "session-2",
        status: "ended",
        displayTitle: "定例会議2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText("全2件")).not.toBeNull();
  });

  it("deletes a finished meeting from history after confirming", async () => {
    mocks.listMeetingSessions.mockResolvedValue([
      {
        sessionId: "session-finished",
        status: "ended",
        displayTitle: "振り返り会議",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ]);
    mocks.deleteMeetingSession.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <MeetingHistoryPage />
      </MemoryRouter>,
    );

    const deleteButton = await screen.findByRole("button", { name: "削除" });
    fireEvent.click(deleteButton);

    expect(await screen.findByText("この会議の履歴を削除しますか？")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() =>
      expect(mocks.deleteMeetingSession).toHaveBeenCalledWith("workspace-1", "session-finished"),
    );
    await waitFor(() => expect(screen.queryByText("振り返り会議")).toBeNull());
    expect(screen.getByText("終了した会議はまだありません。")).not.toBeNull();
  });

  it("shows the AI final summary preview on a history card", async () => {
    mocks.listMeetingSessions.mockResolvedValue([
      {
        sessionId: "session-finished",
        status: "ended",
        displayTitle: "振り返り会議",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ]);
    mocks.listFinalSummaryPreviews.mockResolvedValue([
      { sessionId: "session-finished", overview: "決定事項と次のアクションの概要です。" },
    ]);

    render(
      <MemoryRouter>
        <MeetingHistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("決定事項と次のアクションの概要です。")).not.toBeNull();
  });

  it("falls back to a placeholder when no AI summary preview exists yet", async () => {
    mocks.listMeetingSessions.mockResolvedValue([
      {
        sessionId: "session-finished",
        status: "ended",
        displayTitle: "振り返り会議",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    expect(await screen.findByText("AI要約はまだありません")).not.toBeNull();
  });

  it("hides the delete button for viewers", async () => {
    mocks.workspaceRole = "viewer";
    mocks.listMeetingSessions.mockResolvedValue([
      {
        sessionId: "session-finished",
        status: "ended",
        displayTitle: "振り返り会議",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ]);

    render(
      <MemoryRouter>
        <MeetingHistoryPage />
      </MemoryRouter>,
    );

    await screen.findByText("振り返り会議");
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });
});
