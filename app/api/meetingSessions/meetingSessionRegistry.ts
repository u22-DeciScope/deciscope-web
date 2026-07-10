import type { MeetingSessionStatus } from "~/api/meetingSessions/meetingSessionsApi";

const storageKey = "deciscope:meetingSessions:v1";

export type MeetingSessionRecord = {
  sessionId: string;
  workspaceId: string;
  meetingId?: string | null;
  title: string;
  titleSource?: string | null;
  status: MeetingSessionStatus;
  createdAt: string;
  updatedAt: string;
  endedAt?: string | null;
};

export function listMeetingSessionRecords(workspaceId: string): MeetingSessionRecord[] {
  return readRecords()
    .filter((record) => record.workspaceId === workspaceId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function findMeetingSessionRecord(
  workspaceId: string,
  sessionIdOrMeetingId: string,
): MeetingSessionRecord | null {
  const target = sessionIdOrMeetingId.trim();
  if (!target) {
    return null;
  }
  return (
    listMeetingSessionRecords(workspaceId).find(
      (record) => record.sessionId === target || record.meetingId === target,
    ) ?? null
  );
}

export function isTerminalMeetingSessionStatus(status: string) {
  return (
    status === "ended" ||
    status === "completed" ||
    status === "finished" ||
    status === "failed" ||
    status === "stale" ||
    status === "timeout"
  );
}

function readRecords() {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isMeetingSessionRecord);
  } catch {
    return [];
  }
}

function isMeetingSessionRecord(value: unknown): value is MeetingSessionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<MeetingSessionRecord>;
  return (
    typeof record.sessionId === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.title === "string" &&
    typeof record.status === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}
