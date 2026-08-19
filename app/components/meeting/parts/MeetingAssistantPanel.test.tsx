import { StrictMode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { AnalysisItem } from "~/api/meetings/meetingRuntimeTypes";
import { analysisKindLabel } from "~/components/meeting/parts/analysisKindPalette";
import {
  buildLiveCardUpdateHistoryFromLiveHistory,
  deriveLiveCardChanges,
  filterForInsightItem,
  hasInsightTab,
  isLiveDisplayItem,
  isResolvedDisplayItem,
  matchesInsightFilter,
  MeetingAssistantPanel,
} from "~/components/meeting/parts/MeetingAssistantPanel";

function item(id: string, kind: string, status: string): AnalysisItem {
  return { id, kind, status, severity: "medium", title: id, body: "" };
}

describe("MeetingAssistantPanel item filters", () => {
  it("uses the canonical issue label for legacy open issues", () => {
    expect(analysisKindLabel("open_issue")).toBe("論点");
  });
  it("keeps all decisions in the decision tab even for legacy resolved payloads", () => {
    const decisions = [
      item("decision-1", "decision", "open"),
      item("decision-2", "decision", "updated"),
      item("decision-3", "decision", "resolved"),
    ];

    expect(decisions.filter((value) => matchesInsightFilter(value, "decision"))).toHaveLength(3);
    expect(decisions.every((value) => !matchesInsightFilter(value, "resolved"))).toBe(true);
    expect(decisions.map(filterForInsightItem)).toEqual(["decision", "decision", "decision"]);
  });

  it("moves only resolvable kinds and completed TODOs to the resolved view", () => {
    for (const kind of ["question", "open_issue", "issue", "risk", "todo"]) {
      const value = item(kind, kind, "resolved");
      expect(isResolvedDisplayItem(value)).toBe(true);
      expect(matchesInsightFilter(value, "resolved")).toBe(true);
    }
    for (const kind of ["decision", "fact", "topic", "group"]) {
      expect(isResolvedDisplayItem(item(kind, kind, "resolved"))).toBe(false);
    }
    expect(matchesInsightFilter(item("todo-completed", "todo", "completed"), "resolved")).toBe(
      true,
    );
  });

  it("treats facts as tree-only: no tab, no tab switch on focus", () => {
    const fact = item("fact-1", "fact", "open");

    expect(hasInsightTab(fact)).toBe(false);
    expect(filterForInsightItem(fact)).toBeNull();
    for (const kind of ["issue", "question", "risk", "todo", "decision"]) {
      expect(hasInsightTab(item(kind, kind, "open"))).toBe(true);
    }
    expect(hasInsightTab(item("issue-resolved", "issue", "resolved"))).toBe(true);
  });

  it("keeps facts out of the header count so the badge matches what the tabs list", () => {
    render(
      <MeetingAssistantPanel
        insights={[item("fact-1", "fact", "open")]}
        speakerSummaries={[]}
        showLiveTab={false}
      />,
    );

    // 事実カードは件数に数えないため、属性タブは「0件」の空状態になる。
    expect(screen.getByText("まだAIメモはありません")).not.toBeNull();
    expect(screen.queryByText("このタブに表示するカードはありません")).toBeNull();
  });

  it("shows questions, open issues, and issues in the unresolved tab", () => {
    expect(matchesInsightFilter(item("q", "question", "open"), "unresolved")).toBe(true);
    expect(matchesInsightFilter(item("o", "open_issue", "updated"), "unresolved")).toBe(true);
    expect(matchesInsightFilter(item("i", "issue", "open"), "unresolved")).toBe(true);
    expect(matchesInsightFilter(item("done", "open_issue", "resolved"), "unresolved")).toBe(false);
  });

  it("keeps confirmation issues separate from TODO and moves them by status", () => {
    const confirmationOpen = {
      ...item("confirmation-open", "issue", "open"),
      subtype: "confirmation",
    };
    const confirmationResolved = {
      ...item("confirmation-resolved", "issue", "resolved"),
      subtype: "confirmation",
    };
    const todo = item("confirmation-todo", "todo", "open");

    expect(matchesInsightFilter(confirmationOpen, "unresolved")).toBe(true);
    expect(matchesInsightFilter(confirmationOpen, "todo")).toBe(false);
    expect(matchesInsightFilter(confirmationResolved, "resolved")).toBe(true);
    expect(matchesInsightFilter(confirmationResolved, "unresolved")).toBe(false);
    expect(matchesInsightFilter(todo, "todo")).toBe(true);
    expect(matchesInsightFilter(todo, "unresolved")).toBe(false);
  });

  it("does not render reversibly suppressed items", () => {
    const suppressed = {
      ...item("suppressed", "issue", "open"),
      subtype: "discussion",
      inactive: true,
      suppressionReason: "discourse_only",
    };
    render(<MeetingAssistantPanel insights={[suppressed]} speakerSummaries={[]} />);

    expect(screen.queryByText("suppressed")).toBeNull();
  });

  it("renders attribute tabs with issue subtype UI and hides priority on decision/resolved", () => {
    const values = [
      item("risk-card", "risk", "open"),
      { ...item("question-card", "issue", "open"), subtype: "question" },
      item("todo-card", "todo", "open"),
      item("decision-card", "decision", "open"),
      item("resolved-card", "todo", "resolved"),
    ];
    render(<MeetingAssistantPanel insights={values} speakerSummaries={[]} showLiveTab={true} />);

    for (const label of ["ライブ", "リスク", "論点", "TODO", "決定事項", "解決済"]) {
      expect(screen.getByRole("button", { name: label })).not.toBeNull();
    }
    expect(screen.queryByRole("button", { name: "対応事項" })).toBeNull();
    expect(screen.queryByRole("button", { name: /質問/ })).toBeNull();

    const issueTab = screen.getByRole("button", { name: "論点" });
    // タブ行は横に溢れさせない。以前は幅を等分するgridで各タブに min-w-0 を付け、
    // セルが文字幅より狭くなれるようにしていたが、ボタンは whitespace-nowrap で
    // クリップもしないため、パネルが狭いと「決定事項」がセルから溢れて隣のタブに
    // 重なっていた。今は min-w-0 を付けず(文字幅より狭くしない)、収まらないときは
    // 行を折り返すことで溢れを防ぐ。
    expect(issueTab.className).not.toContain("min-w-0");
    expect(issueTab.parentElement?.className).toContain("flex-wrap");

    fireEvent.click(issueTab);
    expect(screen.getByText("question-card")).not.toBeNull();
    expect(screen.getByText("質問")).not.toBeNull();
    expect(screen.getByText("medium")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "決定事項" }));
    expect(screen.getByText("decision-card")).not.toBeNull();
    expect(screen.queryByText("medium")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "解決済" }));
    expect(screen.getByText("resolved-card")).not.toBeNull();
    expect(screen.getByText("完了済")).not.toBeNull();
    expect(screen.queryByText("medium")).toBeNull();
  });

  it("keeps live and resolved classifications mutually exclusive", () => {
    for (const kind of ["question", "open_issue", "issue", "risk", "todo"]) {
      expect(isLiveDisplayItem(item(`${kind}-active`, kind, "open"))).toBe(true);
      expect(isLiveDisplayItem(item(`${kind}-resolved`, kind, "resolved"))).toBe(false);
    }
    expect(isLiveDisplayItem(item("decision", "decision", "resolved"))).toBe(true);
    expect(isLiveDisplayItem(item("fact", "fact", "open"))).toBe(true);
  });

  it("places every supported canonical item in exactly one attribute tab", () => {
    const filters = ["risk", "unresolved", "todo", "decision", "resolved"] as const;
    const values = [
      item("risk", "risk", "open"),
      item("question", "question", "open"),
      item("issue", "issue", "open"),
      item("todo", "todo", "open"),
      item("decision", "decision", "open"),
      item("resolved", "open_issue", "resolved"),
    ];
    for (const value of values) {
      expect(filters.filter((filter) => matchesInsightFilter(value, filter))).toHaveLength(1);
    }
  });

  it("keeps action-summary related items in the TODO tab without a duplicate tab", () => {
    const todo: AnalysisItem = {
      ...item("item-todo-wind", "todo", "open"),
      title: "気象データを確認する",
      relatedAgendaIds: ["agenda-4", "agenda-5", "agenda-4"],
      classificationStatus: "assigned",
    };
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 12,
      payload: {
        items: [todo],
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            { id: "agenda-2", kind: "topic", parentId: "root", label: "騒音" },
            { id: todo.id, kind: "todo", parentId: "agenda-2", label: todo.title },
          ],
          edges: [],
        },
      },
    };
    const onFocus = vi.fn();
    render(
      <StrictMode>
        <MeetingAssistantPanel
          insights={[]}
          speakerSummaries={[]}
          liveAnalysis={liveAnalysis}
          onFocusTreeItem={onFocus}
        />
      </StrictMode>,
    );

    expect(screen.queryByRole("button", { name: "対応事項" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "TODO" }));
    expect(screen.getAllByText(todo.title)).toHaveLength(1);
    const card = screen.getByText(todo.title).closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith(todo.id);
  });

  it("does not put an internal fallback bucket id into card update text", () => {
    const before: AnalysisItem = {
      ...item("todo-security", "todo", "open"),
      title: "セキュリティルールを確認する",
    };
    const after: AnalysisItem = {
      ...before,
      relatedAgendaIds: ["action-summary-fallback"],
    };
    const changes = deriveLiveCardChanges([before], [after], new Map());
    expect(JSON.stringify(changes)).not.toContain("action-summary-fallback");
  });

  it("renders card updates as cards without the removed topic or key points sections", async () => {
    const onFocus = vi.fn();
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 2,
      payload: {
        currentTopic: "次回リリースの範囲",
        summary: "対象機能を絞る。公開日を確認する。",
        items: [item("todo-1", "todo", "open")],
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            { id: "todo-1", kind: "todo", parentId: "root", label: "todo-1" },
          ],
          edges: [],
        },
      },
    };

    render(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        liveAnalysis={liveAnalysis}
        onFocusTreeItem={onFocus}
      />,
    );

    expect(screen.queryByRole("heading", { name: "トピック" })).toBeNull();
    expect(screen.queryByText("次回リリースの範囲")).toBeNull();
    expect(screen.getByRole("heading", { name: "カードの更新" }).className).toContain(
      "text-[16px]",
    );
    expect(await screen.findByText("追加")).not.toBeNull();
    const updateCard = screen.getByText("todo-1").closest("article");
    expect(updateCard).not.toBeNull();
    expect(updateCard?.className).toContain("rounded-(--ds-radius-control)");
    expect(updateCard?.getAttribute("data-node-kind")).toBe("todo");
    expect(updateCard?.style.background).toBe(
      "color-mix(in srgb, var(--badge-action-bg) 55%, var(--node-bg))",
    );
    expect(updateCard?.style.borderColor).toBe(
      "color-mix(in srgb, var(--badge-action-fg) 35%, transparent)",
    );
    fireEvent.click(screen.getByRole("button", { name: "議論ツリーで「todo-1」を表示" }));
    expect(onFocus).toHaveBeenCalledWith("todo-1");
    expect(screen.queryByRole("heading", { name: "要点" })).toBeNull();
    expect(screen.queryByText("対象機能を絞る")).toBeNull();
    expect(screen.queryByText("公開日を確認する")).toBeNull();
    expect(screen.queryByText("進行中")).toBeNull();
    expect(screen.queryByText("論点・リスク・次の一手")).toBeNull();
  });

  it("uses the matching discussion-node color for focusable issue updates", async () => {
    const issue = item("issue-1", "issue", "open");
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 1,
      payload: {
        items: [issue],
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            { id: issue.id, kind: "issue", parentId: "root", label: issue.title },
          ],
          edges: [],
        },
      },
    };

    render(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        liveAnalysis={liveAnalysis}
        onFocusTreeItem={() => undefined}
      />,
    );

    const updateCard = await screen.findByRole("button", {
      name: `議論ツリーで「${issue.title}」を表示`,
    });
    expect(updateCard.getAttribute("data-node-kind")).toBe("issue");
    expect(updateCard.style.background).toBe(
      "color-mix(in srgb, var(--tag-idea-bg) 55%, var(--node-bg))",
    );
    expect(updateCard.style.borderColor).toBe(
      "color-mix(in srgb, var(--tag-idea-fg) 35%, transparent)",
    );
    expect(updateCard.style.outlineColor).toBe("var(--tag-idea-fg)");
    expect(within(updateCard).queryByText("ツリーで表示")).toBeNull();
  });

  it("labels cards that left the latest analysis as excluded", async () => {
    const removedItem = item("issue-removed", "issue", "open");
    const analysis = (version: number, items: AnalysisItem[]): MeetingAIAnalysis => ({
      analysisType: "live",
      status: "completed",
      version,
      payload: { items, tree: { nodes: [], edges: [] } },
    });
    const view = render(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        liveAnalysis={analysis(1, [removedItem])}
      />,
    );

    expect(await screen.findByText(removedItem.title)).not.toBeNull();
    view.rerender(
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} liveAnalysis={analysis(2, [])} />,
    );

    expect(await screen.findByText("除外")).not.toBeNull();
    expect(screen.queryByText("非表示")).toBeNull();
  });

  it("shows elapsed time, human-readable agenda names, and card field changes", async () => {
    const firstItem: AnalysisItem = {
      ...item("todo-agenda", "todo", "open"),
      title: "agenda-1 の確認",
      body: "agenda-1 の資料を確認する",
      evidenceSequenceNos: [2],
      relatedAgendaIds: ["agenda-1"],
    };
    const analysis = (version: number, value: AnalysisItem): MeetingAIAnalysis => ({
      analysisType: "live",
      status: "completed",
      version,
      updatedAtUtc: `2026-07-21T10:0${version}:00Z`,
      payload: {
        summary: "agenda-1 の資料を確認する。",
        items: [value],
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            { id: "agenda-1", kind: "topic", parentId: "root", label: "予算計画" },
            { id: value.id, kind: "todo", parentId: "agenda-1", label: value.title },
          ],
          edges: [],
        },
        agendaAnchors: [
          {
            agendaId: "agenda-1",
            originalTitle: "予算計画",
            status: "discussed",
            materializedTopicIds: [],
          },
        ],
      },
    });
    const segments = [
      {
        meeting_id: "meeting-1",
        seq: 2,
        segment_id: "segment-2",
        speaker_label: "佐藤",
        text: "資料を確認します",
        start_ms: 125_000,
        end_ms: 130_000,
        created_at: "2026-07-21T10:01:00Z",
      },
    ];

    const view = render(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        segments={segments}
        liveAnalysis={analysis(1, firstItem)}
      />,
    );

    expect(await screen.findByText("予算計画 の確認")).not.toBeNull();
    expect(screen.getAllByText("経過 02:05").length).toBeGreaterThan(0);
    expect(screen.queryByText(/agenda-1/)).toBeNull();

    view.rerender(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        segments={segments}
        liveAnalysis={analysis(2, {
          ...firstItem,
          body: "予算上限を確認し、資料を更新する",
          status: "resolved",
        })}
      />,
    );

    expect(await screen.findByText("未解決")).not.toBeNull();
    expect(screen.getAllByText("解決済").length).toBeGreaterThan(1);
    expect(screen.getByText("予算上限を確認し、資料を更新する")).not.toBeNull();
  });

  it("shows the agenda progress section on the live tab when the payload carries agendaProgress", () => {
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 4,
      payload: {
        items: [],
        tree: { nodes: [], edges: [] },
        agendaProgress: {
          effectiveCurrentTopicId: "agenda-1",
          entries: [
            {
              id: "agenda-1",
              sourceType: "fixed_agenda",
              title: "改修案を決める",
              computedStatus: "discussing",
              effectiveStatus: "discussing",
              focusNodeIds: [],
              linkState: "not-linkable",
            },
          ],
        },
      },
    };
    render(
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} liveAnalysis={liveAnalysis} />,
    );

    expect(screen.getByRole("heading", { name: "話し合う項目" })).not.toBeNull();
    expect(screen.getByText("改修案を決める")).not.toBeNull();
  });

  it("keeps the live tab working for a legacy payload without agendaProgress (no crash, no entry sections)", () => {
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 1,
      payload: {
        summary: "対象機能を絞る。",
        items: [item("todo-legacy", "todo", "open")],
        tree: { nodes: [], edges: [] },
      },
    };
    render(
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} liveAnalysis={liveAnalysis} />,
    );

    expect(screen.queryByRole("heading", { name: "話し合う項目" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "会議中に追加された論点" })).toBeNull();
    // 既存のライブタブ表示(カードの更新)は従来どおり出る(回帰なし)。
    expect(screen.getByRole("heading", { name: "カードの更新" })).not.toBeNull();
    expect(screen.getByText("todo-legacy")).not.toBeNull();
  });

  it("shows only the latest four card updates and expands the rest via the load-more toggle", () => {
    const items = Array.from({ length: 5 }, (_, index) =>
      item(`todo-${index + 1}`, "todo", "open"),
    );
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 1,
      payload: { items, tree: { nodes: [], edges: [] } },
    };

    render(
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} liveAnalysis={liveAnalysis} />,
    );

    expect(screen.getAllByText("追加")).toHaveLength(4);
    const moreButton = screen.getByRole("button", { name: "もっと見る（残り1件）" });

    fireEvent.click(moreButton);
    expect(screen.getAllByText("追加")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "もっと見る（残り1件）" })).toBeNull();
    const floatingClose = screen.getByTestId("floating-card-history-close");
    expect(floatingClose.className).toContain("absolute");
    expect(floatingClose.className).toContain("bottom-0");
    expect(within(floatingClose).getByRole("button", { name: "閉じる" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getAllByText("追加")).toHaveLength(4);
    expect(screen.queryByTestId("floating-card-history-close")).toBeNull();
  });

  it("hides the card-update section and the pre-analysis empty state when showLiveUpdates is false, keeping agenda progress", () => {
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 1,
      payload: {
        items: [item("todo-1", "todo", "open")],
        tree: { nodes: [], edges: [] },
        agendaProgress: {
          effectiveCurrentTopicId: "agenda-1",
          entries: [
            {
              id: "agenda-1",
              sourceType: "fixed_agenda",
              title: "改修案を決める",
              computedStatus: "discussing",
              effectiveStatus: "discussing",
              focusNodeIds: [],
              linkState: "not-linkable",
            },
          ],
        },
      },
    };
    render(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        liveAnalysis={liveAnalysis}
        showLiveUpdates={false}
      />,
    );

    expect(screen.queryByRole("heading", { name: "カードの更新" })).toBeNull();
    expect(screen.getByRole("heading", { name: "話し合う項目" })).not.toBeNull();
    expect(screen.getByText("改修案を決める")).not.toBeNull();
  });

  it("hides the pre-analysis empty state when showLiveUpdates is false and no live analysis has arrived yet", () => {
    render(<MeetingAssistantPanel insights={[]} speakerSummaries={[]} showLiveUpdates={false} />);

    expect(screen.queryByText("ライブ分析を待っています")).toBeNull();
  });

  it("rebuilds LiveUpdateBatch[] from liveHistory as per-version diffs, newest batch first", () => {
    const v1Items = [item("todo-1", "todo", "open")];
    const v2Items = [item("todo-1", "todo", "open"), item("risk-1", "risk", "open")];
    const liveHistory: MeetingAIAnalysis[] = [
      {
        analysisType: "live",
        status: "completed",
        version: 1,
        updatedAtUtc: "2026-07-23T00:00:01Z",
        payload: { items: v1Items, tree: { nodes: [], edges: [] } },
      },
      {
        analysisType: "live",
        status: "completed",
        version: 2,
        updatedAtUtc: "2026-07-23T00:00:02Z",
        payload: { items: v2Items, tree: { nodes: [], edges: [] } },
      },
    ];

    const batches = buildLiveCardUpdateHistoryFromLiveHistory(liveHistory, new Map());

    expect(batches).toHaveLength(2);
    // 最新版(version 2)が先頭。前版(version 1)との差分なので risk-1 のみ追加扱い。
    expect(batches[0].updatedAtUtc).toBe("2026-07-23T00:00:02Z");
    expect(batches[0].changes).toHaveLength(1);
    expect(batches[0].changes[0]).toMatchObject({ itemId: "risk-1", action: "added" });
    // 先頭版(version 1)は直前版が無いので空配列との差分 = 全件追加扱い。
    expect(batches[1].updatedAtUtc).toBe("2026-07-23T00:00:01Z");
    expect(batches[1].changes).toHaveLength(1);
    expect(batches[1].changes[0]).toMatchObject({ itemId: "todo-1", action: "added" });
  });

  it("shows the card-update section when showLiveUpdates is false but liveHistory has completed versions", () => {
    const liveHistory: MeetingAIAnalysis[] = [
      {
        analysisType: "live",
        status: "completed",
        version: 1,
        payload: { items: [item("todo-1", "todo", "open")], tree: { nodes: [], edges: [] } },
      },
    ];
    const liveAnalysis = liveHistory[0];

    render(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        liveAnalysis={liveAnalysis}
        liveHistory={liveHistory}
        showLiveUpdates={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "カードの更新" })).not.toBeNull();
    expect(screen.getByText("todo-1")).not.toBeNull();
    expect(screen.getByText("追加")).not.toBeNull();
  });

  it("shows the live update time beside the card-update heading during a meeting and hides it on the review screen", () => {
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 1,
      updatedAtUtc: new Date().toISOString(),
      payload: { items: [item("todo-1", "todo", "open")], tree: { nodes: [], edges: [] } },
    };

    const view = render(
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} liveAnalysis={liveAnalysis} />,
    );
    expect(screen.getByText("たった今 更新")).not.toBeNull();

    view.rerender(
      <MeetingAssistantPanel
        insights={[]}
        speakerSummaries={[]}
        liveAnalysis={liveAnalysis}
        liveHistory={[liveAnalysis]}
        showLiveUpdates={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "カードの更新" })).not.toBeNull();
    expect(screen.queryByText("たった今 更新")).toBeNull();
  });
});
