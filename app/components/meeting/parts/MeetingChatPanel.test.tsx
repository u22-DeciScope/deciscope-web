import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MeetingChatPanel } from "./MeetingChatPanel";

describe("MeetingChatPanel header", () => {
  it("omits the explanatory subtitle", () => {
    render(<MeetingChatPanel partials={[]} segments={[]} />);

    expect(screen.getByText("タイムライン")).not.toBeNull();
    expect(screen.queryByText("リアルタイム発言ログ")).toBeNull();
  });
});
