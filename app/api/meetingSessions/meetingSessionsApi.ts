export type MeetingSessionStatus =
  | "pending_join"
  | "command_sent"
  | "joining"
  | "joined"
  | "recording"
  | "ended"
  | "failed";

export type MeetingSessionDto = {
  sessionId: string;
  status: MeetingSessionStatus;
};

const MEETING_SESSIONS_PATH = "/api/v1/meeting-sessions";
const meetingSessionStatuses: MeetingSessionStatus[] = [
  "pending_join",
  "command_sent",
  "joining",
  "joined",
  "recording",
  "ended",
  "failed",
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
  return { sessionId, status };
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
