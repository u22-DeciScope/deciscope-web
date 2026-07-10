import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MeetingEndAction } from "~/components/meeting/parts/MeetingEndAction";

describe("MeetingEndAction", () => {
  it("does not invoke the end API callback before confirmation", () => {
    const onConfirm = vi.fn();
    render(<MeetingEndAction disabled={false} isEnding={false} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "終了" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Botが退出し、文字起こしを停止/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "会議を終了" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
