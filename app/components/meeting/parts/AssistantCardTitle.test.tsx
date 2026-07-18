import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssistantCardTitle, truncateCardTitle } from "./AssistantCardTitle";

describe("AssistantCardTitle", () => {
  it("truncates by grapheme and keeps the full accessible title", () => {
    const full = `${"長いカードタイトルの内容".repeat(5)}👨‍👩‍👧‍👦`;
    const shortened = truncateCardTitle(full, 12);
    expect(shortened.endsWith("……")).toBe(true);
    expect(shortened).not.toContain("\uFFFD");
    render(<AssistantCardTitle title={full} />);
    const heading = screen.getByRole("heading", { name: full });
    expect(heading.getAttribute("title")).toBe(full);
    expect(heading.textContent?.endsWith("……")).toBe(true);
  });
});
