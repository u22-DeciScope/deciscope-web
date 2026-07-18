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
  it("uses the short open issue label everywhere", () => {
    expect(analysisKindLabel("open_issue")).toBe("未解決");
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

  it("renders attribute tabs without question UI and hides priority on decision/resolved", () => {
    const values = [
      item("risk-card", "risk", "open"),
      item("question-card", "question", "open"),
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
    expect(screen.queryByText("質問")).toBeNull();
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

  it("renders a plain topic and one card per key point without an in-progress section", () => {
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

    expect(screen.getByRole("heading", { name: "トピック" })).not.toBeNull();
    expect(screen.getByText("次回リリースの範囲").className).not.toContain("rounded-full");
    expect(screen.getByRole("heading", { name: "要点" })).not.toBeNull();
    expect(screen.getByText("対象機能を絞る").closest("article")).not.toBeNull();
    expect(screen.getByText("公開日を確認する").closest("article")).not.toBeNull();
    expect(screen.queryByText("進行中")).toBeNull();
  });
});
