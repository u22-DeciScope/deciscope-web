import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgendaProgressEntryPayload,
  AgendaProgressPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import type { LiveAnalysisMeta } from "~/hooks/useMeetingTranscriptSession";

const agendaProgressApiMock = vi.hoisted(() => ({
  updateAgendaProgressOverride: vi.fn(),
}));

vi.mock("~/api/aiAnalysis/agendaProgressApi", () => ({
  updateAgendaProgressOverride: agendaProgressApiMock.updateAgendaProgressOverride,
}));

import { AgendaProgressSection } from "./AgendaProgressSection";

function entry(
  overrides: Partial<AgendaProgressEntryPayload> & Pick<AgendaProgressEntryPayload, "id" | "title">,
): AgendaProgressEntryPayload {
  return {
    sourceType: "fixed_agenda",
    computedStatus: "not_started",
    effectiveStatus: "not_started",
    ...overrides,
  };
}

const idleMeta: LiveAnalysisMeta = {
  intervalSeconds: 10,
  lastEventAtMs: null,
  lastCompletedAtMs: null,
  generating: false,
  failed: false,
  hasNewSpeech: false,
};

function renderSection(
  overrides: Partial<React.ComponentProps<typeof AgendaProgressSection>> = {},
) {
  const props: React.ComponentProps<typeof AgendaProgressSection> = {
    progress: undefined,
    meta: idleMeta,
    connectionStatus: "connected",
    canManage: false,
    workspaceId: "workspace-1",
    sessionId: "session-1",
    treeNodes: [] as TreeNodePayload[],
    ...overrides,
  };
  return render(<AgendaProgressSection {...props} />);
}

