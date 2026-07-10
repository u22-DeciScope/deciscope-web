import { ApiError } from "~/api/core/apiClient";

export const realtimeReconnectDelaysMs = [1000, 2000, 5000, 10000, 20000] as const;
export const realtimeHealthProbeAttempt = 3;
export const realtimeMaxReconnectAttempts = 6;

const permanentWebSocketCloseCodes = new Set([1008, 4001, 4003, 4401, 4403]);

export type RealtimeRecoveryDecision =
  | { action: "stop"; reason: "permanent" | "exhausted" }
  | { action: "retry"; delayMs: number; probe: boolean };

export function realtimeRecoveryDecision(
  failedAttempt: number,
  closeCode: number,
): RealtimeRecoveryDecision {
  if (permanentWebSocketCloseCodes.has(closeCode)) {
    return { action: "stop", reason: "permanent" };
  }
  if (failedAttempt >= realtimeMaxReconnectAttempts) {
    return { action: "stop", reason: "exhausted" };
  }
  return {
    action: "retry",
    delayMs:
      realtimeReconnectDelaysMs[
        Math.min(Math.max(0, failedAttempt - 1), realtimeReconnectDelaysMs.length - 1)
      ],
    probe: failedAttempt === realtimeHealthProbeAttempt,
  };
}

export function isPermanentRealtimeApiError(cause: unknown) {
  return cause instanceof ApiError && [401, 403, 404].includes(cause.status);
}
