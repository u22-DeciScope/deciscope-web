import type { MeetingSummaryViewModel } from "./meetingSummaryTypes";

type MeetingSummarySidebarProps = {
  summary: MeetingSummaryViewModel;
};

export function MeetingSummarySidebar({ summary }: MeetingSummarySidebarProps) {
  const stats = [
    { label: "会議時間", value: summary.duration },
    { label: "決定事項", value: `${summary.decisions.length}件` },
    { label: "アクション", value: `${summary.actions.length}件` },
    { label: "参加者", value: `${summary.participants.length}名` },
  ];

  return (
    <div className="flex w-full flex-col gap-2 overflow-y-auto">
      <div
        className="ds-surface overflow-hidden rounded-[14px]"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <SidebarSectionHeader title="参加者" />
        <div className="flex flex-col gap-3 px-4 py-3">
          {summary.participants.map((participant) => (
            <div key={participant.name} className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                {participant.avatar}
              </div>
              <div className="min-w-0">
                <p
                  className="truncate text-[12px] font-medium"
                  style={{ color: "var(--text-main)" }}
                >
                  {participant.name}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {participant.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="ds-surface overflow-hidden rounded-[14px]"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <SidebarSectionHeader title="サマリー" />
        <div className="flex flex-col gap-3 px-4 py-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </span>
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarSectionHeader({ title }: { title: string }) {
  return (
    <div
      className="flex h-10 items-center border-b px-4"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <span className="mr-2 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
      <span className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
        {title}
      </span>
    </div>
  );
}
