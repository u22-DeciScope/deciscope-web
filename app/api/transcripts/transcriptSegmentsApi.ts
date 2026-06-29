import {
  isMeetingSessionStatus,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";

export type TranscriptSegment = {
  eventId?: string;
  sessionId?: string;
  callId: string;
  sequenceNo: number;
  speakerLabel?: string;
  speakerId?: string | null;
  speakerName?: string | null;
  recognizedAtUtc: string;
  offsetTicks?: number;
  durationTicks?: number;
  text: string;
  duplicate?: boolean;
};

export type TranscriptSegmentEvent = {
  type: string;
  sentAtUtc?: string;
  data?: unknown;
};

export type TranscriptSubscriptionFilters = {
  callId?: string;
  sessionId?: string;
};

export type TranscriptSubscriptionInput = string | TranscriptSubscriptionFilters;

export type MeetingSessionStatusChange = {
  sessionId: string;
  title?: string;
  displayTitle?: string;
  titleSource?: string;
  provider?: string;
  externalMeetingId?: string;
  joinMeetingId?: string;
  joinWebUrl?: string;
  canonicalJoinWebUrl?: string;
  threadId?: string;
  organizerId?: string;
  organizerName?: string;
  organizerEmail?: string;
  titleResolutionErrorCode?: string;
  titleResolutionErrorMessage?: string;
  botCallId?: string;
  endedAt?: string;
  endReason?: string;
  lastError?: string;
  status: MeetingSessionStatus;
};

export type ParsedTranscriptWebSocketEvent = {
  type: string;
  sentAtUtc?: string;
  segment: TranscriptSegment | null;
  sessionStatus: MeetingSessionStatusChange | null;
};

type TranscriptHistoryResult = {
  segments: TranscriptSegment[];
  unavailable: boolean;
};

const TRANSCRIPT_HISTORY_PATH = "/api/v1/transcript-segments";
const TRANSCRIPT_WS_PATH = "/api/v1/ws/transcript-segments";

export function transcriptWebSocketToken() {
  const token = String(import.meta.env.VITE_DECISCOPE_WS_CLIENT_TOKEN ?? "").trim();
  return token || null;
}

export function buildTranscriptWebSocketUrl(
  input: TranscriptSubscriptionInput = {},
  token = transcriptWebSocketToken(),
) {
  const configured = String(import.meta.env.VITE_DECISCOPE_WS_URL ?? "").trim();
  const source = configured || TRANSCRIPT_WS_PATH;
  const url = resolveBrowserUrl(source);
  const filters = normalizeTranscriptFilters(input);

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    url.protocol = defaultWebSocketProtocol();
  }

  if (filters.callId) {
    url.searchParams.set("callId", filters.callId);
  } else {
    url.searchParams.delete("callId");
  }
  if (filters.sessionId) {
    url.searchParams.set("sessionId", filters.sessionId);
  } else {
    url.searchParams.delete("sessionId");
  }

  if (token) {
    url.searchParams.set("token", token);
  } else {
    url.searchParams.delete("token");
  }

  return url.toString();
}

export function maskWebSocketUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.searchParams.has("token")) {
      url.searchParams.set("token", "********");
    }
    return url.toString();
  } catch {
    return value.replace(/([?&]token=)[^&]+/i, "$1********");
  }
}

export async function fetchTranscriptSegmentHistory(
  input: TranscriptSubscriptionInput = {},
  limit = 100,
  token = transcriptWebSocketToken(),
): Promise<TranscriptHistoryResult> {
  const url = buildTranscriptHistoryUrl(input, limit, token);
  return fetchTranscriptHistoryUrl(url);
}

export async function fetchMeetingSessionTranscriptSegmentHistory(
  sessionId: string,
  limit = 100,
  token = transcriptWebSocketToken(),
): Promise<TranscriptHistoryResult> {
  const url = buildMeetingSessionTranscriptHistoryUrl(sessionId, limit, token);
  return fetchTranscriptHistoryUrl(url);
}

export function buildTranscriptHistoryDebugUrl(
  input: TranscriptSubscriptionInput = {},
  limit = 100,
  token = transcriptWebSocketToken(),
) {
  return maskWebSocketUrl(buildTranscriptHistoryUrl(input, limit, token));
}

