import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { DsButton } from "~/components/DsButton";
import { BotStatusToasts } from "~/components/meeting/parts/BotStatusToasts";
import { LiveStatusBadge } from "~/components/meeting/parts/LiveStatusBadge";
import { MeetingEndedModal } from "~/components/meeting/parts/MeetingEndedModal";
import { MeetingEndAction } from "~/components/meeting/parts/MeetingEndAction";
import { MeetingWorkspaceGrid } from "~/components/meeting/parts/MeetingWorkspaceGrid";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useBotStatusToasts } from "~/hooks/useBotStatusToasts";
import { useMeetingEndFlow } from "~/hooks/useMeetingEndFlow";
import { useMeetingTranscriptSession } from "~/hooks/useMeetingTranscriptSession";
import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";
import { useMeetingElapsedTime } from "~/hooks/useMeetingElapsedTime";
import { canManageMeetingSessions } from "~/api/auth/authApi";
import {
  findMeetingSessionRecord,
  isTerminalMeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionRegistry";
import { clearPendingMeetingNavigation } from "~/api/meetingSessions/pendingMeetingNavigation";
import { workspaceMeetingSummaryPath, workspacePath } from "~/routing/workspacePaths";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { meetingStartDebug } from "~/utils/meetingStartDebug";
import { mergeDisplaySegments } from "~/utils/meetingSegments";
import {
  formatStatus,
  formatTranscriptConnectionStatus,
  isCompletedMeetingStatus,
  isElapsedMeetingStatus,
} from "~/utils/meetingStatusLabels";

import { meetingEndPresentation } from "./meetingEndPresentation";

export default function Meeting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { workspace, workspaceId } = useAuthenticatedLayout();
  const canManageSessions = canManageMeetingSessions(workspace.role);
  const registeredSession = findMeetingSessionRecord(workspaceId, id ?? "");
  const routeSessionId = id?.startsWith("session_") ? id : "";
  const sessionId =
    searchParams.get("sessionId")?.trim() || registeredSession?.sessionId || routeSessionId;
  const isSessionOnlyRoute = Boolean(sessionId && id === sessionId);
  const runtimeMeetingId = isSessionOnlyRoute ? undefined : id;
  const runtime = useMeetingRuntime(runtimeMeetingId);
  // 旧経路(meeting_id直接)の終了完了表示。session経路はuseMeetingEndFlowが管理する。
  const [legacyShowEndedModal, setLegacyShowEndedModal] = useState(false);
  const [legacyEndedAt, setLegacyEndedAt] = useState("");
  const [legacyEndError, setLegacyEndError] = useState<string | null>(null);
  // endFlow.showEndedModal は下で算出するため、WS切断条件には後述のshowEndedModalを使う。
  const [endedModalVisible, setEndedModalVisible] = useState(false);
  const transcriptSession = useMeetingTranscriptSession(
    runtimeMeetingId ?? sessionId,
    sessionId,
    workspaceId,
    // finalization(ending)中は最後の文字起こし・tree更新・正式なended通知を
    // 受信するためWebSocketを維持し、正式な終了確認後にのみ切断する。
    { connectWebSocket: !endedModalVisible },
  );
  const endFlow = useMeetingEndFlow({
    workspaceId,
    sessionId,
    observedStatus: transcriptSession.sessionStatus,
    observedEndedAt: transcriptSession.sessionEndedAt,
    wsConnected: transcriptSession.connectionStatus === "connected",
  });
  const showEndedModal = sessionId ? endFlow.showEndedModal : legacyShowEndedModal;
  useEffect(() => {
    setEndedModalVisible(showEndedModal);
  }, [showEndedModal]);
  const clearedPendingSessionRef = useRef("");
  const sessionEndError = sessionId ? endFlow.endError : legacyEndError;
  const detailTargetId = sessionId || runtimeMeetingId || id || "";
  // 終了ボタンが押された/終了処理中/終了表示中かどうか。trueの間は「Botが会議から
  // 退出しました」トースト(想定外の退出向け)を出さない。
  const isLocalEnd = endFlow.isFinalizing || endFlow.isRequestingEnd || showEndedModal;
  const { toasts: botStatusToasts, dismissToast: dismissBotStatusToast } = useBotStatusToasts(
    detailTargetId,
    transcriptSession.sessionStatus,
    {
      endReason: transcriptSession.sessionEndReason,
      isLocalEnd,
      botConnectionLost: transcriptSession.botConnectionLost,
      transcriptHealth: transcriptSession.transcriptHealth,
    },
  );
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const summaryPath = workspaceMeetingSummaryPath(workspaceId, detailTargetId);
  const meetingTitle = runtime.meeting?.title?.trim()
    ? getMeetingDisplayTitle(
        {
          id: runtime.meeting.id,
          title: runtime.meeting.title,
          titleSource: runtime.meeting.source,
        },
        { component: "meeting-page-runtime" },
      )
    : sessionId
      ? getMeetingDisplayTitle(
          {
            sessionId,
            title: transcriptSession.sessionTitle,
            titleSource: transcriptSession.sessionTitleSource,
          },
          { component: "meeting-page-header" },
        )
      : "会議";

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.title = `${meetingTitle} | DeciScope`;
  }, [meetingTitle]);

  useEffect(() => {
    setLegacyShowEndedModal(false);
    setLegacyEndedAt("");
    setLegacyEndError(null);
  }, [runtimeMeetingId, sessionId]);

  useEffect(() => {
    if (
      !sessionId ||
      !transcriptSession.sessionStatus ||
      clearedPendingSessionRef.current === sessionId
    ) {
      return;
    }
    clearPendingMeetingNavigation(workspaceId, sessionId);
    clearedPendingSessionRef.current = sessionId;
    meetingStartDebug("meeting-page", "pending meeting navigation cleared", {
      reason: "session_restored",
      sessionId,
      meetingStatus: transcriptSession.sessionStatus,
    });
  }, [sessionId, transcriptSession.sessionStatus, workspaceId]);

  const partials = useMemo(
    () => [...Object.values(runtime.partials), ...transcriptSession.partials],
    [runtime.partials, transcriptSession.partials],
  );
  const segments = useMemo(
    () => mergeDisplaySegments(runtime.segments, transcriptSession.segments),
    [runtime.segments, transcriptSession.segments],
  );
  // session storeがliveとdurable final snapshotをtreeVersionで比較した選択結果。
  // 遅れて完了した古いREST responseが新しいWS treeを覆わない。
  const analysisTree = transcriptSession.discussionTree.tree;
  const runtimeTreeNodes = runtime.tree?.nodes ?? [];
  const treeNodes = runtimeTreeNodes.length > 0 ? runtimeTreeNodes : (analysisTree?.nodes ?? []);
  const treeEdges =
    runtimeTreeNodes.length > 0 ? (runtime.tree?.edges ?? []) : (analysisTree?.edges ?? []);
  const lifecycleSnapshotRef = useRef({
    sessionId: sessionId || null,
    pathname: location.pathname,
    treeVersion: transcriptSession.discussionTree.treeVersion,
    nodeCount: treeNodes.length,
    analysisVersion: transcriptSession.analysisRuntimeStatus.liveVersion,
    selectedAnalysisType: transcriptSession.discussionTree.source,
    selectionReason: transcriptSession.discussionTree.selectionReason,
  });
  lifecycleSnapshotRef.current = {
    sessionId: sessionId || null,
    pathname: location.pathname,
    treeVersion: transcriptSession.discussionTree.treeVersion,
    nodeCount: treeNodes.length,
    analysisVersion: transcriptSession.analysisRuntimeStatus.liveVersion,
    selectedAnalysisType: transcriptSession.discussionTree.source,
    selectionReason: transcriptSession.discussionTree.selectionReason,
  };
  useEffect(() => {
    const debug = (message: string, extra: Record<string, unknown> = {}) =>
      meetingStartDebug("meeting-page", message, {
        ...lifecycleSnapshotRef.current,
        ...extra,
        timestamp: new Date().toISOString(),
      });
    debug("MeetingPage mounted", {
      routeMeetingId: id,
      runtimeMeetingId: runtimeMeetingId ?? null,
      isSessionOnlyRoute,
    });
    const beforeUnload = () => debug("beforeunload");
    const pageShow = (event: PageTransitionEvent) =>
      debug("pageshow", { persisted: event.persisted });
    const pageHide = (event: PageTransitionEvent) =>
      debug("pagehide", { persisted: event.persisted });
    const visibilityChange = () =>
      debug("visibilitychange", { visibilityState: document.visibilityState });
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      debug("MeetingPage unmounted");
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, []);
  const previousRouteRef = useRef({ pathname: "", sessionId: "" });
  useEffect(() => {
    const previous = previousRouteRef.current;
    meetingStartDebug("meeting-page", "route state observed", {
      ...lifecycleSnapshotRef.current,
      previousPathname: previous.pathname || null,
      previousSessionId: previous.sessionId || null,
      pathnameChanged: Boolean(previous.pathname && previous.pathname !== location.pathname),
      sessionIdChanged: Boolean(previous.sessionId && previous.sessionId !== sessionId),
      timestamp: new Date().toISOString(),
    });
    previousRouteRef.current = { pathname: location.pathname, sessionId };
  }, [location.pathname, sessionId]);
  const meetingSessionStatus = sessionId
    ? endFlow.effectiveStatus
    : transcriptSession.sessionStatus;
  const statusLabel =
    meetingSessionStatus ??
    runtime.meetingState.status ??
    runtime.meeting?.status ??
    runtime.connectionStatus;
  const displayStatus = formatStatus(statusLabel);
  const isEndedStatus = isTerminalMeetingSessionStatus(statusLabel);
  const isFinalizing = sessionId ? endFlow.isFinalizing : runtime.isEnding;
  const isEndingMeeting = runtime.isEnding || endFlow.isRequestingEnd || isFinalizing;
  const endPresentation = meetingEndPresentation(isEndingMeeting, showEndedModal);
  const canEndMeeting = Boolean((runtimeMeetingId || sessionId) && canManageSessions);
  const sessionEndedAt = sessionId
    ? endFlow.endedAt
    : legacyEndedAt || transcriptSession.sessionEndedAt;
  const elapsedStartAt =
    transcriptSession.sessionJoinedAt ||
    (isElapsedMeetingStatus(statusLabel) ? transcriptSession.sessionCreatedAt : "");
  const elapsedLabel = useMeetingElapsedTime(elapsedStartAt, sessionEndedAt, isEndedStatus);
  const transcriptNotice = transcriptSession.error
    ? transcriptSession.error
    : sessionId &&
        !isEndedStatus &&
        transcriptSession.connectionStatus !== "idle" &&
        transcriptSession.connectionStatus !== "connected"
      ? `文字起こしWebSocket: ${formatTranscriptConnectionStatus(
          transcriptSession.connectionStatus,
        )}`
      : null;
  const endedNotice =
    isCompletedMeetingStatus(statusLabel) && !showEndedModal
      ? "この会議は終了済みです。文字起こしの内容は会議詳細画面から確認できます。"
      : null;
  // ending中も最後のlive treeVersionと最終tree auditを受信・確認できるよう、
  // 全画面modalではなく非破壊のstatus bannerを表示する。
  const finalizingNotice = endPresentation.finalizingNotice;
  const pageNotice =
    runtime.error ?? sessionEndError ?? finalizingNotice ?? endedNotice ?? transcriptNotice;
  const connectionRecoveryRequired = runtime.recoveryRequired || transcriptSession.recoveryRequired;

  const retryConnections = useCallback(() => {
    if (runtime.recoveryRequired) {
      runtime.retryConnection();
    }
    if (transcriptSession.recoveryRequired) {
      transcriptSession.retryConnection();
    }
  }, [runtime, transcriptSession]);

  const requestSessionEnd = endFlow.requestEnd;
  const finishMeeting = useCallback(async () => {
    if (isEndingMeeting || isEndedStatus || showEndedModal) {
      return;
    }
    if (sessionId) {
      // session経路: 終了APIのレスポンスstatusをそのまま反映し、endingの間は
      // finalization待機、正式なendedを受信してから完了モーダルへ進む。
      await requestSessionEnd();
      return;
    }

    setLegacyEndError(null);
    try {
      await runtime.finishMeeting();
      setLegacyEndedAt(new Date().toISOString());
      setLegacyShowEndedModal(true);
    } catch (cause) {
      setLegacyEndError(
        `会議の終了に失敗しました。時間をおいて再度お試しください。${errorMessageSuffix(cause)}`,
      );
    }
  }, [isEndedStatus, isEndingMeeting, requestSessionEnd, runtime, sessionId, showEndedModal]);

  const chrome = useMemo(
    () => ({
      header: {
        title: meetingTitle,
        subtitle: `経過 ${elapsedLabel ?? "--:--"}`,
        status: <LiveStatusBadge status={statusLabel} label={displayStatus} />,
        actions: (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {canManageSessions && (
              <MeetingEndAction
                disabled={!canEndMeeting || isEndedStatus || showEndedModal}
                isEnding={isEndingMeeting}
                onConfirm={finishMeeting}
              />
            )}
          </div>
        ),
      },
    }),
    [
      canEndMeeting,
      displayStatus,
      elapsedLabel,
      finishMeeting,
      isEndedStatus,
      isEndingMeeting,
      meetingTitle,
      showEndedModal,
      statusLabel,
    ],
  );
  useWorkspaceChrome(chrome);

  return (
    <section className="flex h-full min-w-0 flex-col gap-2 overflow-hidden">
      <BotStatusToasts toasts={botStatusToasts} onDismiss={dismissBotStatusToast} />

      {pageNotice && (
        <div
          className="flex items-center justify-between gap-3 rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
          role={isEndingMeeting ? "status" : undefined}
        >
          <span className="min-w-0 flex-1">{pageNotice}</span>
          {isEndingMeeting && (
            <div
              className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="会議の終了処理中"
              style={{ background: "var(--input-bg)" }}
            >
              <div
                className="ds-progress-indeterminate h-full w-2/5 rounded-full"
                style={{ background: "var(--brand)" }}
              />
            </div>
          )}
          {connectionRecoveryRequired && (
            <DsButton type="button" variant="secondary" onClick={retryConnections}>
              再接続
            </DsButton>
          )}
        </div>
      )}

      <MeetingWorkspaceGrid
        className="min-h-0 flex-1"
        partials={partials}
        segments={segments}
        treeNodes={treeNodes}
        treeEdges={treeEdges}
        insights={runtime.analysisItems}
        speakerSummaries={runtime.speakerSummaries}
        liveAnalysis={transcriptSession.liveAnalysis}
        liveAnalysisMeta={transcriptSession.liveAnalysisMeta}
        connectionStatus={transcriptSession.connectionStatus}
        canManageSessions={canManageSessions}
        workspaceId={workspaceId}
        sessionId={sessionId}
        analysisVersion={transcriptSession.analysisRuntimeStatus.liveVersion}
        treeVersion={transcriptSession.discussionTree.treeVersion}
      />

      {endPresentation.showBlockingCompletionModal && (
        <MeetingEndedModal
          onGoHome={() => navigate(meetingsPath)}
          onGoSummary={() => navigate(summaryPath)}
        />
      )}
    </section>
  );
}

function errorMessageSuffix(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  return message ? ` (${message})` : "";
}
