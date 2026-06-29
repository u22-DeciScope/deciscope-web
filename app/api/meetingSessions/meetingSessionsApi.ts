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
  title?: string;
  displayTitle?: string;
  titleSource?: string;
  titleUpdatedAt?: string;
  userProvidedTitle?: string;
  graphTitle?: string;
  provider?: string;
  externalMeetingId?: string;
  joinMeetingId?: string;
  joinWebUrl?: string;
  canonicalJoinWebUrl?: string;
  threadId?: string;
  organizerId?: string;
  organizerName?: string;
  organizerEmail?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  titleResolutionErrorCode?: string;
  titleResolutionErrorMessage?: string;
  titleResolvedAt?: string;
  status: MeetingSessionStatus;
  meetingUrlHash?: string;
  reused?: boolean;
  botCallId?: string;
  createdAt?: string;
  updatedAt?: string;
  endedAt?: string;
  endReason?: string;
  lastBotStatusAt?: string;
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

export type CreateMeetingSessionInput = {
  userProvidedTitle?: string;
  title?: string;
  candidateUserIds?: string[];
  candidateUserPrincipalNames?: string[];
  createdByMicrosoftUserId?: string;
  createdByEmail?: string;
  organizerUserId?: string;
};

export async function createMeetingSession(
  joinUrl: string,
  input: CreateMeetingSessionInput = {},
): Promise<MeetingSessionDto> {
  const userProvidedTitle = (input.userProvidedTitle ?? input.title)?.trim();
  const candidateUserIds =
    input.candidateUserIds?.map((value) => value.trim()).filter(Boolean) ?? [];
  const candidateUserPrincipalNames =
    input.candidateUserPrincipalNames?.map((value) => value.trim()).filter(Boolean) ?? [];
  const createdByMicrosoftUserId = input.createdByMicrosoftUserId?.trim();
  const createdByEmail = input.createdByEmail?.trim();
  const organizerUserId = input.organizerUserId?.trim();
  const response = await fetch(apiUrl(MEETING_SESSIONS_PATH), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      joinUrl,
      ...(userProvidedTitle ? { userProvidedTitle } : {}),
      ...(candidateUserIds.length > 0 ? { candidateUserIds } : {}),
      ...(candidateUserPrincipalNames.length > 0 ? { candidateUserPrincipalNames } : {}),
      ...(createdByMicrosoftUserId ? { createdByMicrosoftUserId } : {}),
      ...(createdByEmail ? { createdByEmail } : {}),
      ...(organizerUserId ? { organizerUserId } : {}),
    }),
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
  const displayTitle = optionalString(source.displayTitle) ?? optionalString(source.display_title);
  const title =
    displayTitle ?? optionalString(source.title) ?? optionalString(source.meeting_title);
  const titleSource = optionalString(source.titleSource) ?? optionalString(source.title_source);
  const titleUpdatedAt =
    optionalString(source.titleUpdatedAt) ?? optionalString(source.title_updated_at);
  const userProvidedTitle =
    optionalString(source.userProvidedTitle) ?? optionalString(source.user_provided_title);
  const graphTitle = optionalString(source.graphTitle) ?? optionalString(source.graph_title);
  const provider = optionalString(source.provider);
  const externalMeetingId =
    optionalString(source.externalMeetingId) ?? optionalString(source.external_meeting_id);
  const joinMeetingId =
    optionalString(source.joinMeetingId) ?? optionalString(source.join_meeting_id);
  const joinWebUrl = optionalString(source.joinWebUrl) ?? optionalString(source.join_web_url);
  const canonicalJoinWebUrl =
    optionalString(source.canonicalJoinWebUrl) ?? optionalString(source.canonical_join_web_url);
  const threadId = optionalString(source.threadId) ?? optionalString(source.thread_id);
  const organizerId = optionalString(source.organizerId) ?? optionalString(source.organizer_id);
  const organizerName =
    optionalString(source.organizerName) ?? optionalString(source.organizer_name);
  const organizerEmail =
    optionalString(source.organizerEmail) ?? optionalString(source.organizer_email);
  const scheduledStartAt =
    optionalString(source.scheduledStartAt) ?? optionalString(source.scheduled_start_at);
  const scheduledEndAt =
    optionalString(source.scheduledEndAt) ?? optionalString(source.scheduled_end_at);
  const titleResolutionErrorCode =
    optionalString(source.titleResolutionErrorCode) ??
    optionalString(source.title_resolution_error_code);
  const titleResolutionErrorMessage =
    optionalString(source.titleResolutionErrorMessage) ??
    optionalString(source.title_resolution_error_message);
  const titleResolvedAt =
    optionalString(source.titleResolvedAt) ?? optionalString(source.title_resolved_at);
  const botCallId = optionalString(source.botCallId) ?? optionalString(source.bot_call_id);
  const createdAt = optionalString(source.createdAt) ?? optionalString(source.created_at);
  const updatedAt = optionalString(source.updatedAt) ?? optionalString(source.updated_at);
  const endedAt = optionalString(source.endedAt) ?? optionalString(source.ended_at);
  const endReason = optionalString(source.endReason) ?? optionalString(source.end_reason);
  const lastBotStatusAt =
    optionalString(source.lastBotStatusAt) ?? optionalString(source.last_bot_status_at);
  const lastError = optionalString(source.lastError) ?? optionalString(source.last_error);
  return {
    sessionId,
    ...(title ? { title } : {}),
    ...(displayTitle ? { displayTitle } : {}),
    ...(titleSource ? { titleSource } : {}),
    ...(titleUpdatedAt ? { titleUpdatedAt } : {}),
    ...(userProvidedTitle ? { userProvidedTitle } : {}),
    ...(graphTitle ? { graphTitle } : {}),
    ...(provider ? { provider } : {}),
    ...(externalMeetingId ? { externalMeetingId } : {}),
    ...(joinMeetingId ? { joinMeetingId } : {}),
    ...(joinWebUrl ? { joinWebUrl } : {}),
    ...(canonicalJoinWebUrl ? { canonicalJoinWebUrl } : {}),
    ...(threadId ? { threadId } : {}),
    ...(organizerId ? { organizerId } : {}),
    ...(organizerName ? { organizerName } : {}),
    ...(organizerEmail ? { organizerEmail } : {}),
    ...(scheduledStartAt ? { scheduledStartAt } : {}),
    ...(scheduledEndAt ? { scheduledEndAt } : {}),
    ...(titleResolutionErrorCode ? { titleResolutionErrorCode } : {}),
    ...(titleResolutionErrorMessage ? { titleResolutionErrorMessage } : {}),
    ...(titleResolvedAt ? { titleResolvedAt } : {}),
    status,
    ...(meetingUrlHash ? { meetingUrlHash } : {}),
    ...(typeof source.reused === "boolean" ? { reused: source.reused } : {}),
    ...(botCallId ? { botCallId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(endReason ? { endReason } : {}),
    ...(lastBotStatusAt ? { lastBotStatusAt } : {}),
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
