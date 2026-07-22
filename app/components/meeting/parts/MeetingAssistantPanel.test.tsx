import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { AnalysisItem } from "~/api/meetings/meetingRuntimeTypes";
import { analysisKindLabel } from "~/components/meeting/parts/analysisKindPalette";
import {
  filterForInsightItem,
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
    expect(issueTab.className).toContain("min-w-0");

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

  it("renders card updates and key points without the removed topic section", async () => {
    const liveAnalysis: MeetingAIAnalysis = {
      analysisType: "live",
      status: "completed",
      version: 2,
      payload: {
        currentTopic: "次回リリースの範囲",
        summary: "対象機能を絞る。公開日を確認する。",
        items: [item("todo-1", "todo", "open")],
        tree: { nodes: [], edges: [] },
      },
    };

    render(
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} liveAnalysis={liveAnalysis} />,
    );

    expect(screen.queryByRole("heading", { name: "トピック" })).toBeNull();
    expect(screen.queryByText("次回リリースの範囲")).toBeNull();
    expect(screen.getByRole("heading", { name: "カードの更新" })).not.toBeNull();
    expect(await screen.findByText("追加")).not.toBeNull();
    expect(screen.getByText("todo-1")).not.toBeNull();
    const keyPointCard = screen.getByText("対象機能を絞る").closest("article");
    expect(screen.getByRole("heading", { name: "要点" })).not.toBeNull();
    expect(keyPointCard).not.toBeNull();
    expect(keyPointCard?.className).toContain("text-[13px]");
    expect(screen.getByText("公開日を確認する").closest("article")).not.toBeNull();
    expect(screen.queryByText("進行中")).toBeNull();
    expect(screen.queryByText("論点・リスク・次の一手")).toBeNull();
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
    expect(screen.getByText("予算計画 の資料を確認する")).not.toBeNull();
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
    // 既存のライブタブ表示(カードの更新・要点)は従来どおり出る(回帰なし)。
    expect(screen.getByRole("heading", { name: "カードの更新" })).not.toBeNull();
    expect(screen.getByText("todo-legacy")).not.toBeNull();
  });
});
