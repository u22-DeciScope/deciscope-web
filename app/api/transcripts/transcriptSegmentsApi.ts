import { normalizeAIAnalysis, type MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import {
  isMeetingSessionStatus,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import { apiBaseUrl as coreApiBaseUrl, websocketBaseUrl } from "~/api/core/apiConfig";

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
  isFinal: boolean;
};

export type TranscriptSegmentEvent = {
  type: string;
  sentAtUtc?: string;
  data?: unknown;
};

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
  joinedAt?: string;
  endedAt?: string;
  endReason?: string;
  lastError?: string;
  status: MeetingSessionStatus;
};

export type MeetingSessionBotHealthChange = {
  sessionId: string;
  healthy: boolean;
  lastBotStatusAtUtc?: string;
};

export type MeetingSessionTranscriptHealth =
  | "ok"
  | "transcript_delayed"
  | "transcript_stalled"
  | "silent"
  | "audio_stalled"
  | "speech_stalled";

export type MeetingSessionTranscriptHealthChange = {
  sessionId: string;
  transcriptHealth: MeetingSessionTranscriptHealth;
  secondsSinceLastTranscript: number | null;
};

export type MeetingSessionMediaHealthState = "ok" | "audio_receive_stalled";
export type MeetingSessionMediaHealthEvent = "started" | "recovered" | "snapshot";

export type MeetingSessionMediaHealth = {
  sessionId: string;
  eventId?: string;
  botCallId?: string;
  state: MeetingSessionMediaHealthState;
  event: MeetingSessionMediaHealthEvent;
  source?: string;
  occurredAtUtc: string;
  startedAtUtc?: string;
  lastAudioFrameAtUtc?: string;
  durationMs?: number;
  updatedAtUtc?: string;
};

export type ParsedTranscriptWebSocketEvent = {
  type: string;
  sentAtUtc?: string;
  segment: TranscriptSegment | null;
  sessionStatus: MeetingSessionStatusChange | null;
  aiAnalysis: MeetingAIAnalysis | null;
  botHealth: MeetingSessionBotHealthChange | null;
  transcriptHealth: MeetingSessionTranscriptHealthChange | null;
  mediaHealth: MeetingSessionMediaHealth | null;
};

type TranscriptHistoryResult = {
  segments: TranscriptSegment[];
  unavailable: boolean;
};

export async function fetchWorkspaceMeetingSessionTranscriptSegmentHistory(
  workspaceId: string,
  sessionId: string,
  limit = 100,
): Promise<TranscriptHistoryResult> {
  const url = buildWorkspaceMeetingSessionTranscriptHistoryUrl(workspaceId, sessionId, limit);
  return fetchTranscriptHistoryUrl(url);
}

export async function fetchWorkspaceMeetingSessionMediaHealth(
  workspaceId: string,
  sessionId: string,
): Promise<MeetingSessionMediaHealth> {
  const url = coreApiUrl(
    workspaceMeetingSessionTranscriptPath(workspaceId, sessionId, "media-health"),
  );
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("deciscope:unauthorized"));
    }
    const message = (await response.text()).trim() || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  const health = normalizeMeetingSessionMediaHealth(await response.json());
  if (!health) {
    throw new Error("Invalid media health response");
  }
  return health;
}

export function buildWorkspaceMeetingSessionTranscriptWebSocketUrl(
  workspaceId: string,
  sessionId: string,
) {
  return toWebSocketUrl(
    joinUrlPath(
      websocketBaseUrl(),
      workspaceMeetingSessionTranscriptPath(workspaceId, sessionId, "transcript-stream"),
    ),
  ).toString();
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
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("deciscope:unauthorized"));
    }
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
      aiAnalysis: null,
      botHealth: null,
      transcriptHealth: null,
      mediaHealth: null,
    };
  }

  if (type === "transcript_segment.created") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: normalizeTranscriptSegment(payload.data),
      sessionStatus: null,
      aiAnalysis: null,
      botHealth: null,
      transcriptHealth: null,
      mediaHealth: null,
    };
  }

  if (type === "ai_analysis.updated") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: null,
      sessionStatus: null,
      aiAnalysis: normalizeAIAnalysis(payload.data),
      botHealth: null,
      transcriptHealth: null,
      mediaHealth: null,
    };
  }

  if (type === "meeting_session.bot_health_changed") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: null,
      sessionStatus: null,
      aiAnalysis: null,
      botHealth: normalizeMeetingSessionBotHealthChange(payload.data),
      transcriptHealth: null,
      mediaHealth: null,
    };
  }

  if (type === "meeting_session.transcript_health_changed") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: null,
      sessionStatus: null,
      aiAnalysis: null,
      botHealth: null,
      transcriptHealth: normalizeMeetingSessionTranscriptHealthChange(payload.data),
      mediaHealth: null,
    };
  }

  if (type === "meeting_session.media_health_changed") {
    return {
      type,
      sentAtUtc: payload.sentAtUtc,
      segment: null,
      sessionStatus: null,
      aiAnalysis: null,
      botHealth: null,
      transcriptHealth: null,
      mediaHealth: normalizeMeetingSessionMediaHealth(payload.data),
    };
  }

  return {
    type,
    sentAtUtc: payload.sentAtUtc,
    segment: null,
    sessionStatus: null,
    aiAnalysis: null,
    botHealth: null,
    transcriptHealth: null,
    mediaHealth: null,
  };
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

