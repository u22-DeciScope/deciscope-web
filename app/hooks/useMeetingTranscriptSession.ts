import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  getMeetingSession,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import { updateMeetingSessionRecordStatus } from "~/api/meetingSessions/meetingSessionRegistry";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import {
  buildTranscriptWebSocketUrl,
  fetchTranscriptSegmentHistory,
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
  const reconnectAttemptRef = useRef(0);
  const seenKeysRef = useRef(new Set<string>());
  const activeSessionRef = useRef("");
  const shouldReconnectRef = useRef(false);

  const appendSegments = useCallback(
    (incoming: TranscriptSegment[]) => {
      if (!normalizedSessionId) {
        return;
      }

      const accepted: TranscriptSegment[] = [];
      for (const segment of incoming) {
        if (segment.sessionId !== normalizedSessionId) {
          continue;
        }
        if (!segment.text.trim()) {
          continue;
        }
        const key = transcriptSegmentKey(segment);
        if (seenKeysRef.current.has(key)) {
          continue;
        }
        seenKeysRef.current.add(key);
        accepted.push(segment);
      }

      if (accepted.length === 0) {
        return;
      }

      setSegments((current) => sortTranscriptSegments([...current, ...accepted]));
    },
    [normalizedSessionId],
  );

  useEffect(() => {
    if (!normalizedSessionId) {
      clearReconnectTimer(reconnectTimerRef);
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

    async function loadInitialData() {
      try {
        meetingStartDebug("meeting-page", "session data loading started", {
          sessionId: normalizedSessionId,
        });
        const [session, history] = await Promise.all([
          getMeetingSession(normalizedSessionId),
          fetchTranscriptSegmentHistory({ sessionId: normalizedSessionId }, 100),
        ]);
        if (!active) {
          return;
        }
        setSessionStatus(session.status);
        if (workspaceId) {
          updateMeetingSessionRecordStatus(workspaceId, normalizedSessionId, session.status);
        }
        appendSegments(history.segments);
        meetingStartDebug("meeting-page", "session data loaded", {
          sessionId: normalizedSessionId,
          status: session.status,
          historyCount: history.segments.length,
        });
      } catch (cause) {
        if (!active) {
          return;
        }
        setError(errorMessage(cause));
        meetingStartDebug("meeting-page", "session data load failed", {
          sessionId: normalizedSessionId,
          message: errorMessage(cause),
        });
      }
    }

    function connect(reconnecting = false) {
      clearReconnectTimer(reconnectTimerRef);
      socketRef.current?.close();

      const socket = new WebSocket(buildTranscriptWebSocketUrl({ sessionId: normalizedSessionId }));
      socketRef.current = socket;
      setConnectionStatus(reconnecting ? "reconnecting" : "connecting");
      meetingStartDebug("meeting-page", "WebSocket connecting", {
        sessionId: normalizedSessionId,
        reconnecting,
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
          const parsed = parseTranscriptWebSocketEvent(String(event.data));
          if (parsed.sessionStatus && parsed.sessionStatus.sessionId === activeSessionRef.current) {
            setSessionStatus(parsed.sessionStatus.status);
            if (workspaceId) {
              updateMeetingSessionRecordStatus(
                workspaceId,
                parsed.sessionStatus.sessionId,
                parsed.sessionStatus.status,
              );
            }
            if (parsed.sessionStatus.status === "failed") {
              setError("会議セッションがfailedになりました。Bot側のログを確認してください。");
            }
            return;
          }

          if (parsed.segment) {
            appendSegments([parsed.segment]);
          }
        } catch (cause) {
          setError(`文字起こしイベントを解析できませんでした: ${errorMessage(cause)}`);
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

      socket.addEventListener("close", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        socketRef.current = null;
        if (!shouldReconnectRef.current) {
          setConnectionStatus("closed");
          meetingStartDebug("meeting-page", "WebSocket closed", {
            sessionId: normalizedSessionId,
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
        });
        reconnectTimerRef.current = setTimeout(() => connect(true), delay);
      });
    }

    void loadInitialData();
    connect(false);

    return () => {
      active = false;
      shouldReconnectRef.current = false;
      clearReconnectTimer(reconnectTimerRef);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [appendSegments, normalizedSessionId]);

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
