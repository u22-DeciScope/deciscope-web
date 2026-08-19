import { describe, expect, it } from "vitest";

import { humanizeAgendaReferences } from "./meetingDisplayMetadata";

describe("humanizeAgendaReferences", () => {
  it("uses display labels for known agenda references", () => {
    const labels = new Map([["agenda-1", "試験導入の対象部署"]]);
    expect(humanizeAgendaReferences("agenda-1 の確認", labels)).toBe("試験導入の対象部署 の確認");
  });

  it("never exposes internal identifiers without a display label", () => {
    const labels = new Map<string, string>();
    for (const value of [
      "action-summary-fallback",
      "topic-agenda-deadbeef",
      "agenda-deadbeef",
      "item-todo-deadbeef",
      "candidate-deadbeef",
      "projection-fallback",
    ]) {
      expect(humanizeAgendaReferences(value, labels)).toBe("");
    }
    expect(humanizeAgendaReferences("確認対象: item-todo-deadbeef", labels)).toBe("確認対象:");
  });
});
