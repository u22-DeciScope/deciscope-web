import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";

import { listMeetings, type MeetingDto } from "~/api/meetings/meetingsApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import {
  workspaceMeetingPath,
  workspaceMeetingSummaryPath,
  workspacePath,
} from "~/routing/workspacePaths";

export default function Home() {
  const { today, user, workspaceId } = useAuthenticatedLayout();
  const displayName = user.displayName?.split(" ")[0] ?? "ゲスト";
  const [meetings, setMeetings] = useState<MeetingDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const newMeetingPath = workspacePath(workspaceId, "/meetings/new");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    listMeetings()
      .then((result) => {
        if (!active) {
          return;
        }
        setMeetings(result.meetings);
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
  }, []);

  const activeMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.status !== "ended").slice(0, 3),
    [meetings],
  );
  const recentMeetings = useMemo(
    () => meetings.filter((meeting) => meeting.status === "ended").slice(0, 5),
    [meetings],
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
          { label: "進行中の会議", value: String(activeMeetings.length), color: "var(--brand)" },
          {
            label: "完了済みレポート",
            value: String(recentMeetings.length),
            color: "var(--success)",
          },
          { label: "会議数", value: String(meetings.length), color: "var(--warning)" },
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
            <EmptyRow label="進行中の会議はまだありません。会議を作成するとテストデータ再生を開始できます。" />
          )}
          {!isLoading &&
            !error &&
            activeMeetings.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                to={workspaceMeetingPath(workspaceId, meeting.id)}
                actionLabel="開く"
              />
            ))}
        </div>
      </section>

      <section
        className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <SectionHeader title="最近のレポート" actionLabel="すべて" />
        <div>
          {!isLoading && !error && recentMeetings.length === 0 && (
            <EmptyRow label="完了済みの会議レポートはまだありません。" />
          )}
          {recentMeetings.map((meeting, index) => (
            <Link
              key={meeting.id}
              to={workspaceMeetingSummaryPath(workspaceId, meeting.id)}
              className="flex items-center gap-4 px-5 py-3 transition hover:opacity-80"
              style={
                index < recentMeetings.length - 1
                  ? { borderBottom: "1px solid var(--ds-border)" }
                  : {}
              }
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--ds-radius-control)"
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

function MeetingRow({
  actionLabel,
  meeting,
  to,
}: {
  actionLabel: string;
  meeting: MeetingDto;
  to: string;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="min-w-20">
        <p className="text-[13px] font-bold" style={{ color: "var(--text-main)" }}>
          {meeting.status}
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
          {meeting.id}
        </p>
      </div>
      <Link to={to}>
        <DsButton variant="secondary">{actionLabel}</DsButton>
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

function formatShortDate(value: string) {
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
