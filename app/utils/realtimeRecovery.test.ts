import { describe, expect, it } from "vitest";

import { ApiError } from "~/api/core/apiClient";
import {
  isPermanentRealtimeApiError,
  realtimeMaxReconnectAttempts,
  realtimeRecoveryDecision,
} from "~/utils/realtimeRecovery";

describe("realtime recovery policy", () => {
  it("uses exponential retries and probes health after repeated failures", () => {
    expect(realtimeRecoveryDecision(1, 1006)).toEqual({
      action: "retry",
      delayMs: 1000,
      probe: false,
    });
    expect(realtimeRecoveryDecision(3, 1006)).toEqual({
      action: "retry",
      delayMs: 5000,
      probe: true,
    });
  });

  it("does not retry forever for policy/auth failures or after the retry limit", () => {
    expect(realtimeRecoveryDecision(1, 1008)).toEqual({
      action: "stop",
      reason: "permanent",
    });
    expect(realtimeRecoveryDecision(realtimeMaxReconnectAttempts, 1006)).toEqual({
      action: "stop",
      reason: "exhausted",
    });
    expect(isPermanentRealtimeApiError(new ApiError("unauthorized", 401))).toBe(true);
    expect(isPermanentRealtimeApiError(new ApiError("server error", 500))).toBe(false);
  });
});
