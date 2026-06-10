import { Link } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";
import { DsButton } from "~/components/DsButton";
import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
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

  return (
    <WorkspacePageLayout
      header={
        <div
          className="ds-surface flex min-h-13 flex-wrap items-center justify-between gap-3 rounded-[14px] px-4 py-3 md:h-13 md:px-6 md:py-0"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <div>
            <p className="text-[15px] font-bold" style={{ color: "var(--text-main)" }}>
              おはようございます、{user?.displayName?.split(" ")[0] ?? "ゲスト"}さん
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {today}
            </p>
          </div>
          <DsButton disabled title="会議作成画面は準備中です">
            <HiPlus className="w-3.5 h-3.5" />
            会議を開始
          </DsButton>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 md:overflow-y-auto">
        {/* サマリー統計 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { label: "今日の会議", value: "2", unit: "件", color: "var(--brand)" },
            { label: "今週の決定事項", value: "12", unit: "件", color: "var(--success)" },
            { label: "未完了アクション", value: "5", unit: "件", color: "var(--warning)" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="ds-surface rounded-[14px] px-5 py-4"
              style={{ boxShadow: "var(--ds-shadow)" }}
            >
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </p>
              <div className="flex items-end gap-1">
                <span className="text-[26px] font-bold leading-none" style={{ color: stat.color }}>
                  {stat.value}
                </span>
                <span className="text-[12px] mb-0.5" style={{ color: "var(--text-sub)" }}>
                  {stat.unit}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 今日の予定 */}
        <div
          className="ds-surface rounded-[14px] overflow-hidden"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <div
            className="flex items-center h-[40px] px-5 border-b"
            style={{ borderColor: "var(--ds-border)" }}
          >
            <span
              className="w-[8px] h-[8px] rounded-full mr-2 shrink-0"
              style={{ background: "var(--brand)" }}
            />
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
              今日の予定
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
            {upcomingMeetings.map((meeting) => (
              <div key={meeting.id} className="flex items-center gap-4 px-5 py-3">
                <div className="text-center min-w-[48px]">
                  <p className="text-[14px] font-bold" style={{ color: "var(--text-main)" }}>
                    {meeting.time}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {meeting.duration}
                  </p>
                </div>
                <div className="w-px h-8" style={{ background: "var(--ds-border)" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "var(--tag-topic-bg)", color: "var(--tag-topic-fg)" }}
                    >
                      {meeting.tag}
                    </span>
                  </div>
                  <p
                    className="text-[13px] font-medium truncate"
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

        {/* 最近の会議 */}
        <div
          className="ds-surface rounded-[14px] overflow-hidden"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <div
            className="flex items-center justify-between h-[40px] px-5 border-b"
            style={{ borderColor: "var(--ds-border)" }}
          >
            <div className="flex items-center">
              <span
                className="w-[8px] h-[8px] rounded-full mr-2 shrink-0"
                style={{ background: "var(--brand)" }}
              />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
                最近の会議
              </span>
            </div>
            <button
              type="button"
              className="text-[11px] font-medium"
              style={{ color: "var(--brand)" }}
            >
              すべて見る
            </button>
          </div>
          <div>
            {recentMeetings.map((meeting, i) => (
              <Link
                key={meeting.id}
                to={workspaceMeetingSummaryPath(workspaceId, meeting.id)}
                className="flex items-center gap-4 px-5 py-3 transition hover:opacity-80"
                style={
                  i < recentMeetings.length - 1
                    ? { borderBottom: "1px solid var(--ds-border)" }
                    : {}
                }
              >
                <div
                  className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
                  style={{ background: "var(--input-bg)" }}
                >
                  <HiUserGroup className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--text-main)" }}
                  >
                    {meeting.title}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {meeting.date} · {meeting.participants}名
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
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
                  <HiChevronRight className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </WorkspacePageLayout>
  );
}
