import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  getMeetingSession,
  getWorkspaceMeetingSession,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { RuntimePartial } from "~/api/meetings/meetingRuntimeTypes";
import {
  buildMeetingSessionTranscriptHistoryDebugUrl,
  buildTranscriptWebSocketUrl,
  buildWorkspaceMeetingSessionTranscriptHistoryDebugUrl,
  buildWorkspaceMeetingSessionTranscriptWebSocketUrl,
  fetchMeetingSessionTranscriptSegmentHistory,
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory,
  maskWebSocketUrl,
  parseTranscriptWebSocketEvent,
  transcriptSegmentKey,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

export type TranscriptSessionConnectionStatus =
  | "idle"
  | "loading"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

const reconnectDelaysMs = [1000, 2000, 5000];
const historyRetryDelaysMs = [2000, 5000, 10000];
const websocketConnectTimeoutMs = 10000;
const transcriptHistoryRetryMessage = "文字起こし履歴を取得中/再試行中です。";
const ticksPerMillisecond = 10_000;
const partialBubbleGapThresholdMs = 3000;

type TranscriptPartialEntry = {
  key: string;
  baseKey: string;
  segment: TranscriptSegment;
  startedAtMs: number;
  startedOffsetMs: number | null;
  latestActivityMs: number;
  latestEndMs: number;
};

export function useMeetingTranscriptSession(
  meetingId: string | undefined,
  sessionId: string | null | undefined,
  workspaceId?: string,
  options: { connectWebSocket?: boolean } = {},
) {
  const normalizedSessionId = sessionId?.trim() ?? "";
  const connectWebSocket = options.connectWebSocket ?? true;
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [partials, setPartials] = useState<Record<string, TranscriptPartialEntry>>({});
  const [sessionStatus, setSessionStatus] = useState<MeetingSessionStatus | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionTitleSource, setSessionTitleSource] = useState("");
  const [sessionCreatedAt, setSessionCreatedAt] = useState("");
  const [sessionJoinedAt, setSessionJoinedAt] = useState("");
  const [sessionEndedAt, setSessionEndedAt] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<TranscriptSessionConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const seenKeysRef = useRef(new Set<string>());
  const activeSessionRef = useRef("");
  const shouldReconnectRef = useRef(false);

  const appendSegments = useCallback(
    (incoming: TranscriptSegment[], source = "unknown") => {
      if (!normalizedSessionId) {
        meetingStartDebug("meeting-page", "transcript ignored", {
          source,
          reason: "missing_current_session_id",
          incomingCount: incoming.length,
        });
        return;
      }

      const accepted: TranscriptSegment[] = [];
      let ignoredSessionMismatch = 0;
      let ignoredEmptyText = 0;
      let ignoredDuplicate = 0;
      let ignoredPartial = 0;
      const mismatchSamples: Array<Record<string, unknown>> = [];
      for (const segment of incoming) {
        if (!segment.isFinal) {
          ignoredPartial += 1;
          continue;
        }
        if (segment.sessionId !== normalizedSessionId) {
          ignoredSessionMismatch += 1;
          if (mismatchSamples.length < 3) {
            mismatchSamples.push({
              eventId: segment.eventId ?? null,
              segmentSessionId: segment.sessionId ?? null,
              currentSessionId: normalizedSessionId,
              callId: segment.callId,
              sequenceNo: segment.sequenceNo,
            });
          }
          continue;
        }
        if (!segment.text.trim()) {
          ignoredEmptyText += 1;
          continue;
        }
        const key = transcriptSegmentKey(segment);
        if (seenKeysRef.current.has(key)) {
          ignoredDuplicate += 1;
          continue;
        }
        seenKeysRef.current.add(key);
        accepted.push(segment);
      }

      meetingStartDebug("meeting-page", "transcript append evaluated", {
        source,
        sessionId: normalizedSessionId,
        incomingCount: incoming.length,
        acceptedCount: accepted.length,
        ignoredSessionMismatch,
        ignoredEmptyText,
        ignoredDuplicate,
        ignoredPartial,
        mismatchSamples,
      });

      if (accepted.length === 0) {
        return;
      }

      setPartials((current) => {
        let changed = false;
        const next = { ...current };
        for (const segment of accepted) {
          changed = removeReplacedPartialEntries(next, segment) || changed;
        }
        return changed ? next : current;
      });
      setSegments((current) => sortTranscriptSegments([...current, ...accepted]));
      meetingStartDebug("meeting-page", "transcript appended", {
        source,
        sessionId: normalizedSessionId,
        appendedCount: accepted.length,
        sequenceNos: accepted.map((segment) => segment.sequenceNo),
      });
    },
    [normalizedSessionId],
  );

  const applyPartial = useCallback(
    (segment: TranscriptSegment, source = "unknown") => {
      if (!normalizedSessionId) {
        meetingStartDebug("meeting-page", "transcript partial ignored", {
          source,
          reason: "missing_current_session_id",
          eventId: segment.eventId ?? null,
        });
        return;
      }
      if (segment.sessionId !== normalizedSessionId) {
        meetingStartDebug("meeting-page", "transcript partial ignored", {
          source,
          reason: "session_id_mismatch",
          eventId: segment.eventId ?? null,
          segmentSessionId: segment.sessionId ?? null,
          currentSessionId: normalizedSessionId,
          callId: segment.callId,
        });
        return;
      }
      if (!segment.text.trim()) {
        meetingStartDebug("meeting-page", "transcript partial ignored", {
          source,
          reason: "empty_text",
          eventId: segment.eventId ?? null,
        });
        return;
      }

      setPartials((current) => upsertPartialEntry(current, segment));
      meetingStartDebug("meeting-page", "transcript partial applied", {
        source,
        sessionId: normalizedSessionId,
        eventId: segment.eventId ?? null,
        callId: segment.callId,
        partialGapThresholdMs: partialBubbleGapThresholdMs,
        speakerId: segment.speakerId ?? null,
        speakerName: segment.speakerName ?? null,
        textLength: segment.text.trim().length,
      });
    },
    [normalizedSessionId],
  );

  useEffect(() => {
    if (!normalizedSessionId) {
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(historyRetryTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      shouldReconnectRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
      activeSessionRef.current = "";
      reconnectAttemptRef.current = 0;
      seenKeysRef.current.clear();
      setSegments([]);
      setPartials({});
      setSessionStatus(null);
      setSessionTitle("");
      setSessionTitleSource("");
      setSessionCreatedAt("");
      setSessionJoinedAt("");
      setSessionEndedAt("");
      setConnectionStatus("idle");
      setError(null);
      return;
    }

    activeSessionRef.current = normalizedSessionId;
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    seenKeysRef.current.clear();
    setSegments([]);
    setPartials({});
    setSessionStatus(null);
    setSessionTitle("");
    setSessionTitleSource("");
    setSessionCreatedAt("");
    setSessionJoinedAt("");
    setSessionEndedAt("");
    setConnectionStatus("loading");
    setError(null);

    let active = true;
    const historyDebugUrl = workspaceId
      ? buildWorkspaceMeetingSessionTranscriptHistoryDebugUrl(workspaceId, normalizedSessionId, 100)
      : buildMeetingSessionTranscriptHistoryDebugUrl(normalizedSessionId, 100);
    const websocketUrl = workspaceId
      ? buildWorkspaceMeetingSessionTranscriptWebSocketUrl(workspaceId, normalizedSessionId)
      : buildTranscriptWebSocketUrl({ sessionId: normalizedSessionId });

    meetingStartDebug("meeting-page", "transcript subscription started", {
      sessionId: normalizedSessionId,
      historyUrl: historyDebugUrl,
      websocketUrl: maskWebSocketUrl(websocketUrl),
    });

    async function loadInitialData() {
      try {
        meetingStartDebug("meeting-page", "session data loading started", {
          sessionId: normalizedSessionId,
        });
        const session = workspaceId
          ? await getWorkspaceMeetingSession(workspaceId, normalizedSessionId)
          : await getMeetingSession(normalizedSessionId);
        if (!active) {
          return;
        }
        setSessionStatus(session.status);
        setSessionTitle(session.title ?? "");
        setSessionTitleSource(session.titleSource ?? "");
        setSessionCreatedAt(session.createdAt ?? "");
        setSessionJoinedAt(
          (current) =>
            (session.joinedAt ?? current) ||
            (isElapsedMeetingSessionStatus(session.status) ? (session.createdAt ?? "") : ""),
        );
        setSessionEndedAt((current) => session.endedAt ?? current);
        const statusError = sessionStatusErrorMessage(session.status);
        if (statusError) {
          setError(statusError);
        }
        meetingStartDebug("meeting-page", "session data loaded", {
          sessionId: normalizedSessionId,
          title: session.title ?? null,
          titleSource: session.titleSource ?? null,
          meetingUrlHash: session.meetingUrlHash ?? null,
          status: session.status,
        });
      } catch (cause) {
        if (!active) {
          return;
        }
        setError(`会議セッションを復元できませんでした: ${errorMessage(cause)}`);
        meetingStartDebug("meeting-page", "session data load failed", {
          sessionId: normalizedSessionId,
          message: errorMessage(cause),
        });
      }
    }

    async function loadTranscriptHistory(attempt = 0) {
      clearReconnectTimer(historyRetryTimerRef);
      try {
        meetingStartDebug("meeting-page", "transcript history loading started", {
          sessionId: normalizedSessionId,
          historyUrl: historyDebugUrl,
          attempt,
        });
        const history = workspaceId
          ? await fetchWorkspaceMeetingSessionTranscriptSegmentHistory(
              workspaceId,
              normalizedSessionId,
              100,
            )
          : await fetchMeetingSessionTranscriptSegmentHistory(normalizedSessionId, 100);
        if (!active) {
          return;
        }
        appendSegments(history.segments, "history");
        setError((current) => (current === transcriptHistoryRetryMessage ? null : current));
        meetingStartDebug("meeting-page", "transcript history loaded", {
          sessionId: normalizedSessionId,
          historyCount: history.segments.length,
          historyUnavailable: history.unavailable,
          attempt,
        });
      } catch (cause) {
        if (!active) {
          return;
        }
        const delay =
          historyRetryDelaysMs[Math.min(attempt, historyRetryDelaysMs.length - 1)] ?? null;
        const willRetry = delay !== null;
        setError((current) => current ?? transcriptHistoryRetryMessage);
        meetingStartDebug("meeting-page", "transcript history load failed", {
          sessionId: normalizedSessionId,
          historyUrl: historyDebugUrl,
          attempt,
          message: errorMessage(cause),
          willRetry,
          retryDelayMs: delay,
        });
        if (willRetry) {
          historyRetryTimerRef.current = setTimeout(() => {
            void loadTranscriptHistory(attempt + 1);
          }, delay);
        }
      }
    }

    function connect(reconnecting = false) {
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      socketRef.current?.close();

      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;
      setConnectionStatus(reconnecting ? "reconnecting" : "connecting");
      meetingStartDebug("meeting-page", "WebSocket connecting", {
        sessionId: normalizedSessionId,
        reconnecting,
        url: maskWebSocketUrl(websocketUrl),
      });

      connectTimeoutRef.current = setTimeout(() => {
        if (!active || socketRef.current !== socket || socket.readyState !== WebSocket.CONNECTING) {
          return;
        }
        setConnectionStatus("error");
        meetingStartDebug("meeting-page", "WebSocket connect timeout", {
          sessionId: normalizedSessionId,
          timeoutMs: websocketConnectTimeoutMs,
          url: maskWebSocketUrl(websocketUrl),
          readyState: socket.readyState,
        });
        socket.close();
      }, websocketConnectTimeoutMs);

      socket.addEventListener("open", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        clearReconnectTimer(connectTimeoutRef);
        reconnectAttemptRef.current = 0;
        setConnectionStatus("connected");
        meetingStartDebug("meeting-page", "WebSocket connected", {
          sessionId: normalizedSessionId,
          url: maskWebSocketUrl(websocketUrl),
        });
      });

      socket.addEventListener("message", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        try {
          const raw = String(event.data);
          meetingStartDebug("meeting-page", "transcript WebSocket message received", {
            sessionId: normalizedSessionId,
            url: maskWebSocketUrl(websocketUrl),
            length: raw.length,
            payload: truncateForLog(raw),
          });
          const parsed = parseTranscriptWebSocketEvent(raw);
          if (parsed.sessionStatus && parsed.sessionStatus.sessionId === activeSessionRef.current) {
            setSessionStatus(parsed.sessionStatus.status);
            if (parsed.sessionStatus.title) {
              setSessionTitle(parsed.sessionStatus.title);
            }
            if (parsed.sessionStatus.titleSource) {
              setSessionTitleSource(parsed.sessionStatus.titleSource);
            }
            if (parsed.sessionStatus.joinedAt) {
              setSessionJoinedAt(parsed.sessionStatus.joinedAt);
            } else if (isElapsedMeetingSessionStatus(parsed.sessionStatus.status)) {
              setSessionJoinedAt((current) => current || new Date().toISOString());
            }
            if (parsed.sessionStatus.endedAt) {
              setSessionEndedAt(parsed.sessionStatus.endedAt);
            }
            meetingStartDebug("meeting-page", "session status received", {
              sessionId: parsed.sessionStatus.sessionId,
              title: parsed.sessionStatus.title ?? null,
              titleSource: parsed.sessionStatus.titleSource ?? null,
              provider: parsed.sessionStatus.provider ?? null,
              externalMeetingId: parsed.sessionStatus.externalMeetingId ?? null,
              joinMeetingId: parsed.sessionStatus.joinMeetingId ?? null,
              joinWebUrl: parsed.sessionStatus.joinWebUrl ?? null,
              threadId: parsed.sessionStatus.threadId ?? null,
              organizerId: parsed.sessionStatus.organizerId ?? null,
              titleResolutionErrorCode: parsed.sessionStatus.titleResolutionErrorCode ?? null,
              titleResolutionErrorMessage: parsed.sessionStatus.titleResolutionErrorMessage ?? null,
              status: parsed.sessionStatus.status,
            });
            const statusError = sessionStatusErrorMessage(parsed.sessionStatus.status);
            if (statusError) {
              setError(statusError);
            }
            return;
          }

          if (parsed.sessionStatus) {
            meetingStartDebug("meeting-page", "session status ignored", {
              reason: "session_id_mismatch",
              currentSessionId: activeSessionRef.current,
              receivedSessionId: parsed.sessionStatus.sessionId,
              status: parsed.sessionStatus.status,
            });
            return;
          }

          if (parsed.segment) {
            meetingStartDebug("meeting-page", "transcript received", {
              sessionId: parsed.segment.sessionId ?? null,
              currentSessionId: activeSessionRef.current,
              eventId: parsed.segment.eventId ?? null,
              callId: parsed.segment.callId,
              sequenceNo: parsed.segment.sequenceNo,
              isFinal: parsed.segment.isFinal,
              speakerId: parsed.segment.speakerId ?? null,
              speakerName: parsed.segment.speakerName ?? null,
              textLength: parsed.segment.text.trim().length,
            });
            if (!parsed.segment.isFinal) {
              applyPartial(parsed.segment, "websocket");
              return;
            }
            appendSegments([parsed.segment], "websocket");
            return;
          }

          meetingStartDebug("meeting-page", "transcript event ignored", {
            reason: "unsupported_or_empty_event",
            type: parsed.type,
            sentAtUtc: parsed.sentAtUtc ?? null,
          });
        } catch (cause) {
          setError(`文字起こしイベントを解析できませんでした: ${errorMessage(cause)}`);
          meetingStartDebug("meeting-page", "transcript event parse failed", {
            sessionId: normalizedSessionId,
            message: errorMessage(cause),
          });
        }
      });

      socket.addEventListener("error", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        clearReconnectTimer(connectTimeoutRef);
        setConnectionStatus("error");
        meetingStartDebug("meeting-page", "WebSocket error", {
          sessionId: normalizedSessionId,
          url: maskWebSocketUrl(websocketUrl),
          readyState: socket.readyState,
        });
      });

      socket.addEventListener("close", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        clearReconnectTimer(connectTimeoutRef);
        socketRef.current = null;
        if (!shouldReconnectRef.current) {
          setConnectionStatus("closed");
          meetingStartDebug("meeting-page", "WebSocket closed", {
            sessionId: normalizedSessionId,
            url: maskWebSocketUrl(websocketUrl),
            code: event.code,
            reason: event.reason || null,
            wasClean: event.wasClean,
          });
          return;
        }

        const delay =
          reconnectDelaysMs[Math.min(reconnectAttemptRef.current, reconnectDelaysMs.length - 1)];
        reconnectAttemptRef.current += 1;
        setConnectionStatus("reconnecting");
        meetingStartDebug("meeting-page", "WebSocket reconnect scheduled", {
          sessionId: normalizedSessionId,
          url: maskWebSocketUrl(websocketUrl),
          delay,
          code: event.code,
          reason: event.reason || null,
          wasClean: event.wasClean,
        });
        reconnectTimerRef.current = setTimeout(() => connect(true), delay);
      });
    }

    void loadInitialData();
    void loadTranscriptHistory();
    connect(false);

    return () => {
      active = false;
      shouldReconnectRef.current = false;
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(historyRetryTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      socketRef.current?.close();
      socketRef.current = null;
      meetingStartDebug("meeting-page", "transcript subscription closed", {
        sessionId: normalizedSessionId,
        reason: "effect_cleanup",
      });
    };
  }, [appendSegments, applyPartial, normalizedSessionId, workspaceId]);

  useEffect(() => {
    if (connectWebSocket) {
      return;
    }
    shouldReconnectRef.current = false;
    clearReconnectTimer(reconnectTimerRef);
    clearReconnectTimer(historyRetryTimerRef);
    clearReconnectTimer(connectTimeoutRef);
    if (socketRef.current) {
      meetingStartDebug("meeting-page", "WebSocket closed by meeting UI state", {
        sessionId: normalizedSessionId,
        reason: "meeting_ended_modal_opened",
      });
      socketRef.current.close(1000, "meeting ended");
      socketRef.current = null;
    }
    setConnectionStatus((current) => (current === "idle" ? current : "closed"));
  }, [connectWebSocket, normalizedSessionId]);

  return useMemo(
    () => ({
      sessionId: normalizedSessionId,
      sessionTitle,
      sessionTitleSource,
      sessionCreatedAt,
      sessionJoinedAt,
      sessionEndedAt,
      sessionStatus,
      connectionStatus,
      error,
      rawSegments: segments,
      partials: Object.values(partials)
        .sort((a, b) => a.startedAtMs - b.startedAtMs)
        .map(transcriptPartialEntryToRuntimePartial),
      segments: segments.map((segment) =>
        transcriptSegmentToMeetingSegment(segment, meetingId, normalizedSessionId),
      ),
    }),
    [
      connectionStatus,
      error,
      meetingId,
      normalizedSessionId,
      partials,
      segments,
      sessionCreatedAt,
      sessionEndedAt,
      sessionJoinedAt,
      sessionStatus,
      sessionTitle,
      sessionTitleSource,
    ],
  );
}

