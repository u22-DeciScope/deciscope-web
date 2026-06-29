import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiCalendarDays, HiLink, HiUserGroup, HiVideoCamera } from "react-icons/hi2";

import {
  cancelBotForMeeting,
  getTeamsIntegrationStatus,
  listUpcomingTeamsMeetings,
  scheduleBotForMeeting,
  type TeamsIntegrationStatusDto,
  type TeamsUpcomingMeetingDto,
} from "~/api/teams/teamsIntegrationApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export default function UpcomingMeetingsPage() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const integrationPath = workspacePath(workspaceId, "/settings/integrations");
  const joinByUrlPath = workspacePath(workspaceId, "/meetings/new?source=teams");
  const [status, setStatus] = useState<TeamsIntegrationStatusDto | null>(null);
  const [meetings, setMeetings] = useState<TeamsUpcomingMeetingDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMeetingId, setPendingMeetingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chrome = useMemo(
    () => ({
      header: {
        title: "予定会議",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "予定会議" }],
        actions: (
          <Link to={joinByUrlPath}>
            <DsButton variant="secondary">
              <HiLink className="h-3.5 w-3.5" />
              会議リンクから招待
            </DsButton>
          </Link>
        ),
      },
    }),
    [joinByUrlPath, meetingsPath],
  );
  useWorkspaceChrome(chrome);

  const reload = useCallback(async () => {
    const currentStatus = await getTeamsIntegrationStatus();
    setStatus(currentStatus);
    if (!currentStatus.connected) {
      setMeetings([]);
      return;
    }
    const result = await listUpcomingTeamsMeetings();
    setMeetings(result.meetings);
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    reload()
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "予定会議を取得できませんでした。");
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
  }, [reload]);

  async function toggleBot(meeting: TeamsUpcomingMeetingDto) {
    setPendingMeetingId(meeting.id);
    setError(null);
    try {
      if (meeting.bot_status === "scheduled") {
        await cancelBotForMeeting(meeting.id);
      } else {
        await scheduleBotForMeeting(meeting.id);
      }
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bot の予約を変更できませんでした。");
    } finally {
      setPendingMeetingId(null);
    }
  }

  const connected = status?.connected ?? false;
  const scheduledCount = meetings.filter((meeting) => meeting.bot_status === "scheduled").length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:overflow-y-auto">
      {error && (
        <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
          {error}
        </p>
      )}

      {!isLoading && !connected && <NotConnectedCard integrationPath={integrationPath} />}

      {connected && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { label: "今後の会議", value: String(meetings.length), color: "var(--brand)" },
              { label: "Bot 参加予約", value: String(scheduledCount), color: "var(--success)" },
              {
                label: "接続テナント",
                value: status?.tenant_name ?? "-",
                color: "var(--text-main)",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="ds-surface rounded-(--ds-radius-panel) px-5 py-4"
                style={{ boxShadow: "var(--ds-shadow)" }}
              >
                <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {stat.label}
                </p>
                <span
                  className="block truncate text-[20px] font-bold leading-none"
                  style={{ color: stat.color }}
                >
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
                今後の会議
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
              {isLoading && <EmptyRow label="予定会議を読み込んでいます..." />}
              {!isLoading && meetings.length === 0 && (
                <EmptyRow label="今後の予定会議が見つかりませんでした。" />
              )}
              {!isLoading &&
                meetings.map((meeting) => (
                  <UpcomingMeetingRow
                    key={meeting.id}
                    meeting={meeting}
                    isPending={pendingMeetingId === meeting.id}
                    onToggleBot={() => toggleBot(meeting)}
                  />
                ))}
            </div>
          </section>

          <p className="px-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Bot
            は予約した会議の開始時刻に自動で参加をリクエストします。ロビーが有効な会議では、主催者が入室を許可するまで音声を取得しません。(現在はモック表示です)
          </p>
        </>
      )}
    </div>
  );
}

function NotConnectedCard({ integrationPath }: { integrationPath: string }) {
  return (
    <section
      className="ds-surface flex flex-col items-center gap-3 rounded-(--ds-radius-panel) px-5 py-12 text-center"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "var(--brand-light)" }}
      >
        <HiCalendarDays className="h-6 w-6" style={{ color: "var(--brand)" }} />
      </div>
      <div>
        <p className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
          Teams 連携が未接続です
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Microsoft アカウントを接続すると、予定された会議の一覧を表示し、Bot
          を参加させられるようになります。
        </p>
      </div>
      <Link to={integrationPath}>
        <DsButton>Teams 連携を設定する</DsButton>
      </Link>
    </section>
  );
}

function UpcomingMeetingRow({
  isPending,
  meeting,
  onToggleBot,
}: {
  isPending: boolean;
  meeting: TeamsUpcomingMeetingDto;
  onToggleBot: () => void;
}) {
  const scheduled = meeting.bot_status === "scheduled";
  return (
    <div className="flex items-center gap-4 px-5 py-3">
      <div className="min-w-24">
        <p className="text-[13px] font-bold" style={{ color: "var(--text-main)" }}>
          {formatDay(meeting.start_at)}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {formatTimeRange(meeting.start_at, meeting.end_at)}
        </p>
      </div>
      <div className="h-8 w-px" style={{ background: "var(--ds-border)" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" style={{ color: "var(--text-main)" }}>
          {meeting.subject}
        </p>
        <p
          className="flex items-center gap-2 truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>主催: {meeting.organizer}</span>
          <span className="inline-flex items-center gap-0.5">
            <HiUserGroup className="h-3 w-3" />
            {meeting.participant_count}名
          </span>
        </p>
      </div>
      {scheduled && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--tag-idea-bg)", color: "var(--success)" }}
        >
          <HiVideoCamera className="h-3 w-3" />
          Bot 予約済み
        </span>
      )}
      <DsButton
        type="button"
        variant={scheduled ? "secondary" : "primary"}
        disabled={isPending}
        onClick={onToggleBot}
      >
        {isPending ? "更新中..." : scheduled ? "予約を取消" : "Bot を招待"}
      </DsButton>
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

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const today = new Date();
  const target = new Date(date);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) {
    return "今日";
  }
  if (diffDays === 1) {
    return "明日";
  }
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });
}

function formatTimeRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "";
  }
  const format = (date: Date) =>
    date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return `${format(startDate)} - ${format(endDate)}`;
}
