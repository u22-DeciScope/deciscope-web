import { describe, expect, it } from "vitest";

import { meetingEndPresentation } from "./meetingEndPresentation";

describe("meeting end presentation", () => {
  it("keeps the workspace visible while finalization is running", () => {
    expect(meetingEndPresentation(true, false)).toEqual({
      finalizingNotice: "会議を終了しています。最後の文字起こしとAI分析を整理しています。",
      showBlockingCompletionModal: false,
    });
  });

  it("shows the completion modal only after finalization has ended", () => {
    expect(meetingEndPresentation(false, true)).toEqual({
      finalizingNotice: null,
      showBlockingCompletionModal: true,
    });
  });
});