function transcriptSegmentToMeetingSegment(
  segment: TranscriptSegment,
  meetingId: string | undefined,
  sessionId: string,
): MeetingSegmentDto {
  const startMs = ticksToMilliseconds(segment.offsetTicks ?? 0);
  const endMs = startMs + ticksToMilliseconds(segment.durationTicks ?? 0);
  const sequenceNo = Number.isFinite(segment.sequenceNo) ? segment.sequenceNo : 0;

  return {
    meeting_id: meetingId ?? sessionId,
    seq: sequenceNo,
    segment_id:
      segment.eventId ??
      `transcript:${segment.sessionId ?? sessionId}:${segment.callId}:${sequenceNo}`,
    speaker_label: transcriptSpeakerLabel(segment),
    ...(segment.speakerId ? { speaker_id: segment.speakerId } : {}),
    ...(segment.speakerName ? { speaker_name: segment.speakerName } : {}),
    text: segment.text,
    start_ms: startMs,
    end_ms: endMs >= startMs ? endMs : startMs,
    created_at: segment.recognizedAtUtc,
  };
}

function transcriptPartialEntryToRuntimePartial(entry: TranscriptPartialEntry): RuntimePartial {
  const recognizedAtMs = Date.parse(entry.segment.recognizedAtUtc);
  return {
    partial_id: entry.key,
    speaker_label: transcriptSpeakerLabel(entry.segment),
    text: entry.segment.text,
    start_ms: transcriptSegmentStartMs(entry.segment) ?? 0,
    ts_ms: Number.isNaN(recognizedAtMs) ? 0 : recognizedAtMs,
  };
}

