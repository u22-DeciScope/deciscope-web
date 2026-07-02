import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { DsButton } from "~/components/DsButton";
import { DiscussionTree } from "~/components/meeting/parts/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { AppModalFrame } from "~/components/shared/modal/AppModalFrame";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useMeetingTranscriptSession } from "~/hooks/useMeetingTranscriptSession";
import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";
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
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import { workspaceMeetingSummaryPath, workspacePath } from "~/routing/workspacePaths";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

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
              <DsButton
                disabled={!canEndMeeting || isEndingMeeting || isEndedStatus || showEndedModal}
                variant="secondary"
                onClick={finishMeeting}
              >
                {isEndingMeeting ? "終了中" : "終了"}
              </DsButton>
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
      {pageNotice && (
        <div
          className="rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
        >
          {pageNotice}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(250px,0.85fr)_minmax(420px,1.65fr)_minmax(280px,0.95fr)]">
        <MeetingChatPanel partials={partials} segments={segments} />
        <DiscussionTree nodes={runtime.tree?.nodes ?? []} edges={runtime.tree?.edges ?? []} />
        <MeetingAssistantPanel
          insights={runtime.analysisItems}
          speakerSummaries={runtime.speakerSummaries}
        />
      </div>

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

function mergeDisplaySegments(
  runtimeSegments: MeetingSegmentDto[],
  transcriptSegments: MeetingSegmentDto[],
) {
  const byId = new Map<string, MeetingSegmentDto>();
  for (const segment of runtimeSegments) {
    byId.set(segment.segment_id, segment);
  }
  for (const segment of transcriptSegments) {
    byId.set(segment.segment_id, segment);
  }
  return [...byId.values()].sort((a, b) => {
    const timeA = Date.parse(a.created_at);
    const timeB = Date.parse(b.created_at);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.seq - b.seq;
  });
}

function useMeetingElapsedTime(startAt: string, endAt: string, isEnded: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!startAt || isEnded) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isEnded, startAt]);

  return useMemo(() => {
    const startMs = parseTimestampMs(startAt);
    if (startMs === null) {
      return null;
    }
    const endMs = parseTimestampMs(endAt) ?? nowMs;
    return formatElapsedDuration(Math.max(0, endMs - startMs));
  }, [endAt, nowMs, startAt]);
}

function parseTimestampMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatElapsedDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

function isElapsedMeetingStatus(status: string) {
  return status === "joined" || status === "active" || status === "recording";
}

function isCompletedMeetingStatus(status: string) {
  return (
    status === "ended" || status === "completed" || status === "closed" || status === "finished"
  );
}

function MeetingEndedModal({
  mode,
  onGoHome,
  onGoSummary,
}: {
  mode: "ending" | "ended";
  onGoHome: () => void;
  onGoSummary: () => void;
}) {
  const ending = mode === "ending";

  return (
    <AppModalFrame
      ariaLabelledBy="meeting-ended-dialog-title"
      onClose={() => {}}
      className="w-full max-w-md overflow-hidden rounded-(--ds-radius-dialog) border p-5 outline-none"
      style={{
        background: "var(--ds-surface-raised)",
        borderColor: "var(--ds-border)",
        boxShadow: "0 24px 80px rgba(15, 38, 56, 0.32)",
      }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2
            id="meeting-ended-dialog-title"
            className="text-base font-bold"
            style={{ color: "var(--text-main)" }}
          >
            {ending ? "会議を終了しています..." : "会議が終了しました"}
          </h2>
          <p
            className="mt-2 whitespace-pre-line text-sm leading-relaxed"
            style={{ color: "var(--text-sub)" }}
          >
            {ending
              ? "Botの退出処理を実行しています。"
              : "BotはTeams会議から退出しました。\n文字起こしの内容は会議詳細画面から確認できます。"}
          </p>
        </div>

        {ending ? (
          <div
            className="h-1.5 overflow-hidden rounded-full"
            style={{ background: "var(--input-bg)" }}
          >
            <div
              className="h-full w-1/2 animate-pulse rounded-full"
              style={{ background: "var(--brand)" }}
            />
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DsButton type="button" variant="secondary" onClick={onGoHome}>
              メイン画面へ戻る
            </DsButton>
            <DsButton type="button" onClick={onGoSummary}>
              会議詳細を見る
            </DsButton>
          </div>
        )}
      </div>
    </AppModalFrame>
  );
}

function LiveStatusBadge({ label, status }: { label: string; status: string }) {
  const ended = status === "ended" || status === "closed";
  const live =
    status === "started" ||
    status === "connected" ||
    status === "joined" ||
    status === "active" ||
    status === "recording";

  return (
    <span
      className="inline-flex h-8 items-center gap-2 rounded-(--ds-radius-control) border px-3 text-[12px] font-bold"
      style={{
        background: live ? "var(--ai-risk-bg)" : "var(--input-bg)",
        borderColor: live ? "var(--ai-risk-border)" : "var(--input-border)",
        color: ended ? "var(--text-muted)" : live ? "var(--ai-risk-fg)" : "var(--text-sub)",
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: ended ? "var(--text-muted)" : live ? "var(--status-live)" : "var(--warning)",
        }}
      />
      {label}
    </span>
  );
}

function formatStatus(status: string) {
  switch (status) {
    case "idle":
      return "待機中";
    case "loading":
      return "読み込み中";
    case "connecting":
      return "接続中";
    case "connected":
      return "接続済み";
    case "reconnecting":
      return "再接続中";
    case "closed":
      return "切断";
    case "error":
      return "エラー";
    case "created":
      return "作成済み";
    case "started":
      return "進行中";
    case "ended":
    case "completed":
    case "finished":
      return "終了";
    case "requested":
      return "参加要求済み";
    case "pending_join":
      return "参加待機";
    case "command_sent":
      return "Bot参加命令済み";
    case "joining":
      return "Bot参加中";
    case "joined":
      return "Bot参加済み";
    case "active":
      return "進行中";
    case "recording":
      return "録音中";
    case "failed":
      return "失敗";
    case "stale":
      return "停止扱い";
    case "timeout":
      return "タイムアウト";
    default:
      return status;
  }
}

function formatTranscriptConnectionStatus(status: string) {
  switch (status) {
    case "loading":
      return "履歴取得中";
    case "connecting":
      return "接続中";
    case "reconnecting":
      return "再接続中";
    case "closed":
      return "切断";
    case "error":
      return "エラー";
    default:
      return status;
  }
}

function errorMessageSuffix(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  return message ? ` (${message})` : "";
}
