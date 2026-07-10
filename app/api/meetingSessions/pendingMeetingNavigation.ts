const pendingMeetingNavigationStorageKey = "deciscope:pendingMeetingNavigation:v1";
const pendingMeetingNavigationTtlMs = 5 * 60 * 1000;

export type PendingMeetingNavigation = {
  workspaceId: string;
  sessionId: string;
  path: string;
  createdAt: string;
};

export function savePendingMeetingNavigation(input: {
  workspaceId: string;
  sessionId: string;
  path: string;
}) {
  if (typeof window === "undefined") {
    return;
  }
  const pending: PendingMeetingNavigation = {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    path: input.path,
    createdAt: new Date().toISOString(),
  };
  try {
    window.sessionStorage.setItem(pendingMeetingNavigationStorageKey, JSON.stringify(pending));
  } catch {
    // Continue without recovery if sessionStorage is unavailable.
  }
}

export function readPendingMeetingNavigation(workspaceId: string): PendingMeetingNavigation | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(pendingMeetingNavigationStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PendingMeetingNavigation>;
    if (
      typeof parsed.workspaceId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.path !== "string" ||
      typeof parsed.createdAt !== "string" ||
      parsed.workspaceId !== workspaceId
    ) {
      return null;
    }
    const createdAt = Date.parse(parsed.createdAt);
    if (Number.isNaN(createdAt) || Date.now() - createdAt > pendingMeetingNavigationTtlMs) {
      clearPendingMeetingNavigation();
      return null;
    }
    return parsed as PendingMeetingNavigation;
  } catch {
    return null;
  }
}

export function clearPendingMeetingNavigation(workspaceId?: string, sessionId?: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (workspaceId && sessionId) {
      const pending = readPendingMeetingNavigation(workspaceId);
      if (!pending || pending.sessionId !== sessionId) {
        return;
      }
    }
    window.sessionStorage.removeItem(pendingMeetingNavigationStorageKey);
  } catch {
    // Nothing to clear.
  }
}