function upsertPartialEntry(
  current: Record<string, TranscriptPartialEntry>,
  segment: TranscriptSegment,
) {
  const baseKey = transcriptPartialBaseKey(segment);
  const latest = latestPartialEntry(current, baseKey);
  if (latest && shouldContinuePartialEntry(latest.entry, segment)) {
    return pruneSupersededPartialEntries({
      ...current,
      [latest.key]: updatePartialEntry(latest.entry, segment),
    });
  }

  const entry = createPartialEntry(segment, baseKey, current);
  return pruneSupersededPartialEntries({ ...current, [entry.key]: entry });
}

function removeReplacedPartialEntries(
  entries: Record<string, TranscriptPartialEntry>,
  finalSegment: TranscriptSegment,
) {
  const baseKey = transcriptPartialBaseKey(finalSegment);
  const sameBaseEntries = Object.entries(entries).filter(([, entry]) => entry.baseKey === baseKey);
  if (sameBaseEntries.length === 0) {
    return false;
  }

  const matchedEntries = sameBaseEntries.filter(([, entry]) =>
    partialEntryMatchesFinalSegment(entry, finalSegment),
  );
  const entriesToRemove =
    matchedEntries.length > 0 ? matchedEntries : [latestEntryFromPairs(sameBaseEntries)];
  let changed = false;
  for (const [key] of entriesToRemove) {
    delete entries[key];
    changed = true;
  }
  return changed;
}