export function buildMeetingSessionTranscriptHistoryDebugUrl(
  sessionId: string,
  limit = 100,
  token = transcriptWebSocketToken(),
) {
  return maskWebSocketUrl(buildMeetingSessionTranscriptHistoryUrl(sessionId, limit, token));
}

async function fetchTranscriptHistoryUrl(url: string): Promise<TranscriptHistoryResult> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });

  if ([404, 405, 501].includes(response.status)) {
    return { segments: [], unavailable: true };
  }

  if (!response.ok) {
    const message = (await response.text()).trim() || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return { segments: extractTranscriptSegments(payload), unavailable: false };
}

export function parseTranscriptWebSocketEvent(raw: string): ParsedTranscriptWebSocketEvent {
  const payload = JSON.parse(raw) as TranscriptSegmentEvent;
  const type = payload.type || "unknown";

  if (type === "meeting_session.status_changed") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: null,
      sessionStatus: normalizeMeetingSessionStatusChange(payload.data),
    };
  }

  if (type === "transcript_segment.created") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: normalizeTranscriptSegment(payload.data),
      sessionStatus: null,
    };
  }

  return { type, sentAtUtc: payload.sentAtUtc, segment: null, sessionStatus: null };
}

export function parseTranscriptSegmentEvent(raw: string) {
  const parsed = parseTranscriptWebSocketEvent(raw);
  return { type: parsed.type, segment: parsed.segment };
}

export function transcriptSegmentKey(segment: TranscriptSegment) {
  if (segment.eventId) {
    return segment.eventId;
  }
  if (segment.callId && Number.isFinite(segment.sequenceNo)) {
    return `${segment.callId}:${segment.sequenceNo}`;
  }
  if (segment.sessionId && Number.isFinite(segment.sequenceNo)) {
    return `${segment.sessionId}:${segment.sequenceNo}`;
  }
  return `${segment.callId}:${segment.recognizedAtUtc}:${segment.text}`;
}

function buildTranscriptHistoryUrl(
  input: TranscriptSubscriptionInput,
  limit: number,
  token: string | null,
) {
  const configured = String(import.meta.env.VITE_DECISCOPE_API_BASE_URL ?? "").trim();
  const base = configured || browserOrigin();
  const url = new URL(TRANSCRIPT_HISTORY_PATH, base);
  const filters = normalizeTranscriptFilters(input);

  if (filters.callId) {
    url.searchParams.set("callId", filters.callId);
  }
  if (filters.sessionId) {
    url.searchParams.set("sessionId", filters.sessionId);
  }
  url.searchParams.set("limit", String(limit));
  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
}

function buildMeetingSessionTranscriptHistoryUrl(
  sessionId: string,
  limit: number,
  token: string | null,
) {
  const configured = String(import.meta.env.VITE_DECISCOPE_API_BASE_URL ?? "").trim();
  const base = configured || browserOrigin();
  const url = new URL(
    `/api/v1/meeting-sessions/${encodeURIComponent(sessionId.trim())}/transcript-segments`,
    base,
  );
  url.searchParams.set("limit", String(limit));
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

function extractTranscriptSegments(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeTranscriptSegment).filter(Boolean) as TranscriptSegment[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const body = payload as Record<string, unknown>;
  for (const key of ["data", "items", "segments", "transcriptSegments"]) {
    const value = body[key];
    if (Array.isArray(value)) {
      return value.map(normalizeTranscriptSegment).filter(Boolean) as TranscriptSegment[];
    }
  }

  return [];
}

function normalizeTranscriptSegment(value: unknown): TranscriptSegment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const eventId = optionalString(source.eventId) ?? optionalString(source.event_id);
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const callId = optionalString(source.callId) ?? optionalString(source.call_id) ?? "";
  const speakerId =
    optionalString(source.speakerId) ??
    optionalString(source.speakerID) ??
    optionalString(source.speaker_id);
  const speakerName =
    optionalString(source.speakerName) ??
    optionalString(source.speaker_name) ??
    optionalString(source.displayName) ??
    optionalString(source.display_name);
  const speakerLabel =
    optionalString(source.speakerLabel) ??
    optionalString(source.speaker_label) ??
    optionalString(source.speakerDisplayName) ??
    optionalString(source.participantName) ??
    optionalString(source.userName);
  const recognizedAtUtc =
    optionalString(source.recognizedAtUtc) ?? optionalString(source.recognized_at_utc) ?? "";
  const text = (optionalString(source.text) ?? "").trim();
  const sequenceNo = optionalNumber(source.sequenceNo) ?? optionalNumber(source.sequence_no) ?? 0;
  const offsetTicks = optionalNumber(source.offsetTicks) ?? optionalNumber(source.offset_ticks);
  const durationTicks =
    optionalNumber(source.durationTicks) ?? optionalNumber(source.duration_ticks);
  const duplicate = optionalBoolean(source.duplicate);

  if (!text) {
    return null;
  }

  return {
    ...(eventId ? { eventId } : {}),
    ...(sessionId ? { sessionId } : {}),
    callId,
    sequenceNo,
    ...(speakerLabel ? { speakerLabel } : {}),
    ...(speakerId ? { speakerId } : {}),
    ...(speakerName ? { speakerName } : {}),
    recognizedAtUtc,
    ...(offsetTicks !== undefined ? { offsetTicks } : {}),
    ...(durationTicks !== undefined ? { durationTicks } : {}),
    text,
    ...(duplicate !== undefined ? { duplicate } : {}),
  };
}

