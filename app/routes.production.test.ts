import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production route exposure", () => {
  it("does not register test/debug routes or reference the browser shared transcript token", () => {
    const routes = readFileSync("app/routes.ts", "utf8");
    const transcriptApi = readFileSync("app/api/transcripts/transcriptSegmentsApi.ts", "utf8");
    const firebaseAuth = readFileSync("app/api/firebase/firebaseAuthClient.ts", "utf8");

    expect(routes).not.toContain('route("test"');
    expect(routes).not.toContain('route("debug/');
    expect(transcriptApi).not.toContain("VITE_DECISCOPE_WS_CLIENT_TOKEN");
    expect(firebaseAuth).not.toContain("import.meta.env[");
  });
});