function createPartialEntry(
  segment: TranscriptSegment,
  baseKey: string,
  current: Record<string, TranscriptPartialEntry>,
): TranscriptPartialEntry {
  const activityMs = transcriptSegmentTimestampMs(segment);
  const startedOffsetMs = transcriptSegmentStartMs(segment);
  const latestEndMs = transcriptSegmentEndMs(segment) ?? activityMs;
  const key = uniquePartialKey(`${baseKey}:${Math.max(0, Math.floor(activityMs))}`, current);
  return {
    key,
    baseKey,
    segment,
    startedAtMs: activityMs,
    startedOffsetMs,
    latestActivityMs: activityMs,
    latestEndMs,
  };
}

function updatePartialEntry(
  entry: TranscriptPartialEntry,
  segment: TranscriptSegment,
): TranscriptPartialEntry {
  const activityMs = transcriptSegmentTimestampMs(segment);
  const latestEndMs = transcriptSegmentEndMs(segment) ?? activityMs;
  return {
    ...entry,
    segment,
    latestActivityMs: Math.max(entry.latestActivityMs, activityMs),
    latestEndMs: Math.max(entry.latestEndMs, latestEndMs),
  };
}

function shouldContinuePartialEntry(entry: TranscriptPartialEntry, segment: TranscriptSegment) {
  const nextActivityMs = transcriptSegmentTimestampMs(segment);
  if (partialTextLooksRelated(entry.segment.text, segment.text)) {
    return true;
  }

  const nextStartMs = transcriptSegmentStartMs(segment);
  const nextEndMs = transcriptSegmentEndMs(segment);
  if (nextStartMs !== null && nextEndMs !== null && entry.startedOffsetMs !== null) {
    return (
      entry.startedOffsetMs <= nextEndMs + partialBubbleGapThresholdMs &&
      nextStartMs <= entry.latestEndMs + partialBubbleGapThresholdMs
    );
  }

  return nextActivityMs - entry.latestActivityMs <= partialBubbleGapThresholdMs;
}

