export type MeetingSessionStatus =
  | "requested"
  | "pending_join"
  | "command_sent"
  | "joining"
  | "joined"
  | "active"
  | "recording"
  | "ended"
  | "failed"
  | "stale"
  | "timeout";

export type MeetingSessionDto = {
  sessionId: string;
  status: MeetingSessionStatus;
  meetingUrlHash?: string;
  reused?: boolean;
  botCallId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastError?: string;
};

const MEETING_SESSIONS_PATH = "/api/v1/meeting-sessions";
const meetingSessionStatuses: MeetingSessionStatus[] = [
  "requested",
  "pending_join",
  "command_sent",
  "joining",
  "joined",
  "active",
  "recording",
  "ended",
  "failed",
  "stale",
  "timeout",
];

export async function createMeetingSession(joinUrl: string): Promise<MeetingSessionDto> {
  const response = await fetch(apiUrl(MEETING_SESSIONS_PATH), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ joinUrl }),
  });

  const payload = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(
      errorMessageFromPayload(payload) || `${response.status} ${response.statusText}`,
    );
  }

  const session = normalizeMeetingSession(payload);
  if (!session) {
    throw new Error("Go APIの会議セッション作成レスポンスを解析できませんでした。");
  }
  return session;
}

export async function getMeetingSession(sessionId: string): Promise<MeetingSessionDto> {
  const response = await fetch(
    apiUrl(`${MEETING_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`),
    {
      headers: { Accept: "application/json" },
      credentials: "include",
    },
  );

  const payload = await readJsonBody(response);
  if (!response.ok) {
    throw new Error(
      errorMessageFromPayload(payload) || `${response.status} ${response.statusText}`,
    );
  }

  const session = normalizeMeetingSession(payload);
  if (!session) {
    throw new Error("Go APIの会議セッション取得レスポンスを解析できませんでした。");
  }
  return session;
}

export function isMeetingSessionStatus(value: unknown): value is MeetingSessionStatus {
  return (
    typeof value === "string" && meetingSessionStatuses.includes(value as MeetingSessionStatus)
  );
}

function normalizeMeetingSession(value: unknown): MeetingSessionDto | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const status = source.status;
  if (!sessionId || !isMeetingSessionStatus(status)) {
    return null;
  }
  const meetingUrlHash =
    optionalString(source.meetingUrlHash) ??
    optionalString(source.meeting_url_hash) ??
    optionalString(source.joinUrlHash) ??
    optionalString(source.join_url_hash);
  const botCallId = optionalString(source.botCallId) ?? optionalString(source.bot_call_id);
  const createdAt = optionalString(source.createdAt) ?? optionalString(source.created_at);
  const updatedAt = optionalString(source.updatedAt) ?? optionalString(source.updated_at);
  const lastError = optionalString(source.lastError) ?? optionalString(source.last_error);
  return {
    sessionId,
    status,
    ...(meetingUrlHash ? { meetingUrlHash } : {}),
    ...(typeof source.reused === "boolean" ? { reused: source.reused } : {}),
    ...(botCallId ? { botCallId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

async function readJsonBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessageFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const body = payload as Record<string, unknown>;
  const nestedError = body.error;
  if (nestedError && typeof nestedError === "object") {
    const message = optionalString((nestedError as Record<string, unknown>).message);
    if (message) {
      return message;
    }
  }
  return optionalString(body.message) ?? optionalString(body.error) ?? null;
}

function apiUrl(path: string) {
  const configured = String(import.meta.env.VITE_DECISCOPE_API_BASE_URL ?? "").trim();
  return new URL(path, configured || browserOrigin()).toString();
}

function browserOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:5193";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
