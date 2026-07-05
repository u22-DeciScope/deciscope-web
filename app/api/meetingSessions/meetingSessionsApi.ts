import { requestJson } from "~/api/core/apiClient";

export type MeetingSessionStatus =
  | "requested"
  | "pending_join"
  | "command_sent"
  | "joining"
  | "joined"
  | "active"
  | "recording"
  | "speech_error"
  | "speech_throttled"
  | "ended"
  | "failed"
  | "stale"
  | "timeout";

export type MeetingSessionDto = {
  sessionId: string;
  workspaceId?: string;
  createdByUserId?: string;
  meetingId?: string;
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
  purpose?: string;
  context?: string;
  agenda?: string;
  decisionPoints?: string;
  concerns?: string;
  expectedOutput?: string;
  customInstruction?: string;
  status: MeetingSessionStatus;
  meetingUrlHash?: string;
  reused?: boolean;
  botCallId?: string;
  createdAt?: string;
  updatedAt?: string;
  requestedAt?: string;
  commandSentAt?: string;
  joinedAt?: string;
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
  "speech_error",
  "speech_throttled",
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
  purpose?: string;
  context?: string;
  agenda?: string;
  decisionPoints?: string;
  concerns?: string;
  expectedOutput?: string;
  customInstruction?: string;
};