function partialEntryMatchesFinalSegment(
  entry: TranscriptPartialEntry,
  finalSegment: TranscriptSegment,
) {
  if (partialTextLooksRelated(entry.segment.text, finalSegment.text)) {
    return true;
  }

  const finalStartMs = transcriptSegmentStartMs(finalSegment);
  const finalEndMs = transcriptSegmentEndMs(finalSegment);
  if (finalStartMs === null || finalEndMs === null || entry.startedOffsetMs === null) {
    return false;
  }
  return (
    entry.startedOffsetMs <= finalEndMs + partialBubbleGapThresholdMs &&
    finalStartMs <= entry.latestEndMs + partialBubbleGapThresholdMs
  );
}

function latestPartialEntry(entries: Record<string, TranscriptPartialEntry>, baseKey: string) {
  const pairs = Object.entries(entries).filter(([, entry]) => entry.baseKey === baseKey);
  if (pairs.length === 0) {
    return null;
  }
  const [key, entry] = latestEntryFromPairs(pairs);
  return { key, entry };
}

function latestEntryFromPairs(pairs: Array<[string, TranscriptPartialEntry]>) {
  return pairs.reduce((latest, current) =>
    current[1].latestActivityMs >= latest[1].latestActivityMs ? current : latest,
  );
}

