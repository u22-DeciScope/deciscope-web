import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import PublicSampleMeetingPage from "~/components/landing/pages/PublicSampleMeetingPage";

const { finalSummarySpy, reviewWorkspaceSpy } = vi.hoisted(() => ({
  finalSummarySpy: vi.fn(),
  reviewWorkspaceSpy: vi.fn(),
}));

vi.mock("~/components/BrandLogo", () => ({
  BrandLogo: () => <span>Deciscope</span>,
}));
vi.mock("~/components/meeting/summary/SessionSummaryHeader", () => ({
  SessionSummaryHeader: () => <div>会議概要</div>,
}));
vi.mock("~/components/meeting/summary/AiFinalSummaryPanel", () => ({
  AiFinalSummaryPanel: (props: unknown) => {
    finalSummarySpy(props);
    return <div>AI最終要約</div>;
  },
}));
vi.mock("~/components/meeting/summary/PreMeetingContextPanel", () => ({
  PreMeetingContextPanel: () => <div>会議前コンテキスト</div>,
}));
vi.mock("~/components/meeting/summary/SessionReviewWorkspace", () => ({
  SessionReviewWorkspace: (props: unknown) => {
    reviewWorkspaceSpy(props);
    return <div>会議履歴ワークスペース</div>;
  },
}));

describe("PublicSampleMeetingPage", () => {
  it("matches the meeting-history layout and supplies live update history", () => {
    render(
      <MemoryRouter>
        <PublicSampleMeetingPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("会議後に残る記録を、そのまま体験できます")).toBeNull();
    expect(
      screen.queryByText(
        "このページは公開用の固定サンプルで、ワークスペース内の会議データには接続しません。",
      ),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "トップへ戻る" })).toBeNull();
    expect(screen.queryByRole("link", { name: "無料ではじめる" })).toBeNull();
    expect(screen.getByText("会議概要")).toBeTruthy();
    expect(screen.getByText("AI最終要約")).toBeTruthy();
    expect(screen.getByText("会議履歴ワークスペース")).toBeTruthy();
    expect(screen.getByTestId("public-sample-review-workspace").className).toContain(
      "lg:h-[calc(100dvh-6rem)]",
    );
    expect(reviewWorkspaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session_public_sample",
        liveHistory: expect.arrayContaining([
          expect.objectContaining({ analysisType: "live", version: 3 }),
          expect.objectContaining({ analysisType: "live", version: 8 }),
        ]),
      }),
    );
    expect(finalSummarySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ kind: "completed" }),
      }),
    );
  });
});
