import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production route exposure", () => {
  it("does not register /test or reference the browser shared transcript token", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const transcriptApi = readFileSync("app/api/transcripts/transcriptSegmentsApi.ts", "utf8");
    const firebaseAuth = readFileSync("app/api/firebase/firebaseAuthClient.ts", "utf8");

    expect(routes).toContain('route("sample-meeting", "routes/sample-meeting.tsx")');
    expect(routes).not.toContain('route("test"');
    expect(transcriptApi).not.toContain("VITE_DECISCOPE_WS_CLIENT_TOKEN");
    expect(firebaseAuth).not.toContain("import.meta.env[");
  });
});
