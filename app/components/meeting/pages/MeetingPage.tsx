import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { DsButton } from "~/components/DsButton";
import { DiscussionTree } from "~/components/meeting/parts/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useMeetingTranscriptSession } from "~/hooks/useMeetingTranscriptSession";
import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";
import {
  endMeetingSession,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";
import {
  findMeetingSessionRecord,
  isTerminalMeetingSessionStatus,
  upsertMeetingSessionRecord,
} from "~/api/meetingSessions/meetingSessionRegistry";
import { clearPendingMeetingNavigation } from "~/api/meetingSessions/pendingMeetingNavigation";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import { workspaceMeetingSummaryPath } from "~/routing/workspacePaths";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

export default function Meeting() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { workspaceId } = useAuthenticatedLayout();
  const registeredSession = findMeetingSessionRecord(workspaceId, id ?? "");
  const routeSessionId = id?.startsWith("session_") ? id : "";
  const sessionId =
    searchParams.get("sessionId")?.trim() || registeredSession?.sessionId || routeSessionId;
  const isSessionOnlyRoute = Boolean(sessionId && id === sessionId);
  const runtimeMeetingId = isSessionOnlyRoute ? undefined : id;
  const runtime = useMeetingRuntime(runtimeMeetingId);
  const transcriptSession = useMeetingTranscriptSession(
    runtimeMeetingId ?? sessionId,
    sessionId,
    workspaceId,
  );
  const clearedPendingSessionRef = useRef("");
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [sessionEndStatusOverride, setSessionEndStatusOverride] =
    useState<MeetingSessionStatus | null>(null);
  const [sessionEndedAtOverride, setSessionEndedAtOverride] = useState("");
  const [sessionEndError, setSessionEndError] = useState<string | null>(null);
  const summaryPath = workspaceMeetingSummaryPath(workspaceId, runtimeMeetingId ?? "");
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
  }, [sessionId]);

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

  useEffect(() => {
    if (!sessionId || !transcriptSession.sessionStatus) {
      return;
    }
    upsertMeetingSessionRecord({
      sessionId,
      workspaceId,
      meetingId: isSessionOnlyRoute ? null : (runtimeMeetingId ?? null),
      title: meetingTitle,
      titleSource: transcriptSession.sessionTitleSource || null,
      status: transcriptSession.sessionStatus,
    });
  }, [
    isSessionOnlyRoute,
    meetingTitle,
    runtimeMeetingId,
    sessionId,
    transcriptSession.sessionStatus,
    transcriptSession.sessionTitleSource,
    workspaceId,
  ]);

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
  const canEndMeeting = Boolean(sessionId || runtimeMeetingId);
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
  const pageNotice = runtime.error ?? sessionEndError ?? transcriptNotice;

  const finishMeeting = useCallback(async () => {
    setSessionEndError(null);
    if (sessionId) {
      setIsEndingSession(true);
      try {
        const session = await endMeetingSession(sessionId);
        setSessionEndStatusOverride(session.status);
        setSessionEndedAtOverride(session.endedAt ?? new Date().toISOString());
        upsertMeetingSessionRecord({
          sessionId: session.sessionId,
          workspaceId,
          meetingId: isSessionOnlyRoute ? null : (runtimeMeetingId ?? null),
          title: session.title ?? meetingTitle,
          titleSource: session.titleSource ?? null,
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          endedAt: session.endedAt ?? null,
        });
      } catch (cause) {
        setSessionEndError(`会議を終了できませんでした: ${errorMessage(cause)}`);
      } finally {
        setIsEndingSession(false);
      }
      return;
    }

    const report = await runtime.finishMeeting();
    if (report) {
      navigate(summaryPath);
    }
  }, [
    isSessionOnlyRoute,
    meetingTitle,
    navigate,
    runtime,
    runtimeMeetingId,
    sessionId,
    summaryPath,
    workspaceId,
  ]);

  const chrome = useMemo(
    () => ({
      header: {
        title: meetingTitle,
        subtitle: `経過 ${elapsedLabel ?? "--:--"}`,
        status: <LiveStatusBadge status={statusLabel} label={displayStatus} />,
        actions: (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <DsButton
              disabled={!canEndMeeting || isEndingMeeting || isEndedStatus}
              variant="secondary"
              onClick={finishMeeting}
            >
              {isEndingMeeting ? "終了中" : "終了"}
            </DsButton>
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

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "unknown error";
}