describe("AgendaProgressSection", () => {
  beforeEach(() => {
    agendaProgressApiMock.updateAgendaProgressOverride.mockReset();
  });

  it("shows the three fixed-agenda statuses, current-item emphasis, and outcome labels", () => {
    const progress: AgendaProgressPayload = {
      effectiveCurrentTopicId: "agenda-2",
      entries: [
        entry({ id: "agenda-1", title: "現状確認", order: 1 }),
        entry({
          id: "agenda-2",
          title: "改修案を決める",
          order: 2,
          computedStatus: "discussing",
          effectiveStatus: "discussing",
          discussionWeight: 0.4,
        }),
        entry({
          id: "agenda-3",
          title: "担当と期限を決める",
          order: 3,
          computedStatus: "discussed",
          effectiveStatus: "discussed",
          outcomeStatus: "concluded",
        }),
        entry({
          id: "agenda-4",
          title: "共有事項",
          order: 4,
          computedStatus: "discussed",
          effectiveStatus: "discussed",
        }),
      ],
    };
    renderSection({ progress });

    expect(screen.getByText("未着手")).not.toBeNull();
    expect(screen.getByText(/議論中/)).not.toBeNull();
    expect(screen.getByText(/話し合い済み・結論あり/)).not.toBeNull();
    expect(screen.getByText("話し合い済み")).not.toBeNull();
    expect(screen.getByText("▶ 現在の議題")).not.toBeNull();

    const currentRow = screen.getByText("改修案を決める").closest("[data-agenda-entry-id]");
    expect(currentRow).not.toBeNull();
    expect(within(currentRow as HTMLElement).getByText("▶ 現在の議題")).not.toBeNull();
  });

  it("distinguishes fixed and dynamic sections, hides the dynamic section when absent, and hides both when entries are empty", () => {
    const progress: AgendaProgressPayload = {
      entries: [
        entry({ id: "agenda-1", title: "予算計画" }),
        entry({
          id: "topic-dyn-1",
          title: "急遽出た話題",
          sourceType: "dynamic_topic",
          computedStatus: "discussing",
          effectiveStatus: "discussing",
        }),
        entry({
          id: "topic-dyn-2",
          title: "もう一つの話題",
          sourceType: "dynamic_topic",
          computedStatus: "discussed",
          effectiveStatus: "discussed",
          outcomeStatus: "concluded",
        }),
      ],
    };
    const { rerender } = renderSection({ progress });

    expect(screen.getByRole("heading", { name: "話し合う項目" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "会議中に追加された論点" })).not.toBeNull();
    expect(screen.getByText("急遽出た話題")).not.toBeNull();
    expect(screen.getByText("もう一つの話題")).not.toBeNull();

    const fixedSection = screen.getByTestId("fixed-agenda-section");
    const dynamicSection = screen.getByTestId("dynamic-agenda-section");
    expect(fixedSection.className).not.toContain("border");
    expect(dynamicSection.className).not.toContain("border");
    expect(screen.getByText("予算計画").closest('[role="button"]')?.className).toContain("border");
    expect(screen.getByText("急遽出た話題").closest('[role="button"]')?.className).toContain(
      "border",
    );

    rerender(
      <AgendaProgressSection
        progress={{ entries: [entry({ id: "agenda-1", title: "予算計画" })] }}
        meta={idleMeta}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "会議中に追加された論点" })).toBeNull();

    rerender(
      <AgendaProgressSection
        progress={{ entries: [] }}
        meta={idleMeta}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "話し合う項目" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "会議中に追加された論点" })).toBeNull();
  });

  it("does not crash on a legacy payload without agendaProgress and shows the status line only", () => {
    renderSection({ progress: undefined });
    expect(screen.queryByRole("heading", { name: "話し合う項目" })).toBeNull();
    expect(screen.getByText("次の分析を待っています")).not.toBeNull();
  });

  it("line-clamps a long title while keeping the full text in the title attribute", () => {
    const longTitle = "とても長いアジェンダタイトルの内容".repeat(4);
    const progress: AgendaProgressPayload = {
      entries: [entry({ id: "agenda-1", title: longTitle })],
    };
    renderSection({ progress });

    const titleEl = screen.getByTitle(longTitle);
    expect(titleEl.className).toContain("line-clamp-2");
    expect(titleEl.textContent).toBe(longTitle);
  });

  it("sizes the discussion bar relative to discussionWeight with a minimum width, and hides it for not_started entries", () => {
    const progress: AgendaProgressPayload = {
      entries: [
        entry({
          id: "agenda-1",
          title: "改修案を決める",
          computedStatus: "discussing",
          effectiveStatus: "discussing",
          discussionWeight: 0.62,
        }),
        entry({
          id: "agenda-2",
          title: "軽微な話題",
          computedStatus: "discussing",
          effectiveStatus: "discussing",
          discussionWeight: 0.02,
        }),
        entry({ id: "agenda-3", title: "未着手の項目" }),
      ],
    };
    const { container } = renderSection({ progress });

    const bar1 = container.querySelector(
      '[data-testid="agenda-weight-bar-agenda-1"]',
    ) as HTMLElement;
    expect(bar1.style.width).toBe("62%");
    const bar2 = container.querySelector(
      '[data-testid="agenda-weight-bar-agenda-2"]',
    ) as HTMLElement;
    expect(bar2.style.width).toBe("8%");
    expect(container.querySelector('[data-testid="agenda-weight-bar-agenda-3"]')).toBeNull();
  });

  it("hides the entry menu when canManage is false and shows it when canManage is true", () => {
    const progress: AgendaProgressPayload = {
      entries: [entry({ id: "agenda-1", title: "予算計画" })],
    };
    const { rerender } = renderSection({ progress, canManage: false });
    expect(screen.queryByLabelText("この議題の操作")).toBeNull();

    rerender(
      <AgendaProgressSection
        progress={progress}
        meta={idleMeta}
        connectionStatus="connected"
        canManage
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByLabelText("この議題の操作")).not.toBeNull();
  });

  it("applies an optimistic update immediately, confirms via onProgressPatched on success, and disables the menu button while pending", async () => {
    let resolvePatch: ((value: AgendaProgressPayload) => void) | null = null;
    agendaProgressApiMock.updateAgendaProgressOverride.mockImplementation(
      () =>
        new Promise<AgendaProgressPayload>((resolve) => {
          resolvePatch = resolve;
        }),
    );
    const progress: AgendaProgressPayload = {
      entries: [entry({ id: "agenda-1", title: "予算計画" })],
    };
    const onProgressPatched = vi.fn();
    renderSection({ progress, canManage: true, onProgressPatched });

    fireEvent.click(screen.getByLabelText("この議題の操作"));
    fireEvent.click(screen.getByRole("menuitem", { name: "議論中にする" }));

    expect(screen.getByText(/議論中/)).not.toBeNull();
    expect(screen.getByLabelText("この議題の操作")).toHaveProperty("disabled", true);
    expect(agendaProgressApiMock.updateAgendaProgressOverride).toHaveBeenCalledWith(
      "workspace-1",
      "session-1",
      { entryId: "agenda-1", manualStatus: "discussing" },
    );

    const serverResult: AgendaProgressPayload = {
      entries: [
        entry({
          id: "agenda-1",
          title: "予算計画",
          computedStatus: "not_started",
          manualStatus: "discussing",
          effectiveStatus: "discussing",
        }),
      ],
    };
    await act(async () => {
      resolvePatch?.(serverResult);
      await Promise.resolve();
    });

    expect(onProgressPatched).toHaveBeenCalledWith(serverResult);
    expect(screen.getByLabelText("この議題の操作")).toHaveProperty("disabled", false);
  });

  it("rolls back the optimistic update and shows an error message when the request fails", async () => {
    agendaProgressApiMock.updateAgendaProgressOverride.mockRejectedValueOnce(new Error("boom"));
    const progress: AgendaProgressPayload = {
      entries: [entry({ id: "agenda-1", title: "予算計画" })],
    };
    renderSection({ progress, canManage: true });

    fireEvent.click(screen.getByLabelText("この議題の操作"));
    fireEvent.click(screen.getByRole("menuitem", { name: "議論中にする" }));
    expect(screen.getByText(/議論中/)).not.toBeNull();

    expect(
      await screen.findByText("更新できませんでした。時間をおいて再度お試しください。"),
    ).not.toBeNull();
    expect(screen.getByText("未着手")).not.toBeNull();
  });

  it("focuses the tree via primaryNodeId when the node exists, and shows a temporary notice otherwise", () => {
    const onFocusTreeItem = vi.fn();
    const progress: AgendaProgressPayload = {
      entries: [
        entry({ id: "agenda-1", title: "予算計画", primaryNodeId: "topic-agenda-1" }),
        entry({ id: "agenda-2", title: "採用計画" }),
      ],
    };
    renderSection({
      progress,
      onFocusTreeItem,
      treeNodes: [{ id: "topic-agenda-1", kind: "topic", label: "予算計画" }],
    });

    fireEvent.click(screen.getByText("予算計画"));
    expect(onFocusTreeItem).toHaveBeenCalledWith("topic-agenda-1");

    fireEvent.click(screen.getByText("採用計画"));
    expect(onFocusTreeItem).toHaveBeenCalledTimes(1);
    expect(screen.getByText("関連する議論はまだありません")).not.toBeNull();
  });

  it("branches the status line across generating / reconnecting / waiting / stalled", () => {
    const { rerender } = renderSection({
      meta: { ...idleMeta, generating: true },
      connectionStatus: "connected",
    });
    expect(screen.getByText("分析中…")).not.toBeNull();

    rerender(
      <AgendaProgressSection
        progress={undefined}
        meta={idleMeta}
        connectionStatus="reconnecting"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByText("接続を再試行しています")).not.toBeNull();

    rerender(
      <AgendaProgressSection
        progress={undefined}
        meta={idleMeta}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByText("次の分析を待っています")).not.toBeNull();

    const stalledMeta: LiveAnalysisMeta = {
      intervalSeconds: 10,
      lastEventAtMs: Date.now() - 10 * 6 * 1000 - 5_000,
      lastCompletedAtMs: null,
      generating: false,
      failed: false,
      hasNewSpeech: true,
    };
    rerender(
      <AgendaProgressSection
        progress={undefined}
        meta={stalledMeta}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByText("更新が停止しています")).not.toBeNull();

    // 発話が無いだけの遅延は「停止」ではなく通常の待機表示のまま。
    rerender(
      <AgendaProgressSection
        progress={undefined}
        meta={{ ...stalledMeta, hasNewSpeech: false }}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByText("次の分析を待っています")).not.toBeNull();
  });

  it("shows the last-updated time as a relative elapsed label instead of a wall-clock time", () => {
    const now = Date.now();
    const { rerender } = renderSection({
      meta: { ...idleMeta, lastCompletedAtMs: now - 45_000 },
    });
    expect(screen.getByText("最終更新：45秒前")).not.toBeNull();

    rerender(
      <AgendaProgressSection
        progress={undefined}
        meta={{ ...idleMeta, lastCompletedAtMs: now - 90_000 }}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByText("最終更新：1分前")).not.toBeNull();

    rerender(
      <AgendaProgressSection
        progress={undefined}
        meta={{ ...idleMeta, lastCompletedAtMs: now - (2 * 3_600_000 + 10_000) }}
        connectionStatus="connected"
        canManage={false}
        workspaceId="workspace-1"
        sessionId="session-1"
        treeNodes={[]}
      />,
    );
    expect(screen.getByText("最終更新：2時間前")).not.toBeNull();
  });

  it("hides the status line entirely when meta is absent (session review without live analysis meta)", () => {
    const { container } = renderSection({ meta: null });
    expect(container.querySelector("p")).toBeNull();
    expect(screen.queryByText("次の分析を待っています")).toBeNull();
  });
});
