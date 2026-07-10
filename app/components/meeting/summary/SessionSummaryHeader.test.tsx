import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SessionSummaryHeader } from "~/components/meeting/summary/SessionSummaryHeader";
import type { MeetingSummaryViewModel } from "~/components/meeting/summary/meetingSummaryTypes";

const summary: MeetingSummaryViewModel = {
  title: "週次レビュー",
  statusLabel: "終了",
  dateRange: "7月10日 10:00 - 7月10日 11:00",
  duration: "60分",
  aiSummary: "最終分析から作られた短縮要約",
  decisions: [],
  actions: [],
  participants: [],
};

describe("SessionSummaryHeader", () => {
  it("会議情報だけを表示し、重複するAIサマリーを表示しない", () => {
    render(<SessionSummaryHeader summary={summary} />);

    expect(screen.getByRole("heading", { name: "週次レビュー" })).toBeTruthy();
    expect(screen.getByText("終了")).toBeTruthy();
    expect(screen.getByText("60分")).toBeTruthy();
    expect(screen.queryByText("AI サマリー")).toBeNull();
    expect(screen.queryByText(summary.aiSummary)).toBeNull();
  });
});
