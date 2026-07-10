import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { listMeetingEvents, listMeetingSegments } from "~/api/meetings/meetingEventsApi";
import { meetingRealtimeUrl } from "~/api/meetings/meetingRealtimeClient";
import { endMeeting, getMeeting, type MeetingDto } from "~/api/meetings/meetingsApi";
import {
  initialMeetingRuntimeState,
  meetingRuntimeReducer,
} from "~/api/meetings/meetingRuntimeReducer";
import { isPermanentRealtimeApiError, realtimeRecoveryDecision } from "~/utils/realtimeRecovery";

export function useMeetingRuntime(meetingId: string | undefined) {
  const [state, dispatch] = useReducer(meetingRuntimeReducer, initialMeetingRuntimeState);
  const [isEnding, setIsEnding] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const lastSeqRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(false);

  useEffect(() => {
    lastSeqRef.current = state.lastSeq;
  }, [state.lastSeq]);

  useEffect(() => {
    if (!meetingId) {
      dispatch({ type: "reset" });
      setRecoveryRequired(false);
      return;
    }

    const currentMeetingId = meetingId;
    let active = true;
    let failedAttempts = 0;
    shouldReconnectRef.current = true;
    setRecoveryRequired(false);
    dispatch({ type: "loading" });

    async function load() {
      try {
        const [meeting, eventsResult, segmentsResult] = await Promise.all([
          getMeeting(currentMeetingId),
          listMeetingEvents(currentMeetingId, 0),
          listMeetingSegments(currentMeetingId, 0),
        ]);
        if (!active) {
          return;
        }
        dispatch({
          type: "loaded",
          meeting,
          events: eventsResult.events,
          segments: segmentsResult.segments,
        });
        if (meeting.status === "ended") {
          shouldReconnectRef.current = false;
          dispatch({ type: "connection", status: "closed" });
          return;
        }
        connect(meeting, false);
      } catch (error) {
        if (!active) {
          return;
        }
        shouldReconnectRef.current = false;
        setRecoveryRequired(true);
        dispatch({ type: "error", message: errorMessage(error) });
      }
    }

    async function resync(afterSeq: number) {
      const [meeting, eventsResult, segmentsResult] = await Promise.all([
        getMeeting(currentMeetingId),
        listMeetingEvents(currentMeetingId, afterSeq),
        listMeetingSegments(currentMeetingId, afterSeq),
      ]);
      if (!active) {
        return null;
      }
      dispatch({
        type: "resynced",
        meeting,
        events: eventsResult.events,
        segments: segmentsResult.segments,
      });
      return meeting;
    }

    function stopRecovery(message: string) {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      setRecoveryRequired(true);
      dispatch({ type: "error", message });
    }

    function connect(meeting: MeetingDto, reconnecting: boolean) {
      cleanupSocket();
      dispatch({ type: "connection", status: reconnecting ? "reconnecting" : "connecting" });
      const socket = new WebSocket(meetingRealtimeUrl(meeting.id, lastSeqRef.current));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        failedAttempts = 0;
        setRecoveryRequired(false);
        dispatch({ type: "connection", status: "connected" });
        socket.send(
          JSON.stringify({
            type: "client.hello",
            meeting_id: meeting.id,
            last_seq: lastSeqRef.current,
          }),
        );

        if (reconnecting) {
          const resyncFrom = lastSeqRef.current;
          void resync(resyncFrom)
            .then((snapshot) => {
              if (!snapshot || snapshot.status !== "ended" || socketRef.current !== socket) {
                return;
              }
              shouldReconnectRef.current = false;
              socket.close(1000, "meeting ended");
            })
            .catch((cause: unknown) => {
              if (!active || socketRef.current !== socket) {
                return;
              }
              if (isPermanentRealtimeApiError(cause)) {
                socketRef.current = null;
                socket.close();
                stopRecovery("会議へのアクセスを確認できませんでした。再読み込みしてください。");
              }
            });
        }
      });

      socket.addEventListener("message", (message) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        try {
          const event = JSON.parse(String(message.data));
          dispatch({ type: "event", event });
        } catch {
          dispatch({ type: "error", message: "リアルタイムイベントを解析できませんでした。" });
        }
      });

      socket.addEventListener("error", () => {
        if (active && socketRef.current === socket) {
          dispatch({ type: "connection", status: "error" });
        }
      });

      socket.addEventListener("close", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        socketRef.current = null;
        if (!shouldReconnectRef.current) {
          dispatch({ type: "connection", status: "closed" });
          return;
        }

        failedAttempts += 1;
        const decision = realtimeRecoveryDecision(failedAttempts, event.code);
        if (decision.action === "stop") {
          stopRecovery(
            decision.reason === "permanent"
              ? "リアルタイム接続の認証または権限が失われました。再読み込みしてください。"
              : "リアルタイム接続を自動復旧できませんでした。手動で再接続してください。",
          );
          return;
        }

        dispatch({ type: "connection", status: "reconnecting" });
        void (async () => {
          let nextMeeting = meeting;
          if (decision.probe) {
            try {
              const snapshot = await resync(lastSeqRef.current);
              if (!active || !snapshot) {
                return;
              }
              nextMeeting = snapshot;
              if (snapshot.status === "ended") {
                shouldReconnectRef.current = false;
                dispatch({ type: "connection", status: "closed" });
                return;
              }
            } catch (cause) {
              if (!active) {
                return;
              }
              if (isPermanentRealtimeApiError(cause)) {
                stopRecovery("会議へのアクセスを確認できませんでした。再読み込みしてください。");
                return;
              }
            }
          }
          reconnectTimerRef.current = setTimeout(
            () => connect(nextMeeting, true),
            decision.delayMs,
          );
        })();
      });
    }

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function cleanupSocket() {
      clearReconnectTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    }

    void load();

    return () => {
      active = false;
      shouldReconnectRef.current = false;
      cleanupSocket();
    };
  }, [meetingId, retryGeneration]);

  const finishMeeting = useCallback(async () => {
    if (!meetingId) {
      return null;
    }
    setIsEnding(true);
    try {
      const result = await endMeeting(meetingId);
      for (const event of result.events) {
        dispatch({ type: "event", event });
      }
      return result.report;
    } finally {
      setIsEnding(false);
    }
  }, [meetingId]);

  const retryConnection = useCallback(() => {
    setRetryGeneration((current) => current + 1);
  }, []);

  return useMemo(
    () => ({
      ...state,
      isEnding,
      recoveryRequired,
      finishMeeting,
      retryConnection,
    }),
    [state, isEnding, recoveryRequired, finishMeeting, retryConnection],
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "会議を読み込めませんでした。";
}
