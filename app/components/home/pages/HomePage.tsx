import { useMemo } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";

import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspaceMeetingPath, workspaceMeetingSummaryPath } from "~/routing/workspacePaths";

const upcomingMeetings = [
  {
    id: "1",
    title: "Q2 製品ロードマップ検討",
    time: "10:00",
    duration: "60分",
    participants: 5,
    tag: "製品",
  },
  {
    id: "2",
    title: "週次スプリントレビュー",
    time: "14:00",
    duration: "30分",
    participants: 8,
    tag: "開発",
  },
];

const recentMeetings = [
  {
    id: "3",
    title: "デザインシステム方針決定",
    date: "昨日",
    decisions: 4,
    actions: 7,
    participants: 4,
  },
  {
    id: "4",
    title: "採用戦略ブレインストーミング",
    date: "5月21日",
    decisions: 2,
    actions: 3,
    participants: 6,
  },
  {
    id: "5",
    title: "予算計画 FY2026",
    date: "5月19日",
    decisions: 6,
    actions: 12,
    participants: 3,
  },
];

export default function Home() {
  const { today, user, workspaceId } = useAuthenticatedLayout();
  const displayName = user.displayName?.split(" ")[0] ?? "ゲスト";

  const chrome = useMemo(
    () => ({
      header: {
        title: `おはようございます、${displayName}さん`,
        subtitle: today,
        actions: (
          <DsButton disabled title="会議作成画面は準備中です">
            <HiPlus className="h-3.5 w-3.5" />
            会議を開始
          </DsButton>
        ),
      },
    }),
    [displayName, today],
  );
  useWorkspaceChrome(chrome);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:overflow-y-auto">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: "今日の会議", value: "2", unit: "件", color: "var(--brand)" },
          { label: "今週の決定事項", value: "12", unit: "件", color: "var(--success)" },
          { label: "未完了アクション", value: "5", unit: "件", color: "var(--warning)" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="ds-surface rounded-(--ds-radius-panel) px-5 py-4"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {stat.label}
            </p>
            <div className="flex items-end gap-1">
              <span className="text-[26px] font-bold leading-none" style={{ color: stat.color }}>
                {stat.value}
              </span>
              <span className="mb-0.5 text-[12px]" style={{ color: "var(--text-sub)" }}>
                {stat.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div
          className="flex h-10 items-center border-b px-5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-(--brand)" />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
            今日の予定
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
          {upcomingMeetings.map((meeting) => (
            <div key={meeting.id} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-12 text-center">
                <p className="text-[14px] font-bold" style={{ color: "var(--text-main)" }}>
                  {meeting.time}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {meeting.duration}
                </p>
              </div>
              <div className="h-8 w-px" style={{ background: "var(--ds-border)" }} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--tag-topic-bg)", color: "var(--tag-topic-fg)" }}
                  >
                    {meeting.tag}
                  </span>
                </div>
                <p
                  className="truncate text-[13px] font-medium"
                  style={{ color: "var(--text-main)" }}
                >
                  {meeting.title}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {meeting.participants}名参加予定
                </p>
              </div>
              <Link to={workspaceMeetingPath(workspaceId, meeting.id)}>
                <DsButton variant="secondary">参加する</DsButton>
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div
        className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div
          className="flex h-10 items-center justify-between border-b px-5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <div className="flex items-center">
            <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-(--brand)" />
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
              最近の会議
            </span>
          </div>
          <button type="button" className="text-[11px] font-medium text-(--brand)">
            すべて見る
          </button>
        </div>
        <div>
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
                  {meeting.date} · {meeting.participants}名
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-center">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
                    {meeting.decisions}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    決定
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
                    {meeting.actions}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    アクション
                  </p>
                </div>
                <HiChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
