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
  buildWorkspaceMeetingSessionTranscriptWebSocketUrl,
  fetchWorkspaceMeetingSessionMediaHealth,
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory,
  parseTranscriptWebSocketEvent,
  transcriptSegmentKey,
  type MeetingSessionTranscriptHealth,
  type MeetingSessionMediaHealth,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";

import { isPermanentRealtimeApiError, realtimeRecoveryDecision } from "~/utils/realtimeRecovery";
import { selectedAnalysisTree, type MeetingAnalysisAction } from "~/hooks/meetingAnalysisState";
import { useMeetingAnalysisSessionStore } from "~/hooks/meetingAnalysisSessionStore";
import { analysisDiagnosticsFields } from "~/hooks/meetingAnalysisDiagnostics";
import {
  flushDiagnosticsWithBeacon,
  hydrateDiagnosticsFromStorage,
  recordDiagnosticEvent,
} from "~/utils/clientDiagnostics/clientDiagnostics";

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
  const [mediaHealth, setMediaHealth] = useState<MeetingSessionMediaHealth | null>(null);
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

  // 診断イベントの共通項目。常に「今この瞬間のツリー状態」を載せる。
  const diagnosticFields = useCallback(
    () => analysisDiagnosticsFields(analysisStateRef.current, normalizedSessionId, workspaceId),
    [normalizedSessionId, workspaceId],
  );

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
    },
    [applyAnalysisAction],
  );

  const appendSegments = useCallback(
    (incoming: TranscriptSegment[]) => {
      if (!normalizedSessionId) {
        return;
      }

      const accepted: TranscriptSegment[] = [];
      for (const segment of incoming) {
        if (!segment.isFinal) {
          continue;
        }
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

      setPartials((current) => {
        let changed = false;
        const next = { ...current };
        for (const segment of accepted) {
          changed = removeReplacedPartialEntries(next, segment) || changed;
        }
        return changed ? next : current;
      });
      setSegments((current) => sortTranscriptSegments([...current, ...accepted]));
    },
    [normalizedSessionId],
  );

  const applyPartial = useCallback(
    (segment: TranscriptSegment) => {
      if (!normalizedSessionId) {
        return;
      }
      if (segment.sessionId !== normalizedSessionId) {
        return;
      }
      if (!segment.text.trim()) {
        return;
      }

      setPartials((current) => upsertPartialEntry(current, segment));
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
      setMediaHealth(null);
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
    setMediaHealth(null);
    setLiveAnalysisMeta(initialLiveAnalysisMeta);
    setConnectionStatus("loading");
    setError(null);
    setRecoveryRequired(false);

    let active = true;
    const websocketUrl = buildWorkspaceMeetingSessionTranscriptWebSocketUrl(
      workspaceId,
      normalizedSessionId,
    );

    recordDiagnosticEvent("session_hook_created", {
      ...diagnosticFields(),
      details: { connectWebSocketEnabled: connectEnabledRef.current },
    });
    // 前回のタブ/リロードで送りきれなかった診断イベントを再送する。
    void hydrateDiagnosticsFromStorage();

    async function loadInitialData() {
      try {
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

        return session;
      } catch (cause) {
        if (!active) {
          return null;
        }
        setError(`会議セッションを復元できませんでした: ${errorMessage(cause)}`);

        throw cause;
      }
    }

    async function loadTranscriptHistory(attempt = 0) {
      clearReconnectTimer(historyRetryTimerRef);
      try {
        const history = await fetchWorkspaceMeetingSessionTranscriptSegmentHistory(
          workspaceId,
          normalizedSessionId,
          100,
        );
        if (!active) {
          return;
        }
        appendSegments(history.segments);
        setError((current) => (current === transcriptHistoryRetryMessage ? null : current));
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

        if (willRetry) {
          historyRetryTimerRef.current = setTimeout(() => {
            void loadTranscriptHistory(attempt + 1);
          }, delay);
        }
      }
    }

    async function loadMediaHealth() {
      try {
        const health = await fetchWorkspaceMeetingSessionMediaHealth(
          workspaceId,
          normalizedSessionId,
        );
        if (!active || health.sessionId !== activeSessionRef.current) {
          return;
        }
        setMediaHealth((current) => latestMediaHealth(current, health));
      } catch {
        // This transient diagnostic must not prevent transcript/session recovery.
      }
    }

    async function loadAIAnalyses(source: string) {
      recordDiagnosticEvent("rest_fetch_started", {
        ...diagnosticFields(),
        snapshotSource: "rest",
        details: { source },
      });
      try {
        const analyses = await getWorkspaceMeetingSessionAIAnalyses(
          workspaceId,
          normalizedSessionId,
        );
        if (!active) {
          recordDiagnosticEvent("rest_snapshot_received", {
            ...diagnosticFields(),
            snapshotSource: "rest",
            details: { source, discarded: true, reason: "subscription_no_longer_active" },
          });
          return;
        }
        const live = analyses.live;
        const liveTreePayload = (live?.payload ?? null) as LiveAnalysisPayload | null;
        // 採用/拒否の判定そのものは store 側で記録する。ここでは
        // 「何を受け取ったか」を到着順に残す。
        recordDiagnosticEvent("rest_snapshot_received", {
          ...diagnosticFields(),
          snapshotSource: "rest",
          details: {
            source,
            liveVersion: live?.version ?? null,
            liveStatus: live?.status ?? null,
            liveTreeVersion: liveTreePayload?.treeVersion ?? null,
            liveNodeCount: liveTreePayload?.tree?.nodes?.length ?? null,
            liveTreePayloadState: liveTreePayload?.treePayloadState ?? null,
            livePayloadPresent: liveTreePayload !== null,
            finalVersion: analyses.final?.version ?? null,
            finalTreeSnapshotVersion: analyses.treeSnapshot?.treeVersion ?? null,
            finalTreeSnapshotNodeCount: analyses.treeSnapshot?.tree?.nodes?.length ?? null,
            responseUpdatedAt: live?.updatedAtUtc ?? null,
          },
        });
        applyAnalysisAction({ type: "rest_snapshot", analyses });
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
      } catch (cause) {
        recordDiagnosticEvent("rest_snapshot_received", {
          ...diagnosticFields(),
          snapshotSource: "rest",
          details: { source, failed: true, message: errorMessage(cause) },
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

      connectTimeoutRef.current = setTimeout(() => {
        if (!active || socketRef.current !== socket || socket.readyState !== WebSocket.CONNECTING) {
          return;
        }
        setConnectionStatus("error");

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

        recordDiagnosticEvent("ws_connected", {
          ...diagnosticFields(),
          details: {
            reconnected: reconnecting,
            retryCount: completedRetryCount,
            lastEventAt: lastWebSocketEventAtRef.current,
          },
        });

        if (reconnecting) {
          // 切断中(PCスリープ等)に配信された status_changed / bot_health_changed は
          // サーバが遷移時に1回しか送らないため見逃す可能性がある。再接続直後に
          // 現在状態を取り直して画面を復旧させる。3つとも冪等(historyはseenKeysRef
          // でdedupe、AI分析はversion比較guard)であることを確認済み。

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
          void loadMediaHealth();
        }
      });

      socket.addEventListener("message", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        try {
          const raw = String(event.data);
          lastWebSocketEventAtRef.current = new Date().toISOString();

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
              setMediaHealth(null);
              void loadAIAnalyses("meeting_ended");
            }

            const statusError = sessionStatusErrorMessage(parsed.sessionStatus.status);
            if (statusError) {
              setError(statusError);
            }
            return;
          }

          if (parsed.sessionStatus) {
            return;
          }

          if (parsed.botHealth) {
            if (parsed.botHealth.sessionId !== activeSessionRef.current) {
              return;
            }
            setBotConnectionLost(!parsed.botHealth.healthy);

            return;
          }

          if (parsed.transcriptHealth) {
            if (parsed.transcriptHealth.sessionId !== activeSessionRef.current) {
              return;
            }
            setTranscriptHealth(parsed.transcriptHealth.transcriptHealth);

            return;
          }

          if (parsed.mediaHealth) {
            if (parsed.mediaHealth.sessionId !== activeSessionRef.current) {
              return;
            }
            setMediaHealth((current) => latestMediaHealth(current, parsed.mediaHealth!));
            return;
          }

          if (parsed.aiAnalysis) {
            if (parsed.aiAnalysis.sessionId !== activeSessionRef.current) {
              return;
            }

            const incoming = parsed.aiAnalysis;
            const incomingPayload = (incoming.payload ?? null) as LiveAnalysisPayload | null;
            // 採用/拒否の判定は store 側で記録する。ここでは到着した内容を残す。
            recordDiagnosticEvent("ws_snapshot_received", {
              ...diagnosticFields(),
              snapshotSource: "websocket",
              details: {
                analysisType: incoming.analysisType,
                incomingStatus: incoming.status,
                incomingVersion: incoming.version,
                incomingTreeVersion: incomingPayload?.treeVersion ?? null,
                incomingNodeCount: incomingPayload?.tree?.nodes?.length ?? null,
                incomingEdgeCount: incomingPayload?.tree?.edges?.length ?? null,
                treePayloadState: incomingPayload?.treePayloadState ?? null,
                payloadKind: incomingPayload?.payloadKind ?? null,
                payloadPresent: incomingPayload !== null,
                explicitTreeReset: incomingPayload?.treeReset === true,
                incomingUpdatedAt: incoming.updatedAtUtc ?? null,
              },
            });
            if (incoming.analysisType === "live") {
              applyAnalysisAction({ type: "analysis_event", analysis: incoming });

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
              applyAnalysisAction({ type: "analysis_event", analysis: incoming });

              if (incoming.status === "completed") {
                void loadAIAnalyses("final_analysis_completed");
              }
            }
            return;
          }

          if (parsed.segment) {
            if (!parsed.segment.isFinal) {
              applyPartial(parsed.segment);
              return;
            }
            appendSegments([parsed.segment]);
            // 最後のcompleted以降に新しい確定発話があったことを更新チップへ伝える。
            setLiveAnalysisMeta((current) =>
              current.hasNewSpeech ? current : { ...current, hasNewSpeech: true },
            );
            return;
          }
        } catch (cause) {
          setError(`文字起こしイベントを解析できませんでした: ${errorMessage(cause)}`);
        }
      });

      socket.addEventListener("error", () => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        clearReconnectTimer(connectTimeoutRef);
        setConnectionStatus("error");
      });

      socket.addEventListener("close", (event) => {
        if (!active || socketRef.current !== socket) {
          return;
        }
        clearReconnectTimer(connectTimeoutRef);
        socketRef.current = null;
        applyAnalysisAction({ type: "websocket_closed" });

        recordDiagnosticEvent("ws_disconnected", {
          ...diagnosticFields(),
          details: {
            code: event.code,
            reason: event.reason || null,
            wasClean: event.wasClean,
            retryCount: reconnectAttemptRef.current,
            willReconnect: shouldReconnectRef.current,
            lastEventAt: lastWebSocketEventAtRef.current,
          },
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
        recordDiagnosticEvent("ws_reconnecting", {
          ...diagnosticFields(),
          details: {
            delayMs: decision.delayMs,
            retryCount: failedAttempt,
            code: event.code,
            probe: decision.probe,
          },
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
      void loadMediaHealth();
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
    void loadMediaHealth();

    return () => {
      active = false;
      shouldReconnectRef.current = false;
      retryConnectionRef.current = null;
      clearReconnectTimer(reconnectTimerRef);
      clearReconnectTimer(historyRetryTimerRef);
      clearReconnectTimer(connectTimeoutRef);
      socketRef.current?.close();
      socketRef.current = null;

      recordDiagnosticEvent("session_hook_disposed", {
        ...diagnosticFields(),
        details: { reason: "effect_cleanup" },
      });
      // hookの破棄はページ離脱を伴うことがあるため、未送信分の退避を試みる。
      flushDiagnosticsWithBeacon("session_hook_disposed");
    };
  }, [
    appendSegments,
    applyAnalysisAction,
    applyPartial,
    applySessionStatus,
    diagnosticFields,
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
      recordDiagnosticEvent("ws_disconnected", {
        ...diagnosticFields(),
        details: { reason: "meeting_ended_modal_opened", willReconnect: false },
      });
      socketRef.current.close(1000, "meeting ended");
      socketRef.current = null;
    }
    applyAnalysisAction({ type: "websocket_closed" });

    setConnectionStatus((current) => (current === "idle" ? current : "closed"));
  }, [applyAnalysisAction, connectWebSocket, diagnosticFields, normalizedSessionId]);

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
      mediaHealth,
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
      mediaHealth,
    ],
  );
}

function latestMediaHealth(
  current: MeetingSessionMediaHealth | null,
  incoming: MeetingSessionMediaHealth,
): MeetingSessionMediaHealth {
  if (!current || current.eventId === incoming.eventId) {
    return current ?? incoming;
  }
  const currentAt = Date.parse(current.occurredAtUtc);
  const incomingAt = Date.parse(incoming.occurredAtUtc);
  if (!Number.isNaN(currentAt) && !Number.isNaN(incomingAt) && incomingAt < currentAt) {
    return current;
  }
  return incoming;
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
