import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { DsButton } from "~/components/DsButton";
import { BotStatusToasts } from "~/components/meeting/parts/BotStatusToasts";
import { LiveStatusBadge } from "~/components/meeting/parts/LiveStatusBadge";
import { MeetingEndedModal } from "~/components/meeting/parts/MeetingEndedModal";
import { MeetingEndAction } from "~/components/meeting/parts/MeetingEndAction";
import { MeetingWorkspaceGrid } from "~/components/meeting/parts/MeetingWorkspaceGrid";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useBotStatusToasts } from "~/hooks/useBotStatusToasts";
import { useMeetingTranscriptSession } from "~/hooks/useMeetingTranscriptSession";
import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";
import { useMeetingElapsedTime } from "~/hooks/useMeetingElapsedTime";
import type { LiveAnalysisPayload } from "~/api/aiAnalysis/aiAnalysisApi";
import { canManageMeetingSessions } from "~/api/auth/authApi";
import {
  endWorkspaceMeetingSession,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
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

export default function Meeting() {
  const navigate = useNavigate();
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
  const [showEndedModal, setShowEndedModal] = useState(false);
  const transcriptSession = useMeetingTranscriptSession(
    runtimeMeetingId ?? sessionId,
    sessionId,
    workspaceId,
    { connectWebSocket: !showEndedModal },
  );
  const clearedPendingSessionRef = useRef("");
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [sessionEndStatusOverride, setSessionEndStatusOverride] =
    useState<MeetingSessionStatus | null>(null);
  const [sessionEndedAtOverride, setSessionEndedAtOverride] = useState("");
  const [sessionEndError, setSessionEndError] = useState<string | null>(null);
  const detailTargetId = sessionId || runtimeMeetingId || id || "";
  // 終了ボタンが押された/押された結果を表示中かどうか。trueの間は「Botが会議から
  // 退出しました」トースト(想定外の退出向け)を出さない。
  const isLocalEnd = isEndingSession || sessionEndStatusOverride !== null || showEndedModal;
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
    meetingStartDebug("meeting-page", "mounted or route changed", {
      routeMeetingId: id,
      runtimeMeetingId: runtimeMeetingId ?? null,
      sessionId: sessionId || null,
      isSessionOnlyRoute,
    });
  }, [id, isSessionOnlyRoute, runtimeMeetingId, sessionId, workspaceId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.title = `${meetingTitle} | DeciScope`;
  }, [meetingTitle]);

  useEffect(() => {
    setIsEndingSession(false);
    setSessionEndStatusOverride(null);
    setSessionEndedAtOverride("");
    setSessionEndError(null);
    setShowEndedModal(false);
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
  // 議論ツリーは runtime(旧経路)のtreeを優先し、無ければライブ分析のtreeで補う。
  const liveAnalysisTree = useMemo(() => {
    const payload = transcriptSession.liveAnalysis?.payload as LiveAnalysisPayload | null;
    return payload?.tree ?? null;
  }, [transcriptSession.liveAnalysis]);
  const runtimeTreeNodes = runtime.tree?.nodes ?? [];
  const treeNodes =
    runtimeTreeNodes.length > 0 ? runtimeTreeNodes : (liveAnalysisTree?.nodes ?? []);
  const treeEdges =
    runtimeTreeNodes.length > 0 ? (runtime.tree?.edges ?? []) : (liveAnalysisTree?.edges ?? []);
  const meetingSessionStatus = sessionEndStatusOverride ?? transcriptSession.sessionStatus;
  const statusLabel =
    meetingSessionStatus ??
    runtime.meetingState.status ??
    runtime.meeting?.status ??
    runtime.connectionStatus;
  const displayStatus = formatStatus(statusLabel);
  const isEndedStatus = isTerminalMeetingSessionStatus(statusLabel);
  const isEndingMeeting = runtime.isEnding || isEndingSession;
  const canEndMeeting = Boolean((runtimeMeetingId || sessionId) && canManageSessions);
  const endOverlayMode = isEndingMeeting ? "ending" : showEndedModal ? "ended" : null;
  const sessionEndedAt = sessionEndedAtOverride || transcriptSession.sessionEndedAt;
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
  const pageNotice = runtime.error ?? sessionEndError ?? endedNotice ?? transcriptNotice;
  const connectionRecoveryRequired = runtime.recoveryRequired || transcriptSession.recoveryRequired;

  const retryConnections = useCallback(() => {
    if (runtime.recoveryRequired) {
      runtime.retryConnection();
    }
    if (transcriptSession.recoveryRequired) {
      transcriptSession.retryConnection();
    }
  }, [runtime, transcriptSession]);

  const finishMeeting = useCallback(async () => {
    if (isEndingMeeting || isEndedStatus || showEndedModal) {
      return;
    }
    setSessionEndError(null);
    if (sessionId) {
      setIsEndingSession(true);
      try {
        const session = await endWorkspaceMeetingSession(workspaceId, sessionId);
        const endedStatus: MeetingSessionStatus = isTerminalMeetingSessionStatus(session.status)
          ? session.status
          : "ended";
        setSessionEndStatusOverride(endedStatus);
        setSessionEndedAtOverride(session.endedAt ?? new Date().toISOString());
        setShowEndedModal(true);
      } catch (cause) {
        setSessionEndError(
          `会議の終了に失敗しました。時間をおいて再度お試しください。${errorMessageSuffix(cause)}`,
        );
      } finally {
        setIsEndingSession(false);
      }
      return;
    }

    setSessionEndError(null);
    try {
      await runtime.finishMeeting();
      setSessionEndStatusOverride("ended");
      setSessionEndedAtOverride(new Date().toISOString());
      setShowEndedModal(true);
    } catch (cause) {
      setSessionEndError(
        `会議の終了に失敗しました。時間をおいて再度お試しください。${errorMessageSuffix(cause)}`,
      );
    }
  }, [isEndedStatus, isEndingMeeting, runtime, sessionId, showEndedModal, workspaceId]);

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
        >
          <span>{pageNotice}</span>
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
      />

      {endOverlayMode && (
        <MeetingEndedModal
          mode={endOverlayMode}
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
