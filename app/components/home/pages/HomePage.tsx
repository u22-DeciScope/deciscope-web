import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";

import { listWorkspaceFinalSummaryPreviews } from "~/api/aiAnalysis/aiAnalysisApi";
import { canManageMeetingSessions, normalizeWorkspaceRole } from "~/api/auth/authApi";
import { RoleBadge, ViewerOnlyBadge } from "~/components/workspace/parts/RoleBadge";
import {
  listWorkspaceMeetingSessions,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import { DsButton } from "~/components/DsButton";
import {
  buildMeetingItems,
  formatDuration,
  formatShortDate,
  formatSource,
  isActiveMeetingItem,
  isActiveMeetingStatus,
  sortByCreatedAtDesc,
  type MeetingListItem,
} from "~/components/home/meetingListItems";
import { MeetingTitleLine } from "~/components/home/parts/MeetingTitleLine";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { meetingStartDebug } from "~/utils/meetingStartDebug";
import { formatStatus } from "~/utils/meetingStatusLabels";

export default function Home() {
  const { workspace, workspaceId } = useAuthenticatedLayout();
  const [meetingSessions, setMeetingSessions] = useState<MeetingSessionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryPreviews, setSummaryPreviews] = useState<Record<string, string>>({});
  const canCreateMeeting = canManageMeetingSessions(workspace.role);
  const newMeetingPath = workspacePath(workspaceId, "/meetings/new");
  const meetingHistoryPath = workspacePath(workspaceId, "/meetings/history");

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listWorkspaceMeetingSessions(workspaceId)
      .then((sessions) => {
        if (!active) {
          return;
        }
        setMeetingSessions(sessions);
        meetingStartDebug("dashboard", "dashboard fetched sessions", {
          sessionCount: sessions.length,
          activeSessions: sessions.filter((session) => isActiveMeetingStatus(session.status, true))
            .length,
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "会議一覧を取得できませんでした。");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    listWorkspaceFinalSummaryPreviews(workspaceId)
      .then((previews) => {
        if (!active) {
          return;
        }
        setSummaryPreviews(
          Object.fromEntries(previews.map((preview) => [preview.sessionId, preview.overview])),
        );
      })
      .catch(() => {
        // AI要約プレビューはあくまで補助表示。取得に失敗しても一覧表示自体は継続する。
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const meetingItems = useMemo(
    () => buildMeetingItems(meetingSessions, workspaceId),
    [meetingSessions, workspaceId],
  );
  const allActiveMeetings = useMemo(() => {
    const active = meetingItems.filter(isActiveMeetingItem);
    meetingStartDebug("dashboard", "activeSessions filtering result", {
      total: meetingItems.length,
      active: active.length,
      inactive: meetingItems.length - active.length,
    });
    return sortByCreatedAtDesc(active);
  }, [meetingItems]);
  const activeMeetings = useMemo(() => allActiveMeetings.slice(0, 3), [allActiveMeetings]);
  // ホームの一覧は終了した会議のうち直近7件だけを表示する。
  const finishedMeetings = useMemo(
    () => meetingItems.filter((meeting) => !isActiveMeetingItem(meeting)),
    [meetingItems],
  );
  const recentMeetings = useMemo(() => finishedMeetings.slice(0, 7), [finishedMeetings]);

  const chrome = useMemo(
    () => ({
      header: {
        title: (
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              {workspace.name.charAt(0)}
            </span>
            <span className="truncate text-[16px] font-bold" style={{ color: "var(--text-main)" }}>
              {workspace.name}
            </span>
            <RoleBadge role={workspace.role} />
            {normalizeWorkspaceRole(workspace.role) === "viewer" && <ViewerOnlyBadge />}
          </span>
        ),
        actions: canCreateMeeting ? (
          <Link to={newMeetingPath}>
            <DsButton className="px-5 py-2.5 text-[13px] shadow-md">
              <HiPlus className="h-4 w-4" />
              会議を開始
            </DsButton>
          </Link>
        ) : (
          <DsButton disabled variant="secondary">
            <HiPlus className="h-3.5 w-3.5" />
            閲覧のみ
          </DsButton>
        ),
      },
      fullBleedMain: true,
    }),
    [canCreateMeeting, newMeetingPath, workspace.name, workspace.role],
  );
  useWorkspaceChrome(chrome);

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-6 rounded-(--ds-radius-panel) p-3 sm:p-4 md:overflow-y-auto"
      style={{ background: "var(--ds-bg)" }}
    >
      {!isLoading && !error && activeMeetings.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="進行中の会議" count={allActiveMeetings.length} />
          {!canCreateMeeting && (
            <EmptyCard label="閲覧者権限のため、Botを会議に参加させることはできません。" />
          )}
          {activeMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="最近の会議"
          count={finishedMeetings.length}
          actionLabel="すべて"
          actionTo={meetingHistoryPath}
        />
        {isLoading && <EmptyCard label="会議を読み込んでいます..." />}
        {!isLoading && error && <EmptyCard label={error} />}
        {!isLoading && !error && recentMeetings.length === 0 && (
          <EmptyCard label="終了した会議はまだありません。" />
        )}
        {!isLoading &&
          !error &&
          recentMeetings.map((meeting) => (
            <RecentMeetingCard
              key={meeting.id}
              meeting={meeting}
              summary={summaryPreviews[meeting.id]}
            />
          ))}
      </section>
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: MeetingListItem }) {
  return (
    <div
      className="ds-surface flex items-center gap-4 rounded-(--ds-radius-panel) border px-5 py-5 sm:px-6 sm:py-6"
      style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
    >
      <div className="min-w-20">
        <p className="text-[13px] font-bold" style={{ color: "var(--text-main)" }}>
          {formatStatus(meeting.status)}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {formatShortDate(meeting.created_at)}
        </p>
      </div>
      <div className="h-10 w-px" style={{ background: "var(--ds-border)" }} />
      <div className="min-w-0 flex-1">
        <span
          className="mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--tag-topic-bg)", color: "var(--tag-topic-fg)" }}
        >
          {formatSource(meeting.source)}
        </span>
        <MeetingTitleLine teamsTitle={meeting.teamsTitle} title={meeting.title} />
        <p className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
          {meeting.detailId}
        </p>
      </div>
      <Link to={meeting.to}>
        <DsButton variant="secondary">{meeting.actionLabel}</DsButton>
      </Link>
    </div>
  );
}

function RecentMeetingCard({ meeting, summary }: { meeting: MeetingListItem; summary?: string }) {
  const duration = formatDuration(meeting.joined_at, meeting.ended_at);
  return (
    <Link
      to={meeting.recentTo}
      className="ds-surface flex items-center gap-4 rounded-(--ds-radius-panel) border px-5 py-5 transition hover:opacity-80 sm:px-6 sm:py-6"
      style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--ds-radius-control)"
        style={{ background: "var(--input-bg)" }}
      >
        <HiUserGroup className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.4fr)_6.5rem_4.5rem_minmax(0,1.4fr)]">
        <MeetingTitleLine teamsTitle={meeting.teamsTitle} title={meeting.title} />
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {formatShortDate(meeting.ended_at || meeting.updated_at)}
        </p>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {duration ?? "―"}
        </p>
        <p
          className="text-[11px]"
          style={{
            color: "var(--text-muted)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {summary ?? "AI要約はまだありません"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {formatStatus(meeting.status)}
        </span>
        <HiChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      </div>
    </Link>
  );
}

function SectionHeader({
  actionLabel,
  actionTo,
  count,
  title,
}: {
  actionLabel?: string;
  actionTo?: string;
  count?: number;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--brand)" />
        <span className="text-[16px] font-bold" style={{ color: "var(--text-main)" }}>
          {title}
        </span>
        {typeof count === "number" && (
          <span
            className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
            style={{ background: "var(--ds-surface)", color: "var(--text-sub)" }}
          >
            全{count}件
          </span>
        )}
      </div>
      {actionLabel &&
        (actionTo ? (
          <Link
            to={actionTo}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition hover:opacity-80"
            style={{ background: "var(--ds-surface)", color: "var(--brand)" }}
          >
            {actionLabel}
            <HiChevronRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition hover:opacity-80"
            style={{ background: "var(--ds-surface)", color: "var(--brand)" }}
          >
            {actionLabel}
            <HiChevronRight className="h-3.5 w-3.5" />
          </button>
        ))}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) border px-5 py-6 text-[12px] sm:px-6"
      style={{
        borderColor: "var(--ds-border)",
        boxShadow: "var(--ds-shadow)",
        color: "var(--text-muted)",
      }}
    >
      {label}
    </div>
  );
}
