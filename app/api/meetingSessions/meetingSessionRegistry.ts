import type {
  MeetingSessionDto,
  MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";

const storageKey = "deciscope:meetingSessions:v1";
const legacyLastSessionStorageKey = "deciscope:lastSessionId";

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

type MeetingSessionRecordInput = {
  sessionId: string;
  workspaceId: string;
  meetingId?: string | null;
  title?: string;
  titleSource?: string | null;
  status: MeetingSessionStatus;
  createdAt?: string;
  updatedAt?: string;
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

export function upsertMeetingSessionRecord(input: MeetingSessionRecordInput) {
  const sessionId = input.sessionId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!sessionId || !workspaceId) {
    return;
  }

  const now = new Date().toISOString();
  const records = readRecords();
  const index = records.findIndex((record) => record.sessionId === sessionId);
  const previous = index >= 0 ? records[index] : null;
  const next: MeetingSessionRecord = {
    sessionId,
    workspaceId,
    meetingId: input.meetingId ?? previous?.meetingId ?? null,
    title: getMeetingDisplayTitle(
      {
        sessionId,
        title: input.title?.trim() || previous?.title || null,
        titleSource: input.titleSource ?? previous?.titleSource ?? null,
      },
      { component: "meeting-session-registry" },
    ),
    titleSource: input.titleSource ?? previous?.titleSource ?? null,
    status: input.status,
    createdAt: input.createdAt ?? previous?.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    endedAt: input.endedAt ?? previous?.endedAt ?? null,
  };

  if (index >= 0) {
    records[index] = next;
  } else {
    records.push(next);
  }

  writeRecords(records);
  writeLegacyLastSession(sessionId);
}

export function updateMeetingSessionRecordStatus(
  workspaceId: string,
  sessionId: string,
  status: MeetingSessionStatus,
  details?: {
    title?: string;
    titleSource?: string | null;
    createdAt?: string;
    updatedAt?: string;
    endedAt?: string | null;
  },
) {
  const existing = findMeetingSessionRecord(workspaceId, sessionId);
  upsertMeetingSessionRecord({
    sessionId,
    workspaceId,
    meetingId: existing?.meetingId ?? null,
    title: details?.title ?? existing?.title,
    titleSource: details?.titleSource ?? existing?.titleSource ?? null,
    status,
    createdAt: details?.createdAt,
    updatedAt: details?.updatedAt,
    endedAt: details?.endedAt,
  });
}

export function updateMeetingSessionRecordFromDto(workspaceId: string, session: MeetingSessionDto) {
  updateMeetingSessionRecordStatus(workspaceId, session.sessionId, session.status, {
    title: session.title,
    titleSource: session.titleSource ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt ?? null,
  });
}

export function deleteMeetingSessionRecord(sessionId: string) {
  const target = sessionId.trim();
  if (!target) {
    return;
  }
  writeRecords(readRecords().filter((record) => record.sessionId !== target));
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

function writeRecords(records: MeetingSessionRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const unique = new Map<string, MeetingSessionRecord>();
    for (const record of records) {
      unique.set(record.sessionId, record);
    }
    window.localStorage.setItem(storageKey, JSON.stringify([...unique.values()].slice(-30)));
  } catch {
    // localStorageが使えない環境では、永続化せずに画面表示を継続する。
  }
}

function writeLegacyLastSession(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(legacyLastSessionStorageKey, sessionId);
  } catch {
    // localStorageが使えない環境では、旧キーへの保存を省略する。
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
