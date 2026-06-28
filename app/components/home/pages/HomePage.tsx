import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";

import { getMeetingSession } from "~/api/meetingSessions/meetingSessionsApi";
import {
  deleteMeetingSessionRecord,
  isTerminalMeetingSessionStatus,
  listMeetingSessionRecords,
  type MeetingSessionRecord,
  updateMeetingSessionRecordStatus,
} from "~/api/meetingSessions/meetingSessionRegistry";
import { listMeetings, type MeetingDto } from "~/api/meetings/meetingsApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import {
  workspaceMeetingPath,
  workspaceMeetingSummaryPath,
  workspacePath,
} from "~/routing/workspacePaths";

const staleActiveSessionMs = 12 * 60 * 60 * 1000;

export default function Home() {
  const { today, user, workspaceId } = useAuthenticatedLayout();
  const displayName = user.displayName?.split(" ")[0] ?? "ゲスト";
  const [meetings, setMeetings] = useState<MeetingDto[]>([]);
  const [meetingSessions, setMeetingSessions] = useState<MeetingSessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const newMeetingPath = workspacePath(workspaceId, "/meetings/new");

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    Promise.all([listMeetings(workspaceId), refreshMeetingSessionRecords(workspaceId)])
      .then(([result, sessions]) => {
        if (!active) {
          return;
        }
        setMeetings(result.meetings);
        setMeetingSessions(sessions);
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
    () => buildMeetingItems(meetings, meetingSessions, workspaceId),
    [meetingSessions, meetings, workspaceId],
  );
  const allActiveMeetings = useMemo(
    () => sortByCreatedAtDesc(meetingItems.filter(isActiveMeetingItem)),
    [meetingItems],
  );
  const activeMeetings = useMemo(() => allActiveMeetings.slice(0, 3), [allActiveMeetings]);
  const recentMeetings = useMemo(
    () => meetingItems.filter((meeting) => !isActiveMeetingItem(meeting)).slice(0, 5),
    [meetingItems],
  );

  const chrome = useMemo(
    () => ({
      header: {
        title: `こんにちは、${displayName}さん`,
        subtitle: today,
        actions: (
          <Link to={newMeetingPath}>
            <DsButton>
              <HiPlus className="h-3.5 w-3.5" />
              会議を開始
            </DsButton>
          </Link>
        ),
      },
    }),
    [displayName, newMeetingPath, today],
  );
  useWorkspaceChrome(chrome);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:overflow-y-auto">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: "進行中の会議", value: String(allActiveMeetings.length), color: "var(--brand)" },
          {
            label: "終了した会議",
            value: String(recentMeetings.length),
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
        <SectionHeader title="最近の会議" actionLabel="すべて" />
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
                <p
                  className="truncate text-[13px] font-medium"
                  style={{ color: "var(--text-main)" }}
                >
                  {meeting.title}
                </p>
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

type MeetingListItem = {
  id: string;
  title: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  ended_at?: string;
  detailId: string;
  to: string;
  recentTo: string;
  actionLabel: string;
  isTeamsSession: boolean;
};

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
        <p className="truncate text-[13px] font-medium" style={{ color: "var(--text-main)" }}>
          {meeting.title}
        </p>
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

function SectionHeader({ actionLabel, title }: { actionLabel?: string; title: string }) {
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
      {actionLabel && (
        <button type="button" className="text-[11px] font-medium text-(--brand)">
          {actionLabel}
        </button>
      )}
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

async function refreshMeetingSessionRecords(workspaceId: string) {
  const records = listMeetingSessionRecords(workspaceId);
  await Promise.all(
    records.map(async (record) => {
      try {
        const session = await getMeetingSession(record.sessionId);
        updateMeetingSessionRecordStatus(workspaceId, record.sessionId, session.status);
      } catch (cause) {
        if (isMissingMeetingSessionError(cause)) {
          deleteMeetingSessionRecord(record.sessionId);
        }
      }
    }),
  );
  return listMeetingSessionRecords(workspaceId);
}

function buildMeetingItems(
  meetings: MeetingDto[],
  sessions: MeetingSessionRecord[],
  workspaceId: string,
) {
  const sessionByMeetingId = new Map<string, MeetingSessionRecord>();
  const sessionById = new Map<string, MeetingSessionRecord>();
  for (const session of sessions) {
    sessionById.set(session.sessionId, session);
    if (session.meetingId) {
      sessionByMeetingId.set(session.meetingId, session);
    }
  }

  const usedSessionIds = new Set<string>();
  const items: MeetingListItem[] = [];

  for (const meeting of meetings) {
    const linkedSession = sessionByMeetingId.get(meeting.id) ?? sessionById.get(meeting.id);

    if (meeting.source === "teams_bot") {
      if (!linkedSession) {
        if (meeting.status === "ended") {
          items.push(meetingToListItem(meeting, workspaceId));
        }
        continue;
      }

      usedSessionIds.add(linkedSession.sessionId);
      items.push(meetingToListItem(meeting, workspaceId, linkedSession));
      continue;
    }

    items.push(meetingToListItem(meeting, workspaceId));
  }

  for (const session of sessions) {
    if (!usedSessionIds.has(session.sessionId)) {
      items.push(sessionToListItem(session, workspaceId));
    }
  }

  return items.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

function meetingToListItem(
  meeting: MeetingDto,
  workspaceId: string,
  session?: MeetingSessionRecord,
): MeetingListItem {
  const meetingEnded = meeting.status === "ended" || Boolean(meeting.ended_at);
  const status = meetingEnded ? "ended" : (session?.status ?? meeting.status);
  const sessionQuery = session ? `?sessionId=${encodeURIComponent(session.sessionId)}` : "";
  const meetingPath = `${workspaceMeetingPath(workspaceId, meeting.id)}${sessionQuery}`;
  return {
    id: meeting.id,
    title: meeting.title,
    status,
    source: meeting.source,
    created_at: meeting.created_at,
    updated_at: meetingEnded ? meeting.updated_at : (session?.updatedAt ?? meeting.updated_at),
    ended_at: meetingEnded
      ? (meeting.ended_at ?? meeting.updated_at)
      : isTerminalMeetingSessionStatus(status)
        ? (session?.updatedAt ?? meeting.ended_at)
        : meeting.ended_at,
    detailId: session?.sessionId ?? meeting.id,
    to: meetingPath,
    recentTo: session ? meetingPath : workspaceMeetingSummaryPath(workspaceId, meeting.id),
    actionLabel: isActiveMeetingStatus(status, Boolean(session)) ? "開く" : "記録を見る",
    isTeamsSession: Boolean(session),
  };
}

function sessionToListItem(session: MeetingSessionRecord, workspaceId: string): MeetingListItem {
  const meetingPath = `${workspaceMeetingPath(
    workspaceId,
    session.sessionId,
  )}?sessionId=${encodeURIComponent(session.sessionId)}`;
  return {
    id: session.sessionId,
    title: session.title,
    status: session.status,
    source: "teams_bot",
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    ended_at: isTerminalMeetingSessionStatus(session.status) ? session.updatedAt : undefined,
    detailId: session.sessionId,
    to: meetingPath,
    recentTo: meetingPath,
    actionLabel: isActiveMeetingStatus(session.status, true) ? "開く" : "記録を見る",
    isTeamsSession: true,
  };
}

function isActiveMeetingItem(item: MeetingListItem) {
  if (!isActiveMeetingStatus(item.status, item.isTeamsSession)) {
    return false;
  }
  if (!item.isTeamsSession) {
    return true;
  }
  return Date.now() - Date.parse(item.updated_at) <= staleActiveSessionMs;
}

function isActiveMeetingStatus(status: string, isTeamsSession: boolean) {
  if (isTeamsSession) {
    return (
      status === "requested" ||
      status === "pending_join" ||
      status === "command_sent" ||
      status === "joining" ||
      status === "joined" ||
      status === "active" ||
      status === "recording"
    );
  }
  return status === "started";
}

function sortByCreatedAtDesc(items: MeetingListItem[]) {
  return [...items].sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at));
}

function dateValue(value?: string) {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function isMissingMeetingSessionError(cause: unknown) {
  if (!(cause instanceof Error)) {
    return false;
  }
  const message = cause.message.toLowerCase();
  return message.includes("404") || message.includes("not found");
}

function formatShortDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string) {
  switch (status) {
    case "created":
      return "作成済み";
    case "started":
      return "進行中";
    case "ended":
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

function formatSource(source: string) {
  switch (source) {
    case "fixture_replay":
      return "テストデータ";
    case "teams_bot":
      return "Teams会議";
    case "upload":
      return "ファイル";
    default:
      return source;
  }
}
