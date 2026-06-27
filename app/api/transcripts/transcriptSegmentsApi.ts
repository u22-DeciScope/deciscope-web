export type TranscriptSegment = {
  eventId?: string;
  callId: string;
  sequenceNo: number;
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

export function buildTranscriptWebSocketUrl(callId: string, token = transcriptWebSocketToken()) {
  const configured = String(import.meta.env.VITE_DECISCOPE_WS_URL ?? "").trim();
  const source = configured || TRANSCRIPT_WS_PATH;
  const url = resolveBrowserUrl(source);

  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    url.protocol = defaultWebSocketProtocol();
  }

  const trimmedCallId = callId.trim();
  if (trimmedCallId) {
    url.searchParams.set("callId", trimmedCallId);
  } else {
    url.searchParams.delete("callId");
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
  callId: string,
  limit = 100,
  token = transcriptWebSocketToken(),
): Promise<TranscriptHistoryResult> {
  const url = buildTranscriptHistoryUrl(callId, limit, token);
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

export function parseTranscriptSegmentEvent(raw: string) {
  const payload = JSON.parse(raw) as TranscriptSegmentEvent;
  if (payload.type !== "transcript_segment.created") {
    return { type: payload.type || "unknown", segment: null };
  }

  return { type: payload.type, segment: normalizeTranscriptSegment(payload.data) };
}

export function transcriptSegmentKey(segment: TranscriptSegment) {
  if (segment.eventId) {
    return segment.eventId;
  }
  if (segment.callId && Number.isFinite(segment.sequenceNo)) {
    return `${segment.callId}:${segment.sequenceNo}`;
  }
  return `${segment.callId}:${segment.recognizedAtUtc}:${segment.text}`;
}

function buildTranscriptHistoryUrl(callId: string, limit: number, token: string | null) {
  const configured = String(import.meta.env.VITE_DECISCOPE_API_BASE_URL ?? "").trim();
  const base = configured || browserOrigin();
  const url = new URL(TRANSCRIPT_HISTORY_PATH, base);
  const trimmedCallId = callId.trim();

  if (trimmedCallId) {
    url.searchParams.set("callId", trimmedCallId);
  }
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
  const callId = optionalString(source.callId) ?? optionalString(source.call_id) ?? "";
  const recognizedAtUtc =
    optionalString(source.recognizedAtUtc) ?? optionalString(source.recognized_at_utc) ?? "";
  const text = optionalString(source.text) ?? "";
  const sequenceNo = optionalNumber(source.sequenceNo) ?? optionalNumber(source.sequence_no) ?? 0;
  const offsetTicks = optionalNumber(source.offsetTicks) ?? optionalNumber(source.offset_ticks);
  const durationTicks =
    optionalNumber(source.durationTicks) ?? optionalNumber(source.duration_ticks);
  const duplicate = optionalBoolean(source.duplicate);

  return {
    ...(eventId ? { eventId } : {}),
    callId,
    sequenceNo,
    recognizedAtUtc,
    ...(offsetTicks !== undefined ? { offsetTicks } : {}),
    ...(durationTicks !== undefined ? { durationTicks } : {}),
    text,
    ...(duplicate !== undefined ? { duplicate } : {}),
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
