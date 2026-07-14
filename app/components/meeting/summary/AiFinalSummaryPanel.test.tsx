import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import { AiFinalSummaryPanel } from "~/components/meeting/summary/AiFinalSummaryPanel";

const final: MeetingAIAnalysis = {
  id: "analysis-1",
  meetingId: "meeting-1",
  analysisType: "final",
  status: "completed",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  payload: {
    overview: "重要な結論です。",
    decisions: [],
    actionItems: [],
    openIssues: [],
    keyPoints: [],
    nextMeetingTopics: [],
  },
} as unknown as MeetingAIAnalysis;

describe("AiFinalSummaryPanel", () => {
  it("要約と会議コンテキストを同じ重要結果エリアに表示する", () => {
    render(
      <AiFinalSummaryPanel
        final={final}
        contextPanel={<section>会議前コンテキスト</section>}
      />,
    );

    expect(screen.getByText("AI 最終要約")).toBeTruthy();
    expect(screen.getByText("会議前コンテキスト")).toBeTruthy();
  });
});
