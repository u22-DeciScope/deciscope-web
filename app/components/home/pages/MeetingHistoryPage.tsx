import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiUserGroup } from "react-icons/hi2";

import {
  listWorkspaceMeetingSessions,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import {
  buildMeetingItems,
  dateValue,
  isActiveMeetingItem,
  type MeetingListItem,
} from "~/components/home/meetingListItems";
import { MeetingTitleLine } from "~/components/home/parts/MeetingTitleLine";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { isCompletedMeetingStatus, formatStatus } from "~/utils/meetingStatusLabels";

// 終了した会議の履歴一覧。ホームの「最近の会議」は直近5件のみ表示するため、
// 全件はこのページで確認する(「すべて」ボタンの遷移先)。

export default function MeetingHistoryPage() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [meetingSessions, setMeetingSessions] = useState<MeetingSessionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listWorkspaceMeetingSessions(workspaceId)
      .then((sessions) => {
        if (!active) {
          return;
        }
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

  // ホームと同じ判定ロジックで「終了した会議」を抽出し、終了日時の新しい順に並べる。
  const finishedMeetings = useMemo(() => {
    const items = buildMeetingItems(meetingSessions, workspaceId).filter(
      (meeting) => !isActiveMeetingItem(meeting),
    );
    return items.sort(
      (a, b) => dateValue(b.ended_at || b.updated_at) - dateValue(a.ended_at || a.updated_at),
    );
  }, [meetingSessions, workspaceId]);

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return finishedMeetings.filter(
      (meeting) => dateValue(meeting.ended_at || meeting.updated_at) >= monthStart,
    ).length;
  }, [finishedMeetings]);

  const completedCount = useMemo(
    () => finishedMeetings.filter((meeting) => isCompletedMeetingStatus(meeting.status)).length,
    [finishedMeetings],
  );

  const chrome = useMemo(
    () => ({
      header: {
        title: "会議履歴",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "会議履歴" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:overflow-y-auto">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          {
            label: "終了した会議",
            value: String(finishedMeetings.length),
            color: "var(--brand)",
          },
          { label: "今月の会議", value: String(thisMonthCount), color: "var(--warning)" },
          { label: "正常終了", value: String(completedCount), color: "var(--success)" },
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
        <div
          className="flex h-10 items-center border-b px-5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-(--brand)" />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
            終了した会議
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
          {isLoading && <EmptyRow label="会議履歴を読み込んでいます..." />}
          {!isLoading && error && <EmptyRow label={error} />}
          {!isLoading && !error && finishedMeetings.length === 0 && (
            <EmptyRow label="終了した会議はまだありません。" />
          )}
          {!isLoading &&
            !error &&
            finishedMeetings.map((meeting) => (
              <MeetingHistoryRow key={meeting.id} meeting={meeting} />
            ))}
        </div>
      </section>
    </div>
  );
}

function MeetingHistoryRow({ meeting }: { meeting: MeetingListItem }) {
  const duration = formatDuration(meeting.joined_at, meeting.ended_at);
  return (
    <Link
      to={meeting.recentTo}
      className="flex items-center gap-4 px-5 py-3 transition hover:opacity-80"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--ds-radius-control)"
        style={{ background: "var(--input-bg)" }}
      >
        <HiUserGroup className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <MeetingTitleLine teamsTitle={meeting.teamsTitle} title={meeting.title} />
        <p
          className="flex flex-wrap items-center gap-x-3 text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>終了: {formatFullDate(meeting.ended_at || meeting.updated_at)}</span>
          {duration && <span>所要 {duration}</span>}
          {meeting.organizerName && <span>主催: {meeting.organizerName}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--input-bg)", color: statusColor(meeting.status) }}
        >
          {formatStatus(meeting.status)}
        </span>
        <HiChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      </div>
    </Link>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-5 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}

// 履歴は過去の日付を扱うため、年まで含めて表示する。
function formatFullDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Bot参加〜終了までの所要時間。どちらかが欠けている場合は表示しない。
function formatDuration(joinedAt?: string, endedAt?: string) {
  if (!joinedAt || !endedAt) {
    return null;
  }
  const ms = Date.parse(endedAt) - Date.parse(joinedAt);
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return "1分未満";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0) {
    return rest > 0 ? `${hours}時間${rest}分` : `${hours}時間`;
  }
  return `${minutes}分`;
}

function statusColor(status: string) {
  if (isCompletedMeetingStatus(status)) {
    return "var(--success)";
  }
  if (status === "failed") {
    return "var(--danger)";
  }
  if (status === "stale" || status === "timeout") {
    return "var(--warning)";
  }
  return "var(--text-muted)";
}