function normalizeMeetingSessionStatusChange(value: unknown): MeetingSessionStatusChange | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const displayTitle = optionalString(source.displayTitle) ?? optionalString(source.display_title);
  const title =
    displayTitle ?? optionalString(source.title) ?? optionalString(source.meeting_title);
  const titleSource = optionalString(source.titleSource) ?? optionalString(source.title_source);
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
  const titleResolutionErrorCode =
    optionalString(source.titleResolutionErrorCode) ??
    optionalString(source.title_resolution_error_code);
  const titleResolutionErrorMessage =
    optionalString(source.titleResolutionErrorMessage) ??
    optionalString(source.title_resolution_error_message);
  const botCallId = optionalString(source.botCallId) ?? optionalString(source.bot_call_id);
  const endedAt = optionalString(source.endedAt) ?? optionalString(source.ended_at);
  const endReason = optionalString(source.endReason) ?? optionalString(source.end_reason);
  const lastError = optionalString(source.lastError) ?? optionalString(source.last_error);
  const status = source.status;
  if (!sessionId || !isMeetingSessionStatus(status)) {
    return null;
  }
  return {
    sessionId,
    ...(title ? { title } : {}),
    ...(displayTitle ? { displayTitle } : {}),
    ...(titleSource ? { titleSource } : {}),
    ...(provider ? { provider } : {}),
    ...(externalMeetingId ? { externalMeetingId } : {}),
    ...(joinMeetingId ? { joinMeetingId } : {}),
    ...(joinWebUrl ? { joinWebUrl } : {}),
    ...(canonicalJoinWebUrl ? { canonicalJoinWebUrl } : {}),
    ...(threadId ? { threadId } : {}),
    ...(organizerId ? { organizerId } : {}),
    ...(organizerName ? { organizerName } : {}),
    ...(organizerEmail ? { organizerEmail } : {}),
    ...(titleResolutionErrorCode ? { titleResolutionErrorCode } : {}),
    ...(titleResolutionErrorMessage ? { titleResolutionErrorMessage } : {}),
    ...(botCallId ? { botCallId } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(endReason ? { endReason } : {}),
    ...(lastError ? { lastError } : {}),
    status,
  };
}

function normalizeTranscriptFilters(
  input: TranscriptSubscriptionInput,
): Required<TranscriptSubscriptionFilters> {
  if (typeof input === "string") {
    return { callId: input.trim(), sessionId: "" };
  }
  return {
    callId: input.callId?.trim() ?? "",
    sessionId: input.sessionId?.trim() ?? "",
  };
}

function resolveBrowserUrl(value: string) {
  const url = new URL(value, browserOrigin());
  if (url.protocol === "http:" || url.protocol === "https:") {
    return url;
  }
  return url;
}

function browserOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:5193";
}

function defaultWebSocketProtocol() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return "wss:";
  }
  return "ws:";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