function buildWorkspaceMeetingSessionTranscriptHistoryUrl(
  workspaceId: string,
  sessionId: string,
  limit: number,
) {
  const url = coreApiUrl(
    workspaceMeetingSessionTranscriptPath(workspaceId, sessionId, "transcript-segments"),
  );
  url.searchParams.set("limit", String(limit));
  return url.toString();
}

function workspaceMeetingSessionTranscriptPath(
  workspaceId: string,
  sessionId: string,
  suffix: "transcript-segments" | "transcript-stream" | "media-health",
) {
  return `/v1/workspaces/${encodeURIComponent(workspaceId.trim())}/meeting-sessions/${encodeURIComponent(
    sessionId.trim(),
  )}/${suffix}`;
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
  const isFinal = optionalBoolean(source.isFinal) ?? optionalBoolean(source.is_final) ?? true;

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
    isFinal,
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
  const joinedAt = optionalString(source.joinedAt) ?? optionalString(source.joined_at);
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
    ...(joinedAt ? { joinedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(endReason ? { endReason } : {}),
    ...(lastError ? { lastError } : {}),
    status,
  };
}

function normalizeMeetingSessionBotHealthChange(
  value: unknown,
): MeetingSessionBotHealthChange | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const healthy = source.healthy;
  const lastBotStatusAtUtc =
    optionalString(source.lastBotStatusAtUtc) ?? optionalString(source.last_bot_status_at_utc);
  if (!sessionId || typeof healthy !== "boolean") {
    return null;
  }
  return {
    sessionId,
    healthy,
    ...(lastBotStatusAtUtc ? { lastBotStatusAtUtc } : {}),
  };
}

function normalizeMeetingSessionTranscriptHealthChange(
  value: unknown,
): MeetingSessionTranscriptHealthChange | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const transcriptHealth =
    optionalString(source.transcriptHealth) ?? optionalString(source.transcript_health);
  const secondsSinceLastTranscript =
    optionalNumber(source.secondsSinceLastTranscript) ??
    optionalNumber(source.seconds_since_last_transcript) ??
    null;
  if (!sessionId || !isMeetingSessionTranscriptHealth(transcriptHealth)) {
    return null;
  }
  return {
    sessionId,
    transcriptHealth,
    secondsSinceLastTranscript,
  };
}

function isMeetingSessionTranscriptHealth(value: unknown): value is MeetingSessionTranscriptHealth {
  return (
    value === "ok" ||
    value === "transcript_delayed" ||
    value === "transcript_stalled" ||
    value === "silent" ||
    value === "audio_stalled" ||
    value === "speech_stalled"
  );
}

function normalizeMeetingSessionMediaHealth(value: unknown): MeetingSessionMediaHealth | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const state = optionalString(source.state);
  const event = optionalString(source.event);
  const occurredAtUtc =
    optionalString(source.occurredAtUtc) ?? optionalString(source.occurred_at_utc);
  if (
    !sessionId ||
    (state !== "ok" && state !== "audio_receive_stalled") ||
    (event !== "started" && event !== "recovered" && event !== "snapshot") ||
    !occurredAtUtc
  ) {
    return null;
  }
  const eventId = optionalString(source.eventId) ?? optionalString(source.event_id);
  const botCallId = optionalString(source.botCallId) ?? optionalString(source.bot_call_id);
  const healthSource = optionalString(source.source);
  const startedAtUtc = optionalString(source.startedAtUtc) ?? optionalString(source.started_at_utc);
  const lastAudioFrameAtUtc =
    optionalString(source.lastAudioFrameAtUtc) ?? optionalString(source.last_audio_frame_at_utc);
  const durationMs = optionalNumber(source.durationMs) ?? optionalNumber(source.duration_ms);
  const updatedAtUtc = optionalString(source.updatedAtUtc) ?? optionalString(source.updated_at_utc);
  return {
    sessionId,
    ...(eventId ? { eventId } : {}),
    ...(botCallId ? { botCallId } : {}),
    state,
    event,
    ...(healthSource ? { source: healthSource } : {}),
    occurredAtUtc,
    ...(startedAtUtc ? { startedAtUtc } : {}),
    ...(lastAudioFrameAtUtc ? { lastAudioFrameAtUtc } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(updatedAtUtc ? { updatedAtUtc } : {}),
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

function coreApiUrl(path: string) {
  return resolveBrowserUrl(joinUrlPath(coreApiBaseUrl(), path));
}

function joinUrlPath(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function toWebSocketUrl(value: string) {
  const url = resolveBrowserUrl(value);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    url.protocol = defaultWebSocketProtocol();
  }
  return url;
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
