import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import LandingPage from "~/components/landing/pages/LandingPage";

vi.mock("~/components/landing/parts/PhaseTimeline", () => ({
  PhaseTimeline: () => <div data-testid="phase-timeline" />,
}));
vi.mock("~/components/landing/parts/TranscriptToTreeFigure", () => ({
  TranscriptToTreeFigure: () => <div data-testid="transcript-tree" />,
}));
vi.mock("~/components/landing/parts/WorkspaceColumns", () => ({
  WorkspaceColumns: () => <div data-testid="workspace-columns" />,
}));

describe("LandingPage", () => {
  it("offers the unauthenticated meeting-history sample beside the workspace preview", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: /サンプル会議の履歴を見る/ });
    expect(link.getAttribute("href")).toBe("/sample-meeting");
    expect(link.parentElement?.className).toContain("mx-auto");
    expect(link.parentElement?.className).toContain("w-fit");
    expect(screen.getByText("会議後の履歴画面を、より詳しく確認できます")).toBeTruthy();
    expect(screen.getByTestId("workspace-columns")).toBeTruthy();
  });
});
