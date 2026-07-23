import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import {
  getWorkspaceMeetingSessionAIAnalyses,
  type LiveAnalysisPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import {
  getWorkspaceMeetingSession,
  isTerminalMeetingSessionStatus,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { RuntimePartial } from "~/api/meetings/meetingRuntimeTypes";
import {
  buildWorkspaceMeetingSessionTranscriptHistoryDebugUrl,
  buildWorkspaceMeetingSessionTranscriptWebSocketUrl,
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory,
  maskWebSocketUrl,
  parseTranscriptWebSocketEvent,
  transcriptSegmentKey,
  type MeetingSessionTranscriptHealth,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";
import { meetingStartDebug } from "~/utils/meetingStartDebug";
import { isPermanentRealtimeApiError, realtimeRecoveryDecision } from "~/utils/realtimeRecovery";
import {
  analysisSelectionDebugSnapshot,
  analysisTreeNodeCount,
  analysisTreeVersion,
  meetingAnalysisReducer,
  selectedAnalysisTree,
  treeApplyDecision,
  type MeetingAnalysisAction,
} from "~/hooks/meetingAnalysisState";
import { useMeetingAnalysisSessionStore } from "~/hooks/meetingAnalysisSessionStore";

export type TranscriptSessionConnectionStatus =
  | "idle"
  | "loading"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

const historyRetryDelaysMs = [2000, 5000, 10000];
const websocketConnectTimeoutMs = 10000;
const transcriptHistoryRetryMessage = "文字起こし履歴を取得中/再試行中です。";
const ticksPerMillisecond = 10_000;
const partialBubbleGapThresholdMs = 3000;
// サーバ側watchdog(DECISCOPE_SESSION_BOT_LOST_AFTER_SECONDS=60)がBotの途絶を
// 検知するまでの閾値に、ネットワーク遅延等のマージンを加えたしきい値。
// セッション復元時、lastBotStatusAtがこれより古ければ既にBot接続喪失中とみなす。
const botConnectionLostThresholdMs = 90_000;

type TranscriptPartialEntry = {
  key: string;
  baseKey: string;
  segment: TranscriptSegment;
  startedAtMs: number;
  startedOffsetMs: number | null;
  latestActivityMs: number;
  latestEndMs: number;
};

// ライブ分析の更新状態シグナル。更新チップ(AiUpdateStatusChip)の表示に使う。
export type LiveAnalysisMeta = {
  intervalSeconds: number;
  lastEventAtMs: number | null;
  lastCompletedAtMs: number | null;
  generating: boolean;
  failed: boolean;
  hasNewSpeech: boolean;
};

const defaultLiveAnalysisIntervalSeconds = 10;

const initialLiveAnalysisMeta: LiveAnalysisMeta = {
  intervalSeconds: defaultLiveAnalysisIntervalSeconds,
  lastEventAtMs: null,
  lastCompletedAtMs: null,
  generating: false,
  failed: false,
  hasNewSpeech: false,
};

export function useMeetingTranscriptSession(
  meetingId: string | undefined,
  sessionId: string | null | undefined,
  workspaceId: string,
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
  // Botが会議から退出した理由(例: "manual_end_requested" / "shutdown" / Teams側の
  // 通話終了メッセージ)。手動終了かどうかをUI側で区別するために保持する。
  const [sessionEndReason, setSessionEndReason] = useState("");
  // Go API側watchdogが配信するBotハートビート途絶イベント(健全性)の状態。
  // trueの間、会議画面に永続トーストで警告を表示する。
  const [botConnectionLost, setBotConnectionLost] = useState(false);
  // Go API側watchdogが配信する文字起こし途絶イベント(健全性)の状態。
  // botConnectionLostとは別に、Bot接続は維持されているが文字起こしが届いていない
  // ケースを検知するためのもの。
  const [transcriptHealth, setTranscriptHealth] = useState<MeetingSessionTranscriptHealth | null>(
    null,
  );
  const { state: analysisState, dispatch: dispatchAnalysis } = useMeetingAnalysisSessionStore(
    normalizedSessionId,
    workspaceId,
  );
  const analysisStateRef = useRef(analysisState);
  analysisStateRef.current = analysisState;
  const applyAnalysisAction = useCallback(
    (action: MeetingAnalysisAction) => {
      analysisStateRef.current = dispatchAnalysis(action);
    },
    [dispatchAnalysis],
  );
  const liveAnalysis = analysisState.liveAnalysis;
  const finalAnalysis = analysisState.finalSummary;
  const [liveAnalysisMeta, setLiveAnalysisMeta] =
    useState<LiveAnalysisMeta>(initialLiveAnalysisMeta);
  const [connectionStatus, setConnectionStatus] =
    useState<TranscriptSessionConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const seenKeysRef = useRef(new Set<string>());
  const activeSessionRef = useRef("");
  const shouldReconnectRef = useRef(false);
  const connectEnabledRef = useRef(connectWebSocket);
  const retryConnectionRef = useRef<(() => void) | null>(null);
  const previousConnectEnabledRef = useRef(connectWebSocket);
  const sessionStatusObservedAtRef = useRef(0);
  const lastWebSocketEventAtRef = useRef<string | null>(null);

  connectEnabledRef.current = connectWebSocket;

  const applySessionStatus = useCallback(
    (status: MeetingSessionStatus, observedAt?: string | null) => {
      const observedAtMs = observedAt ? Date.parse(observedAt) : Number.NaN;
      if (!Number.isNaN(observedAtMs) && observedAtMs < sessionStatusObservedAtRef.current) {
        return;
      }
      if (!Number.isNaN(observedAtMs)) {
        sessionStatusObservedAtRef.current = observedAtMs;
      }
      setSessionStatus((current) => {
        if (
          current &&
          isTerminalMeetingSessionStatus(current) &&
          !isTerminalMeetingSessionStatus(status)
        ) {
          return current;
        }
        return status;
      });
      applyAnalysisAction({ type: "meeting_status", status });
      if (isTerminalMeetingSessionStatus(status)) {
        meetingStartDebug("meeting-page", "analysis tree preserved", {
          meetingStatus: status,
          treePreserved: analysisTreeNodeCount(analysisStateRef.current) > 0,
          treeNodeCountAfter: analysisTreeNodeCount(analysisStateRef.current),
          reason: "meeting_ended",
        });
      }
    },
    [applyAnalysisAction],
  );

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
      sessionStatusObservedAtRef.current = 0;
      retryConnectionRef.current = null;
      seenKeysRef.current.clear();
      setSegments([]);
      setPartials({});
      setSessionStatus(null);
      setSessionTitle("");
      setSessionTitleSource("");
      setSessionCreatedAt("");
      setSessionJoinedAt("");
      setSessionEndedAt("");
      setSessionEndReason("");
      setBotConnectionLost(false);
      setTranscriptHealth(null);
      setLiveAnalysisMeta(initialLiveAnalysisMeta);
      setConnectionStatus("idle");
      setError(null);
      setRecoveryRequired(false);
      return;
    }

    activeSessionRef.current = normalizedSessionId;
    shouldReconnectRef.current = true;
    reconnectAttemptRef.current = 0;
    lastWebSocketEventAtRef.current = null;
    sessionStatusObservedAtRef.current = 0;
    seenKeysRef.current.clear();
    setSegments([]);
    setPartials({});
    setSessionStatus(null);
    setSessionTitle("");
    setSessionTitleSource("");
    setSessionCreatedAt("");
    setSessionJoinedAt("");
    setSessionEndedAt("");
    setBotConnectionLost(false);
    setTranscriptHealth(null);
    setLiveAnalysisMeta(initialLiveAnalysisMeta);
    setConnectionStatus("loading");
    setError(null);
    setRecoveryRequired(false);

    let active = true;
    const historyDebugUrl = buildWorkspaceMeetingSessionTranscriptHistoryDebugUrl(
      workspaceId,
      normalizedSessionId,
      100,
    );
    const websocketUrl = buildWorkspaceMeetingSessionTranscriptWebSocketUrl(
      workspaceId,
      normalizedSessionId,
    );

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
        const session = await getWorkspaceMeetingSession(workspaceId, normalizedSessionId);
        if (!active) {
          return null;
        }
        applySessionStatus(session.status, session.updatedAt);
        setSessionTitle(session.title ?? "");
        setSessionTitleSource(session.titleSource ?? "");
        setSessionCreatedAt(session.createdAt ?? "");
        setSessionJoinedAt(
          (current) =>
            (session.joinedAt ?? current) ||
            (isElapsedMeetingSessionStatus(session.status) ? (session.createdAt ?? "") : ""),
        );
        setSessionEndedAt((current) => session.endedAt ?? current);
        setSessionEndReason((current) => session.endReason ?? current);
        // trueへの片方向セットではなく算出値を毎回反映する。再接続後の再取得(下記の
        // "open"リスナー参照)では、切断中にBotが復旧していればfalseへ、逆にendedに
        // なっていた場合もfalseへ正しく戻す必要があるため。
        const lastBotStatusAtMs = session.lastBotStatusAt
          ? Date.parse(session.lastBotStatusAt)
          : Number.NaN;
        const lost =
          isElapsedMeetingSessionStatus(session.status) &&
          !Number.isNaN(lastBotStatusAtMs) &&
          Date.now() - lastBotStatusAtMs > botConnectionLostThresholdMs;
        setBotConnectionLost(lost);
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
          lastBotStatusAt: session.lastBotStatusAt ?? null,
        });
        return session;
      } catch (cause) {
        if (!active) {
          return null;
        }
        setError(`会議セッションを復元できませんでした: ${errorMessage(cause)}`);
        meetingStartDebug("meeting-page", "session data load failed", {
          sessionId: normalizedSessionId,
          message: errorMessage(cause),
        });
        throw cause;
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
        const history = await fetchWorkspaceMeetingSessionTranscriptSegmentHistory(
          workspaceId,
          normalizedSessionId,
          100,
        );
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
        const delay = historyRetryDelaysMs[attempt] ?? null;
        const willRetry = delay !== null;
        setError(
          (current) =>
            current ??
            (willRetry
              ? transcriptHistoryRetryMessage
              : "文字起こし履歴を取得できませんでした。手動で再接続してください。"),
        );
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

    async function loadAIAnalyses(source: string) {
      const beforeRequest = analysisStateRef.current;
      meetingStartDebug("meeting-page", "tree hydrate started", {
        sessionId: normalizedSessionId,
        source,
        currentVersion: beforeRequest.analysisRuntimeStatus.liveVersion,
        currentTreeVersion: analysisTreeVersion(beforeRequest),
        currentNodeCount: analysisTreeNodeCount(beforeRequest),
        timestamp: new Date().toISOString(),
      });
      try {
        const analyses = await getWorkspaceMeetingSessionAIAnalyses(
          workspaceId,
          normalizedSessionId,
        );
        if (!active) {
          return;
        }
        const live = analyses.live;
        const analysisBefore = analysisStateRef.current;
        applyAnalysisAction({ type: "rest_snapshot", analyses });
        const analysisAfter = analysisStateRef.current;
        const intervalSeconds = analyses.liveIntervalSeconds;
        setLiveAnalysisMeta((current) => {
          // WSイベントを既に受信済みならintervalSecondsの補完のみ行う。
          if (current.lastEventAtMs !== null || !live) {
            return intervalSeconds ? { ...current, intervalSeconds } : current;
          }
          const updatedAtMs = live.updatedAtUtc ? Date.parse(live.updatedAtUtc) : Number.NaN;
          const eventAtMs = Number.isNaN(updatedAtMs) ? null : updatedAtMs;
          return {
            ...current,
            ...(intervalSeconds ? { intervalSeconds } : {}),
            lastEventAtMs: eventAtMs,
            lastCompletedAtMs: live.status === "completed" ? eventAtMs : null,
            generating: live.status === "running",
            failed: live.status === "failed",
          };
        });
        meetingStartDebug("meeting-page", "tree hydrate completed", {
          sessionId: normalizedSessionId,
          source,
          liveVersion: analyses.live?.version ?? null,
          finalVersion: analyses.final?.version ?? null,
          finalTreeSnapshotVersion: analyses.treeSnapshot?.treeVersion ?? null,
          treeNodeCountBefore: analysisTreeNodeCount(analysisBefore),
          treeNodeCountAfter: analysisTreeNodeCount(analysisAfter),
          treeReplaced:
            analysisTreeNodeCount(analysisBefore) !== analysisTreeNodeCount(analysisAfter) ||
            analysisTreeVersion(analysisBefore) !== analysisTreeVersion(analysisAfter),
          treePreserved:
            analysisTreeNodeCount(analysisBefore) > 0 &&
            analysisTreeNodeCount(analysisBefore) === analysisTreeNodeCount(analysisAfter),
          mergeDecision:
            analysisTreeVersion(analysisBefore) === analysisTreeVersion(analysisAfter)
              ? "tree_retained"
              : "tree_hydrated",
          ...analysisSelectionDebugSnapshot(analysisAfter),
          timestamp: new Date().toISOString(),
        });
      } catch (cause) {
        meetingStartDebug("meeting-page", "tree hydrate failed", {
          sessionId: normalizedSessionId,
          source,
          message: errorMessage(cause),
          treeRetained: analysisTreeNodeCount(analysisStateRef.current) > 0,
          currentTreeVersion: analysisTreeVersion(analysisStateRef.current),
          currentNodeCount: analysisTreeNodeCount(analysisStateRef.current),
          timestamp: new Date().toISOString(),
        });
      }
    }

    function stopRecovery(message: string, clearAnalysis = false) {
      shouldReconnectRef.current = false;
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      if (clearAnalysis) {
        applyAnalysisAction({ type: "explicit_reset" });
      }
      setRecoveryRequired(true);
      setConnectionStatus("error");
      setError(message);
    }

    function connect(reconnecting = false) {
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      const previousSocket = socketRef.current;
      socketRef.current = null;
      previousSocket?.close();
      if (!connectEnabledRef.current) {
        setConnectionStatus("closed");
        return;
      }

      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;
      setConnectionStatus(reconnecting ? "reconnecting" : "connecting");
      meetingStartDebug("meeting-page", "WebSocket connecting", {
        sessionId: normalizedSessionId,
        reconnecting,
        retryCount: reconnectAttemptRef.current,
        lastEventAt: lastWebSocketEventAtRef.current,
        url: maskWebSocketUrl(websocketUrl),
        timestamp: new Date().toISOString(),
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
        const completedRetryCount = reconnectAttemptRef.current;
        reconnectAttemptRef.current = 0;
        setRecoveryRequired(false);
        setConnectionStatus("connected");
        meetingStartDebug(
          "meeting-page",
          reconnecting ? "WebSocket reconnected" : "WebSocket connected",
          {
            sessionId: normalizedSessionId,
            retryCount: completedRetryCount,
            lastEventAt: lastWebSocketEventAtRef.current,
            url: maskWebSocketUrl(websocketUrl),
            timestamp: new Date().toISOString(),
          },
        );

        if (reconnecting) {
          // 切断中(PCスリープ等)に配信された status_changed / bot_health_changed は
          // サーバが遷移時に1回しか送らないため見逃す可能性がある。再接続直後に
          // 現在状態を取り直して画面を復旧させる。3つとも冪等(historyはseenKeysRef
          // でdedupe、AI分析はversion比較guard)であることを確認済み。
          meetingStartDebug("meeting-page", "reconnected, refetching missed state", {
            sessionId: normalizedSessionId,
            url: maskWebSocketUrl(websocketUrl),
          });
          void loadInitialData()
            .then((session) => {
              if (
                !session ||
                !isTerminalMeetingSessionStatus(session.status) ||
                socketRef.current !== socket
              ) {
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
                stopRecovery(
                  "会議セッションへのアクセスを確認できませんでした。再読み込みしてください。",
                  true,
                );
              }
            });
          void loadTranscriptHistory();
          void loadAIAnalyses("reconnect");
        }
      });

      socket.addEventListener("message", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        try {
          const raw = String(event.data);
          lastWebSocketEventAtRef.current = new Date().toISOString();
          meetingStartDebug("meeting-page", "transcript WebSocket message received", {
            sessionId: normalizedSessionId,
            url: maskWebSocketUrl(websocketUrl),
            length: raw.length,
          });
          const parsed = parseTranscriptWebSocketEvent(raw);
          if (parsed.sessionStatus && parsed.sessionStatus.sessionId === activeSessionRef.current) {
            applySessionStatus(parsed.sessionStatus.status, parsed.sentAtUtc);
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
            if (parsed.sessionStatus.endReason) {
              setSessionEndReason(parsed.sessionStatus.endReason);
            }
            if (isTerminalMeetingSessionStatus(parsed.sessionStatus.status)) {
              setBotConnectionLost(false);
              setTranscriptHealth(null);
              void loadAIAnalyses("meeting_ended");
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
              endReason: parsed.sessionStatus.endReason ?? null,
              lastError: parsed.sessionStatus.lastError ?? null,
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

          if (parsed.botHealth) {
            if (parsed.botHealth.sessionId !== activeSessionRef.current) {
              meetingStartDebug("meeting-page", "bot health ignored", {
                reason: "session_id_mismatch",
                currentSessionId: activeSessionRef.current,
                receivedSessionId: parsed.botHealth.sessionId,
                healthy: parsed.botHealth.healthy,
              });
              return;
            }
            setBotConnectionLost(!parsed.botHealth.healthy);
            meetingStartDebug("meeting-page", "bot health received", {
              sessionId: parsed.botHealth.sessionId,
              healthy: parsed.botHealth.healthy,
              lastBotStatusAtUtc: parsed.botHealth.lastBotStatusAtUtc ?? null,
            });
            return;
          }

          if (parsed.transcriptHealth) {
            if (parsed.transcriptHealth.sessionId !== activeSessionRef.current) {
              meetingStartDebug("meeting-page", "transcript health ignored", {
                reason: "session_id_mismatch",
                currentSessionId: activeSessionRef.current,
                receivedSessionId: parsed.transcriptHealth.sessionId,
                transcriptHealth: parsed.transcriptHealth.transcriptHealth,
              });
              return;
            }
            setTranscriptHealth(parsed.transcriptHealth.transcriptHealth);
            meetingStartDebug("meeting-page", "transcript health received", {
              sessionId: parsed.transcriptHealth.sessionId,
              transcriptHealth: parsed.transcriptHealth.transcriptHealth,
              secondsSinceLastTranscript: parsed.transcriptHealth.secondsSinceLastTranscript,
            });
            return;
          }

          if (parsed.aiAnalysis) {
            if (parsed.aiAnalysis.sessionId !== activeSessionRef.current) {
              meetingStartDebug("meeting-page", "ai analysis ignored", {
                reason: "session_id_mismatch",
                currentSessionId: activeSessionRef.current,
                receivedSessionId: parsed.aiAnalysis.sessionId ?? null,
                analysisType: parsed.aiAnalysis.analysisType,
              });
              return;
            }

            const incoming = parsed.aiAnalysis;
            if (incoming.analysisType === "live") {
              // Debug logging is gated by meetingStartDebug and records both
              // type-specific versions and the last-known-good tree count.
              const livePayload = incoming.payload as LiveAnalysisPayload | null;
              const before = analysisStateRef.current;
              const after = meetingAnalysisReducer(before, {
                type: "analysis_event",
                analysis: incoming,
              });
              applyAnalysisAction({ type: "analysis_event", analysis: incoming });
              meetingStartDebug("meeting-page", "analysis event received", {
                sessionId: incoming.sessionId,
                analysisType: incoming.analysisType,
                status: incoming.status,
                eventStatus: incoming.status,
                incomingVersion: incoming.version,
                currentVersion: before.analysisRuntimeStatus.liveVersion,
                payloadKind: livePayload?.payloadKind ?? null,
                incomingTreeKind: livePayload?.treePayloadState ?? null,
                treePayloadState: livePayload?.treePayloadState ?? null,
                explicitTreeReset: livePayload?.treeReset === true,
                serverNodeCount: livePayload?.nodeCount ?? null,
                normalizedNodeCount: livePayload?.tree?.nodes?.length ?? 0,
                incomingNodeCount: livePayload?.tree?.nodes?.length ?? 0,
                incomingEdgeCount: livePayload?.tree?.edges?.length ?? 0,
                incomingTreeVersion: livePayload?.treeVersion ?? null,
                currentTreeVersion: analysisTreeVersion(before),
                resultingTreeVersion: analysisTreeVersion(after),
                liveVersionBefore: before.analysisRuntimeStatus.liveVersion,
                liveVersionAfter: after.analysisRuntimeStatus.liveVersion,
                finalVersionBefore: before.analysisRuntimeStatus.finalVersion,
                finalVersionAfter: after.analysisRuntimeStatus.finalVersion,
                canonicalNodeCountBefore: analysisTreeNodeCount(before),
                canonicalNodeCountAfter: analysisTreeNodeCount(after),
                treeNodeCountBefore: analysisTreeNodeCount(before),
                treeNodeCountAfter: analysisTreeNodeCount(after),
                treeReplaced:
                  analysisTreeNodeCount(after) !== analysisTreeNodeCount(before) ||
                  analysisTreeVersion(after) !== analysisTreeVersion(before),
                treePreserved:
                  analysisTreeNodeCount(before) > 0 &&
                  analysisTreeNodeCount(after) === analysisTreeNodeCount(before),
                treeClearRejected:
                  livePayload?.tree?.nodes?.length === 0 && analysisTreeNodeCount(after) > 0,
                decision: treeApplyDecision(before.liveAnalysis, incoming),
                mergeDecision: treeApplyDecision(before.liveAnalysis, incoming),
                LKGNodeCount: analysisTreeNodeCount(after),
                ...analysisSelectionDebugSnapshot(after),
                timestamp: new Date().toISOString(),
              });
              const receivedAtMs = Date.now();
              setLiveAnalysisMeta((current) => ({
                ...current,
                ...(incoming.intervalSeconds ? { intervalSeconds: incoming.intervalSeconds } : {}),
                lastEventAtMs: receivedAtMs,
                ...(incoming.status === "completed"
                  ? {
                      lastCompletedAtMs: receivedAtMs,
                      generating: false,
                      failed: false,
                      hasNewSpeech: false,
                    }
                  : incoming.status === "running"
                    ? { generating: true, failed: false }
                    : { generating: false, failed: true }),
              }));
            } else {
              const before = analysisStateRef.current;
              const after = meetingAnalysisReducer(before, {
                type: "analysis_event",
                analysis: incoming,
              });
              applyAnalysisAction({ type: "analysis_event", analysis: incoming });
              meetingStartDebug("meeting-page", "analysis event received", {
                sessionId: incoming.sessionId,
                analysisType: incoming.analysisType,
                status: incoming.status,
                incomingVersion: incoming.version,
                liveVersionBefore: before.analysisRuntimeStatus.liveVersion,
                liveVersionAfter: after.analysisRuntimeStatus.liveVersion,
                finalVersionBefore: before.analysisRuntimeStatus.finalVersion,
                finalVersionAfter: after.analysisRuntimeStatus.finalVersion,
                treeNodeCountBefore: analysisTreeNodeCount(before),
                treeNodeCountAfter: analysisTreeNodeCount(after),
                treePreserved: analysisTreeNodeCount(before) > 0,
                reason: "final_event_without_tree",
                ...analysisSelectionDebugSnapshot(after),
                timestamp: new Date().toISOString(),
              });
              if (incoming.status === "completed") {
                void loadAIAnalyses("final_analysis_completed");
              }
            }
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
            // 最後のcompleted以降に新しい確定発話があったことを更新チップへ伝える。
            setLiveAnalysisMeta((current) =>
              current.hasNewSpeech ? current : { ...current, hasNewSpeech: true },
            );
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
        applyAnalysisAction({ type: "websocket_closed" });
        meetingStartDebug("meeting-page", "WebSocket closed", {
          sessionId: normalizedSessionId,
          url: maskWebSocketUrl(websocketUrl),
          code: event.code,
          reason: event.reason || null,
          wasClean: event.wasClean,
          retryCount: reconnectAttemptRef.current,
          lastEventAt: lastWebSocketEventAtRef.current,
          timestamp: new Date().toISOString(),
        });
        meetingStartDebug("meeting-page", "analysis tree preserved", {
          sessionId: normalizedSessionId,
          websocketClosed: true,
          treePreserved: analysisTreeNodeCount(analysisStateRef.current) > 0,
          treeNodeCountAfter: analysisTreeNodeCount(analysisStateRef.current),
        });
        if (!shouldReconnectRef.current) {
          setConnectionStatus("closed");
          return;
        }

        const failedAttempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = failedAttempt;
        const decision = realtimeRecoveryDecision(failedAttempt, event.code);
        if (decision.action === "stop") {
          stopRecovery(
            decision.reason === "permanent"
              ? "文字起こし接続の認証または権限が失われました。再読み込みしてください。"
              : "文字起こし接続を自動復旧できませんでした。手動で再接続してください。",
            decision.reason === "permanent",
          );
          return;
        }

        setConnectionStatus("reconnecting");
        meetingStartDebug("meeting-page", "WebSocket reconnect scheduled", {
          sessionId: normalizedSessionId,
          url: maskWebSocketUrl(websocketUrl),
          delay: decision.delayMs,
          code: event.code,
          reason: event.reason || null,
          wasClean: event.wasClean,
          retryCount: failedAttempt,
          lastEventAt: lastWebSocketEventAtRef.current,
          timestamp: new Date().toISOString(),
        });
        void (async () => {
          if (decision.probe) {
            try {
              const session = await loadInitialData();
              if (!active || !session) {
                return;
              }
              if (isTerminalMeetingSessionStatus(session.status)) {
                shouldReconnectRef.current = false;
                setConnectionStatus("closed");
                return;
              }
            } catch (cause) {
              if (!active) {
                return;
              }
              if (isPermanentRealtimeApiError(cause)) {
                stopRecovery(
                  "会議セッションへのアクセスを確認できませんでした。再読み込みしてください。",
                  true,
                );
                return;
              }
            }
          }
          if (!active || !shouldReconnectRef.current || !connectEnabledRef.current) {
            return;
          }
          reconnectTimerRef.current = setTimeout(() => connect(true), decision.delayMs);
        })();
      });
    }

    retryConnectionRef.current = () => {
      if (!active || !connectEnabledRef.current) {
        return;
      }
      shouldReconnectRef.current = true;
      reconnectAttemptRef.current = 0;
      setRecoveryRequired(false);
      setError(null);
      void loadInitialData().catch((cause: unknown) => {
        if (active && isPermanentRealtimeApiError(cause)) {
          stopRecovery(
            "会議セッションへのアクセスを確認できませんでした。再読み込みしてください。",
            true,
          );
        }
      });
      void loadTranscriptHistory();
      void loadAIAnalyses("manual_retry");
      connect(true);
    };

    void loadInitialData()
      .then((session) => {
        if (!active || !session) {
          return;
        }
        if (isTerminalMeetingSessionStatus(session.status)) {
          shouldReconnectRef.current = false;
          setConnectionStatus("closed");
          return;
        }
        connect(false);
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        const permanent = isPermanentRealtimeApiError(cause);
        stopRecovery(
          permanent
            ? "会議セッションへのアクセスを確認できませんでした。再読み込みしてください。"
            : "会議セッションを復元できませんでした。手動で再接続してください。",
          permanent,
        );
      });
    void loadTranscriptHistory();
    void loadAIAnalyses("initial");

    return () => {
      active = false;
      shouldReconnectRef.current = false;
      retryConnectionRef.current = null;
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(historyRetryTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      socketRef.current?.close();
      socketRef.current = null;
      meetingStartDebug("meeting-page", "transcript subscription closed", {
        sessionId: normalizedSessionId,
        reason: "effect_cleanup",
        componentUnmounted: true,
        treePreserved: analysisTreeNodeCount(analysisStateRef.current) > 0,
      });
    };
  }, [
    appendSegments,
    applyAnalysisAction,
    applyPartial,
    applySessionStatus,
    normalizedSessionId,
    workspaceId,
  ]);

  useEffect(() => {
    const wasEnabled = previousConnectEnabledRef.current;
    previousConnectEnabledRef.current = connectWebSocket;
    if (connectWebSocket) {
      if (!wasEnabled) {
        retryConnectionRef.current?.();
      }
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
    applyAnalysisAction({ type: "websocket_closed" });
    meetingStartDebug("meeting-page", "analysis tree preserved", {
      sessionId: normalizedSessionId,
      websocketClosed: true,
      treePreserved: analysisTreeNodeCount(analysisStateRef.current) > 0,
      treeNodeCountAfter: analysisTreeNodeCount(analysisStateRef.current),
      reason: "meeting_ended_socket_close",
    });
    setConnectionStatus((current) => (current === "idle" ? current : "closed"));
  }, [applyAnalysisAction, connectWebSocket, normalizedSessionId]);

  const retryConnection = useCallback(() => {
    retryConnectionRef.current?.();
  }, []);

  return useMemo(
    () => ({
      sessionId: normalizedSessionId,
      sessionTitle,
      sessionTitleSource,
      sessionCreatedAt,
      sessionJoinedAt,
      sessionEndedAt,
      sessionEndReason,
      sessionStatus,
      botConnectionLost,
      transcriptHealth,
      liveAnalysis,
      finalAnalysis,
      finalTreeSnapshot: analysisState.finalTreeSnapshot,
      discussionTree: selectedAnalysisTree(analysisState),
      analysisRuntimeStatus: analysisState.analysisRuntimeStatus,
      liveAnalysisMeta,
      connectionStatus,
      error,
      recoveryRequired,
      retryConnection,
      rawSegments: segments,
      partials: Object.values(partials)
        .sort((a, b) => a.startedAtMs - b.startedAtMs)
        .map(transcriptPartialEntryToRuntimePartial),
      segments: segments.map((segment) =>
        transcriptSegmentToMeetingSegment(segment, meetingId, normalizedSessionId),
      ),
    }),
    [
      botConnectionLost,
      connectionStatus,
      error,
      finalAnalysis,
      analysisState.analysisRuntimeStatus,
      analysisState.finalTreeSnapshot,
      liveAnalysis,
      liveAnalysisMeta,
      meetingId,
      normalizedSessionId,
      partials,
      recoveryRequired,
      retryConnection,
      segments,
      sessionCreatedAt,
      sessionEndedAt,
      sessionEndReason,
      sessionJoinedAt,
      sessionStatus,
      sessionTitle,
      sessionTitleSource,
      transcriptHealth,
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

  // 同一話者では partial は必ず対応する final より前に発火するため、
  // final の実時刻以前に活動が止まっている entry はすべて置き換え済みとみなす。
  // (テキスト/オフセット一致に加えて時刻でも判定することで、finalが来ない
  // ゴーストpartialの残留と、次発話の進行中partialの誤削除の両方を防ぐ)
  const finalActivityMs = transcriptSegmentTimestampMs(finalSegment);
  const entriesToRemove = sameBaseEntries.filter(
    ([, entry]) =>
      entry.latestActivityMs <= finalActivityMs ||
      partialEntryMatchesFinalSegment(entry, finalSegment),
  );
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
  // offsetTicks は音声ストリーム上の位置であり、話者が沈黙している間は進まないことがある。
  // 実時刻(recognizedAtUtc)の間隔が閾値を超えたら、オフセットが連続していても新しいバブルにする。
  const nextActivityMs = transcriptSegmentTimestampMs(segment);
  if (nextActivityMs - entry.latestActivityMs > partialBubbleGapThresholdMs) {
    return false;
  }

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

  return true;
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
  return (
    status === "joined" ||
    status === "active" ||
    status === "recording" ||
    status === "speech_error" ||
    status === "speech_throttled"
  );
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