function pruneSupersededPartialEntries(entries: Record<string, TranscriptPartialEntry>) {
  const groupedEntries = Object.entries(entries).reduce<
    Record<string, Array<[string, TranscriptPartialEntry]>>
  >((groups, pair) => {
    const baseKey = pair[1].baseKey;
    groups[baseKey] = [...(groups[baseKey] ?? []), pair];
    return groups;
  }, {});
  const next = { ...entries };

  for (const pairs of Object.values(groupedEntries)) {
    if (pairs.length < 2) {
      continue;
    }
    const [keeperKey, keeper] = latestEntryFromPairs(pairs);
    for (const [key, entry] of pairs) {
      if (key === keeperKey) {
        continue;
      }
      if (partialTextLooksRelated(entry.segment.text, keeper.segment.text)) {
        delete next[key];
      }
    }
  }

  return next;
}

function partialTextLooksRelated(previousText: string, nextText: string) {
  const previous = normalizePartialText(previousText);
  const next = normalizePartialText(nextText);
  if (!previous || !next) {
    return false;
  }
  if (previous === next || previous.startsWith(next) || next.startsWith(previous)) {
    return true;
  }

  const sharedPrefixLength = commonPrefixLength(previous, next);
  const shorterLength = Math.min(previous.length, next.length);
  return sharedPrefixLength >= Math.min(8, Math.ceil(shorterLength * 0.7));
}

