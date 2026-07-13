import { describe, expect, it } from "vitest";

import {
  isMeetingSessionStatus,
  isTerminalMeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";

describe("meeting session status vocabulary", () => {
  it("endingを既知のstatusとして受理する(unknownへ丸めない)", () => {
    expect(isMeetingSessionStatus("ending")).toBe(true);
  });

  it("endingはterminalではない(endedへ変換してはいけない)", () => {
    expect(isTerminalMeetingSessionStatus("ending")).toBe(false);
  });

  it("terminal状態の判定は従来どおり", () => {
    for (const status of ["ended", "failed", "stale", "timeout"] as const) {
      expect(isTerminalMeetingSessionStatus(status)).toBe(true);
    }
    expect(isTerminalMeetingSessionStatus("recording")).toBe(false);
  });
});