const workspaceMeetingSessionsPath = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId)}/meeting-sessions`;

export async function createWorkspaceMeetingSession(
  workspaceId: string,
  joinUrl: string,
  input: CreateMeetingSessionInput = {},
): Promise<MeetingSessionDto> {
  const payload = await requestJson<unknown>(workspaceMeetingSessionsPath(workspaceId), {
    method: "POST",
    body: JSON.stringify(createMeetingSessionBody(joinUrl, input)),
  });
  const session = normalizeMeetingSession(payload);
  if (!session) {
    throw new Error("Go APIの会議セッション作成レスポンスを解析できませんでした。");
  }
  return session;
}

export async function listWorkspaceMeetingSessions(
  workspaceId: string,
): Promise<MeetingSessionDto[]> {
  const payload = await requestJson<unknown>(workspaceMeetingSessionsPath(workspaceId));
  return extractMeetingSessions(payload);
}

export async function getWorkspaceMeetingSession(
  workspaceId: string,
  sessionId: string,
): Promise<MeetingSessionDto> {
  const payload = await requestJson<unknown>(
    `${workspaceMeetingSessionsPath(workspaceId)}/${encodeURIComponent(sessionId)}/`,
  );
  const session = normalizeMeetingSession(payload);
  if (!session) {
    throw new Error("Go APIの会議セッション取得レスポンスを解析できませんでした。");
  }
  return session;
}

export async function endWorkspaceMeetingSession(
  workspaceId: string,
  sessionId: string,
  reason = "manual_end_requested",
): Promise<MeetingSessionDto> {
  const payload = await requestJson<unknown>(
    `${workspaceMeetingSessionsPath(workspaceId)}/${encodeURIComponent(sessionId)}/end`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
  const session = normalizeMeetingSession(payload);
  if (!session) {
    throw new Error("Go APIの会議セッション終了レスポンスを解析できませんでした。");
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
  const workspaceId = optionalString(source.workspaceId) ?? optionalString(source.workspace_id);
  const createdByUserId =
    optionalString(source.createdByUserId) ?? optionalString(source.created_by_user_id);
  const meetingId = optionalString(source.meetingId) ?? optionalString(source.meeting_id);
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
  const purpose = optionalString(source.purpose);
  const context = optionalString(source.context);
  const agenda = optionalString(source.agenda);
  const decisionPoints =
    optionalString(source.decisionPoints) ?? optionalString(source.decision_points);
  const concerns = optionalString(source.concerns);
  const expectedOutput =
    optionalString(source.expectedOutput) ?? optionalString(source.expected_output);
  const customInstruction =
    optionalString(source.customInstruction) ?? optionalString(source.custom_instruction);
  const botCallId = optionalString(source.botCallId) ?? optionalString(source.bot_call_id);
  const createdAt = optionalString(source.createdAt) ?? optionalString(source.created_at);
  const updatedAt = optionalString(source.updatedAt) ?? optionalString(source.updated_at);
  const requestedAt = optionalString(source.requestedAt) ?? optionalString(source.requested_at);
  const commandSentAt =
    optionalString(source.commandSentAt) ?? optionalString(source.command_sent_at);
  const joinedAt = optionalString(source.joinedAt) ?? optionalString(source.joined_at);
  const endedAt = optionalString(source.endedAt) ?? optionalString(source.ended_at);
  const endReason = optionalString(source.endReason) ?? optionalString(source.end_reason);
  const lastBotStatusAt =
    optionalString(source.lastBotStatusAt) ?? optionalString(source.last_bot_status_at);
  const lastError = optionalString(source.lastError) ?? optionalString(source.last_error);
  return {
    sessionId,
    ...(workspaceId ? { workspaceId } : {}),
    ...(createdByUserId ? { createdByUserId } : {}),
    ...(meetingId ? { meetingId } : {}),
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
    ...(purpose ? { purpose } : {}),
    ...(context ? { context } : {}),
    ...(agenda ? { agenda } : {}),
    ...(decisionPoints ? { decisionPoints } : {}),
    ...(concerns ? { concerns } : {}),
    ...(expectedOutput ? { expectedOutput } : {}),
    ...(customInstruction ? { customInstruction } : {}),
    status,
    ...(meetingUrlHash ? { meetingUrlHash } : {}),
    ...(typeof source.reused === "boolean" ? { reused: source.reused } : {}),
    ...(botCallId ? { botCallId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(requestedAt ? { requestedAt } : {}),
    ...(commandSentAt ? { commandSentAt } : {}),
    ...(joinedAt ? { joinedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(endReason ? { endReason } : {}),
    ...(lastBotStatusAt ? { lastBotStatusAt } : {}),
    ...(lastError ? { lastError } : {}),
  };
}

function createMeetingSessionBody(joinUrl: string, input: CreateMeetingSessionInput) {
  const userProvidedTitle = (input.userProvidedTitle ?? input.title)?.trim();
  const candidateUserIds =
    input.candidateUserIds?.map((value) => value.trim()).filter(Boolean) ?? [];
  const candidateUserPrincipalNames =
    input.candidateUserPrincipalNames?.map((value) => value.trim()).filter(Boolean) ?? [];
  const createdByMicrosoftUserId = input.createdByMicrosoftUserId?.trim();
  const createdByEmail = input.createdByEmail?.trim();
  const organizerUserId = input.organizerUserId?.trim();
  const purpose = input.purpose?.trim();
  const context = input.context?.trim();
  const agenda = input.agenda?.trim();
  const decisionPoints = input.decisionPoints?.trim();
  const concerns = input.concerns?.trim();
  const expectedOutput = input.expectedOutput?.trim();
  const customInstruction = input.customInstruction?.trim();
  return {
    joinUrl,
    ...(userProvidedTitle ? { userProvidedTitle } : {}),
    ...(candidateUserIds.length > 0 ? { candidateUserIds } : {}),
    ...(candidateUserPrincipalNames.length > 0 ? { candidateUserPrincipalNames } : {}),
    ...(createdByMicrosoftUserId ? { createdByMicrosoftUserId } : {}),
    ...(createdByEmail ? { createdByEmail } : {}),
    ...(organizerUserId ? { organizerUserId } : {}),
    ...(purpose ? { purpose } : {}),
    ...(context ? { context } : {}),
    ...(agenda ? { agenda } : {}),
    ...(decisionPoints ? { decisionPoints } : {}),
    ...(concerns ? { concerns } : {}),
    ...(expectedOutput ? { expectedOutput } : {}),
    ...(customInstruction ? { customInstruction } : {}),
  };
}

function extractMeetingSessions(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeMeetingSession).filter(Boolean) as MeetingSessionDto[];
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const body = payload as Record<string, unknown>;
  for (const key of ["items", "meetingSessions", "meeting_sessions", "sessions"]) {
    const value = body[key];
    if (Array.isArray(value)) {
      return value.map(normalizeMeetingSession).filter(Boolean) as MeetingSessionDto[];
    }
  }
  return [];
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
