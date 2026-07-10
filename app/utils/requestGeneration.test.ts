import { describe, expect, it } from "vitest";

import { RequestGeneration } from "~/utils/requestGeneration";

describe("RequestGeneration", () => {
  it("rejects a response from the workspace request that was superseded", () => {
    const requests = new RequestGeneration();
    const workspaceA = requests.begin();
    const workspaceB = requests.begin();

    expect(requests.isCurrent(workspaceA)).toBe(false);
    expect(requests.isCurrent(workspaceB)).toBe(true);
  });
});
