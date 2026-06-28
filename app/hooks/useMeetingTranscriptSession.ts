import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  getMeetingSession,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import { updateMeetingSessionRecordStatus } from "~/api/meetingSessions/meetingSessionRegistry";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import {
  buildMeetingSessionTranscriptHistoryDebugUrl,
  buildTranscriptWebSocketUrl,
  fetchMeetingSessionTranscriptSegmentHistory,
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
const transcriptHistoryRetryMessage = "文字起こし履歴を取得中/再試行中です。";
const ticksPerMillisecond = 10_000;

export function useMeetingTranscriptSession(
  meetingId: string | undefined,
  sessionId: string | null | undefined,
  workspaceId?: string,
) {
  const normalizedSessionId = sessionId?.trim() ?? "";
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [sessionStatus, setSessionStatus] = useState<MeetingSessionStatus | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<TranscriptSessionConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const mismatchSamples: Array<Record<string, unknown>> = [];
      for (const segment of incoming) {
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
        mismatchSamples,
      });

      if (accepted.length === 0) {
        return;
      }

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

  useEffect(() => {
    if (!normalizedSessionId) {
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(historyRetryTimerRef);
      shouldReconnectRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
      activeSessionRef.current = "";
      reconnectAttemptRef.current = 0;
      seenKeysRef.current.clear();
      setSegments([]);
      setSessionStatus(null);
      setConnectionStatus("idle");
      setError(null);
      return;
    }

    activeSessionRef.current = normalizedSessionId;
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    seenKeysRef.current.clear();
    setSegments([]);
    setSessionStatus(null);
    setConnectionStatus("loading");
    setError(null);

    let active = true;
    const historyDebugUrl = buildMeetingSessionTranscriptHistoryDebugUrl(normalizedSessionId, 100);
    const websocketUrl = buildTranscriptWebSocketUrl({ sessionId: normalizedSessionId });

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
        const session = await getMeetingSession(normalizedSessionId);
        if (!active) {
          return;
        }
        setSessionStatus(session.status);
        const statusError = sessionStatusErrorMessage(session.status);
        if (statusError) {
          setError(statusError);
        }
        if (workspaceId) {
          updateMeetingSessionRecordStatus(workspaceId, normalizedSessionId, session.status);
        }
        meetingStartDebug("meeting-page", "session data loaded", {
          sessionId: normalizedSessionId,
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
        const history = await fetchMeetingSessionTranscriptSegmentHistory(normalizedSessionId, 100);
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
      socketRef.current?.close();

      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;
      setConnectionStatus(reconnecting ? "reconnecting" : "connecting");
      meetingStartDebug("meeting-page", "WebSocket connecting", {
        sessionId: normalizedSessionId,
        reconnecting,
        url: maskWebSocketUrl(websocketUrl),
      });

      socket.addEventListener("open", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        reconnectAttemptRef.current = 0;
        setConnectionStatus("connected");
        meetingStartDebug("meeting-page", "WebSocket connected", {
          sessionId: normalizedSessionId,
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
            length: raw.length,
            payload: truncateForLog(raw),
          });
          const parsed = parseTranscriptWebSocketEvent(raw);
          if (parsed.sessionStatus && parsed.sessionStatus.sessionId === activeSessionRef.current) {
            setSessionStatus(parsed.sessionStatus.status);
            meetingStartDebug("meeting-page", "session status received", {
              sessionId: parsed.sessionStatus.sessionId,
              status: parsed.sessionStatus.status,
            });
            if (workspaceId) {
              updateMeetingSessionRecordStatus(
                workspaceId,
                parsed.sessionStatus.sessionId,
                parsed.sessionStatus.status,
              );
            }
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
              speakerId: parsed.segment.speakerId ?? null,
              speakerName: parsed.segment.speakerName ?? null,
              textLength: parsed.segment.text.trim().length,
            });
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
        setConnectionStatus("error");
        setError("文字起こしWebSocketでエラーが発生しました。");
        meetingStartDebug("meeting-page", "WebSocket error", {
          sessionId: normalizedSessionId,
        });
      });

      socket.addEventListener("close", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        socketRef.current = null;
        if (!shouldReconnectRef.current) {
          setConnectionStatus("closed");
          meetingStartDebug("meeting-page", "WebSocket closed", {
            sessionId: normalizedSessionId,
            code: event.code,
            reason: event.reason || null,
          });
          return;
        }

        const delay =
          reconnectDelaysMs[Math.min(reconnectAttemptRef.current, reconnectDelaysMs.length - 1)];
        reconnectAttemptRef.current += 1;
        setConnectionStatus("reconnecting");
        meetingStartDebug("meeting-page", "WebSocket reconnect scheduled", {
          sessionId: normalizedSessionId,
          delay,
          code: event.code,
          reason: event.reason || null,
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
      socketRef.current?.close();
      socketRef.current = null;
      meetingStartDebug("meeting-page", "transcript subscription closed", {
        sessionId: normalizedSessionId,
        reason: "effect_cleanup",
      });
    };
  }, [appendSegments, normalizedSessionId, workspaceId]);

  return useMemo(
    () => ({
      sessionId: normalizedSessionId,
      sessionStatus,
      connectionStatus,
      error,
      rawSegments: segments,
      segments: segments.map((segment) =>
        transcriptSegmentToMeetingSegment(segment, meetingId, normalizedSessionId),
      ),
    }),
    [connectionStatus, error, meetingId, normalizedSessionId, segments, sessionStatus],
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
