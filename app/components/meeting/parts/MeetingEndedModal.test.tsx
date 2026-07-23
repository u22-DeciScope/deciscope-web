import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MeetingEndedModal } from "./MeetingEndedModal";

describe("MeetingEndedModal", () => {
  it("shows the original blocking progress dialog while the meeting is ending", () => {
    render(<MeetingEndedModal mode="ending" onGoHome={vi.fn()} onGoSummary={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "会議を終了しています" })).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: "会議の終了処理中" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "メイン画面へ戻る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "会議詳細を見る" })).toBeNull();
  });

  it("shows navigation actions after the meeting has ended", () => {
    const onGoHome = vi.fn();
    const onGoSummary = vi.fn();
    render(<MeetingEndedModal mode="ended" onGoHome={onGoHome} onGoSummary={onGoSummary} />);

    expect(screen.getByRole("heading", { name: "会議が終了しました" })).not.toBeNull();
    expect(screen.queryByRole("progressbar", { name: "会議の終了処理中" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "メイン画面へ戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "会議詳細を見る" }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
    expect(onGoSummary).toHaveBeenCalledTimes(1);
  });
});
