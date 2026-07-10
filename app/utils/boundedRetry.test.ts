import { describe, expect, it } from "vitest";

import { boundedRetryDelay } from "~/utils/boundedRetry";

describe("boundedRetryDelay", () => {
  it("returns no delay after the configured retry budget is exhausted", () => {
    const delays = [2000, 5000, 10000];
    expect(boundedRetryDelay(delays, 0)).toBe(2000);
    expect(boundedRetryDelay(delays, 2)).toBe(10000);
    expect(boundedRetryDelay(delays, 3)).toBeNull();
  });
});
