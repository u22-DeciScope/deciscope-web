import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";

import { canManageMeetingSessions, normalizeWorkspaceRole } from "~/api/auth/authApi";
import { RoleBadge, ViewerOnlyBadge } from "~/components/workspace/parts/RoleBadge";
import {
  listWorkspaceMeetingSessions,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import { DsButton } from "~/components/DsButton";
import {
  buildMeetingItems,
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
  // 終了した会議の全件。統計カードは全件数を表示し、「最近の会議」リストは
  // 先頭5件だけを表示する(切り詰め後の件数を統計に使うと会議数と合わなくなる)。
  const finishedMeetings = useMemo(
    () => meetingItems.filter((meeting) => !isActiveMeetingItem(meeting)),
    [meetingItems],
  );
  const recentMeetings = useMemo(() => finishedMeetings.slice(0, 5), [finishedMeetings]);

  // 主見出しはワークスペース名 + role badge のみ。ユーザー名・日付は表示しない。
  const chrome = useMemo(
    () => ({
      header: {
        title: (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{workspace.name}</span>
            <RoleBadge role={workspace.role} />
            {normalizeWorkspaceRole(workspace.role) === "viewer" && <ViewerOnlyBadge />}
          </span>
        ),
        actions: canCreateMeeting ? (
          <Link to={newMeetingPath}>
            <DsButton>
              <HiPlus className="h-3.5 w-3.5" />
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
    }),
    [canCreateMeeting, newMeetingPath, workspace.name, workspace.role],
  );
  useWorkspaceChrome(chrome);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:overflow-y-auto">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: "進行中の会議", value: String(allActiveMeetings.length), color: "var(--brand)" },
          {
            label: "終了した会議",
            value: String(finishedMeetings.length),
            color: "var(--success)",
          },
          { label: "会議数", value: String(meetingItems.length), color: "var(--warning)" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="ds-surface rounded-(--ds-radius-panel) px-5 py-4"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </p>
            <span className="text-[26px] font-bold leading-none" style={{ color: stat.color }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      <section
        className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <SectionHeader title="進行中の会議" />
        <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
          {!canCreateMeeting && (
            <EmptyRow label="閲覧者権限のため、Botを会議に参加させることはできません。" />
          )}
          {isLoading && <EmptyRow label="会議を読み込んでいます..." />}
          {!isLoading && error && <EmptyRow label={error} />}
          {!isLoading && !error && activeMeetings.length === 0 && (
            <EmptyRow label="進行中の会議はまだありません。会議を開始するとここに表示されます。" />
          )}
          {!isLoading &&
            !error &&
            activeMeetings.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} />)}
        </div>
      </section>

      <section
        className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <SectionHeader title="最近の会議" actionLabel="すべて" actionTo={meetingHistoryPath} />
        <div>
          {!isLoading && !error && recentMeetings.length === 0 && (
            <EmptyRow label="終了した会議はまだありません。" />
          )}
          {recentMeetings.map((meeting, index) => (
            <Link
              key={meeting.id}
              to={meeting.recentTo}
              className="flex items-center gap-4 px-5 py-3 transition hover:opacity-80"
              style={
                index < recentMeetings.length - 1
                  ? { borderBottom: "1px solid var(--ds-border)" }
                  : {}
              }
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-(--ds-radius-control)"
                style={{ background: "var(--input-bg)" }}
              >
                <HiUserGroup className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <MeetingTitleLine teamsTitle={meeting.teamsTitle} title={meeting.title} />
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {formatShortDate(meeting.ended_at || meeting.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {formatStatus(meeting.status)}
                </span>
                <HiChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: MeetingListItem }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="min-w-20">
        <p className="text-[13px] font-bold" style={{ color: "var(--text-main)" }}>
          {formatStatus(meeting.status)}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {formatShortDate(meeting.created_at)}
        </p>
      </div>
      <div className="h-8 w-px" style={{ background: "var(--ds-border)" }} />
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

function SectionHeader({
  actionLabel,
  actionTo,
  title,
}: {
  actionLabel?: string;
  actionTo?: string;
  title: string;
}) {
  return (
    <div
      className="flex h-10 items-center justify-between border-b px-5"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div className="flex items-center">
        <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-(--brand)" />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
          {title}
        </span>
      </div>
      {actionLabel &&
        (actionTo ? (
          <Link to={actionTo} className="text-[11px] font-medium text-(--brand)">
            {actionLabel}
          </Link>
        ) : (
          <button type="button" className="text-[11px] font-medium text-(--brand)">
            {actionLabel}
          </button>
        ))}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-5 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}
