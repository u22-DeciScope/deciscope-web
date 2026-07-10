import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createMeetingJoinToken: vi.fn(),
}));

vi.mock("~/api/meetings/meetingsApi", () => ({
  createMeetingJoinToken: api.createMeetingJoinToken,
}));

import { MeetingReportShareAction } from "~/components/meeting/summary/MeetingReportShareAction";

describe("MeetingReportShareAction", () => {
  beforeEach(() => {
    api.createMeetingJoinToken.mockReset();
  });

  it("shows a user-facing error when sharing fails", async () => {
    api.createMeetingJoinToken.mockRejectedValue(new Error("temporary failure"));
    render(<MeetingReportShareAction meetingId="meeting-1" onToken={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "共有" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("共有リンクを作成できませんでした");
    });
  });
});
