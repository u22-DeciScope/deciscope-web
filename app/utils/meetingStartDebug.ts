export function meetingStartDebug(
  scope: string,
  message: string,
  details?: Record<string, unknown>,
) {
  if (!isMeetingStartDebugEnabled()) {
    return;
  }

  if (details) {
    console.debug(`[${scope}] ${message}`, details);
    return;
  }
  console.debug(`[${scope}] ${message}`);
}

export function isMeetingStartDebugEnabled() {
  const configured = String(import.meta.env.VITE_DECISCOPE_DEBUG_MEETING_START ?? "").toLowerCase();
  return configured === "true" || configured === "1";
}
