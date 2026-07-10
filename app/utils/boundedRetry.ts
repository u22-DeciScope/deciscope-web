export function boundedRetryDelay(delaysMs: readonly number[], consecutiveFailureCount: number) {
  return delaysMs[consecutiveFailureCount] ?? null;
}