function normalizePartialText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function commonPrefixLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function uniquePartialKey(preferredKey: string, entries: Record<string, TranscriptPartialEntry>) {
  if (!entries[preferredKey]) {
    return preferredKey;
  }
  let index = 2;
  while (entries[`${preferredKey}:${index}`]) {
    index += 1;
  }
  return `${preferredKey}:${index}`;
}

function transcriptPartialBaseKey(segment: TranscriptSegment) {
  const speakerKey =
    segment.speakerId?.trim() ||
    segment.speakerName?.trim() ||
    segment.speakerLabel?.trim() ||
    "unknown";
  return ["partial", segment.sessionId ?? "", segment.callId, speakerKey]
    .map(partialKeyComponent)
    .join(":");
}

function partialKeyComponent(value: string) {
  return encodeURIComponent(value);
}

function transcriptSegmentStartMs(segment: TranscriptSegment) {
  if (typeof segment.offsetTicks === "number") {
    return ticksToMilliseconds(segment.offsetTicks);
  }
  return null;
}

function transcriptSegmentEndMs(segment: TranscriptSegment) {
  const startMs = transcriptSegmentStartMs(segment);
  if (startMs === null) {
    return null;
  }
  return startMs + ticksToMilliseconds(segment.durationTicks ?? 0);
}

function transcriptSegmentTimestampMs(segment: TranscriptSegment) {
  const timestamp = Date.parse(segment.recognizedAtUtc);
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function isElapsedMeetingSessionStatus(status: MeetingSessionStatus) {
  return status === "joined" || status === "active" || status === "recording";
}

function transcriptSpeakerLabel(segment: TranscriptSegment) {
  const speakerName = segment.speakerName?.trim();
  if (speakerName) {
    return speakerName;
  }
  const speakerLabel = segment.speakerLabel?.trim();
  if (speakerLabel) {
    return speakerLabel;
  }
  const speakerId = segment.speakerId?.trim();
  if (speakerId) {
    return `話者 ${compactSpeakerId(speakerId)}`;
  }
  return "話者不明";
}

function compactSpeakerId(speakerId: string) {
  if (speakerId.length <= 24) {
    return speakerId;
  }
  const lastPart = speakerId.split(":").filter(Boolean).at(-1);
  if (lastPart && lastPart.length <= 24) {
    return lastPart;
  }
  return `${speakerId.slice(0, 21)}...`;
}

function ticksToMilliseconds(ticks: number) {
  return Math.max(0, Math.floor(ticks / ticksPerMillisecond));
}

function sortTranscriptSegments(segments: TranscriptSegment[]) {
  return [...segments].sort((a, b) => {
    const timeA = Date.parse(a.recognizedAtUtc);
    const timeB = Date.parse(b.recognizedAtUtc);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.sequenceNo - b.sequenceNo;
  });
}

function clearReconnectTimer(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "unknown error";
}

function sessionStatusErrorMessage(status: MeetingSessionStatus) {
  switch (status) {
    case "failed":
      return "会議セッションがfailedになりました。Bot側のログを確認してください。";
    case "stale":
      return "会議セッションがstaleになりました。再度会議URLから入室してください。";
    case "timeout":
      return "会議セッションがtimeoutになりました。再度会議URLから入室してください。";
    default:
      return null;
  }
}

function truncateForLog(value: string, maxLength = 1200) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}
