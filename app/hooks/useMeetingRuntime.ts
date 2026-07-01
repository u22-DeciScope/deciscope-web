import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { listMeetingEvents, listMeetingSegments } from "~/api/meetings/meetingEventsApi";
import { meetingRealtimeUrl } from "~/api/meetings/meetingRealtimeClient";
import {
  endMeeting,
  getMeeting,
  type MeetingDto,
} from "~/api/meetings/meetingsApi";
import {
  initialMeetingRuntimeState,
  meetingRuntimeReducer,
} from "~/api/meetings/meetingRuntimeReducer";

const reconnectDelayMs = 1200;

export function useMeetingRuntime(meetingId: string | undefined) {
  const [state, dispatch] = useReducer(meetingRuntimeReducer, initialMeetingRuntimeState);
  const [isEnding, setIsEnding] = useState(false);
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
      return;
    }

    const currentMeetingId = meetingId;
    let active = true;
    shouldReconnectRef.current = true;
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
        connect(meeting);
      } catch (error) {
        if (!active) {
          return;
        }
        dispatch({ type: "error", message: errorMessage(error) });
      }
    }

    function connect(meeting: MeetingDto) {
      cleanupSocket();
      dispatch({ type: "connection", status: "connecting" });
      const socket = new WebSocket(meetingRealtimeUrl(meeting.id, lastSeqRef.current));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        dispatch({ type: "connection", status: "connected" });
        socket.send(
          JSON.stringify({
            type: "client.hello",
            meeting_id: meeting.id,
            last_seq: lastSeqRef.current,
          }),
        );
      });

      socket.addEventListener("message", (message) => {
        try {
          const event = JSON.parse(String(message.data));
          dispatch({ type: "event", event });
        } catch {
          dispatch({ type: "error", message: "リアルタイムイベントを解析できませんでした。" });
        }
      });

      socket.addEventListener("error", () => {
        dispatch({ type: "connection", status: "error" });
      });

      socket.addEventListener("close", () => {
        if (!shouldReconnectRef.current || !active) {
          dispatch({ type: "connection", status: "closed" });
          return;
        }
        dispatch({ type: "connection", status: "reconnecting" });
        reconnectTimerRef.current = setTimeout(() => connect(meeting), reconnectDelayMs);
      });
    }

    function cleanupSocket() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    }

    load();

    return () => {
      active = false;
      shouldReconnectRef.current = false;
      cleanupSocket();
    };
  }, [meetingId]);

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

  return useMemo(
    () => ({
      ...state,
      isEnding,
      finishMeeting,
    }),
    [state, isEnding, finishMeeting],
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "予期しないエラーが発生しました。";
}
