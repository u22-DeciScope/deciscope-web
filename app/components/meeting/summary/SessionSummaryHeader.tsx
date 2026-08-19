import type { MeetingSummaryViewModel } from "~/components/meeting/summary/meetingSummaryTypes";

export function SessionSummaryHeader({ summary }: { summary: MeetingSummaryViewModel }) {
  return (
    <section
      className="ds-surface shrink-0 rounded-(--ds-radius-panel) border px-5 py-4"
      style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
      aria-label="会議概要"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{
            background: "var(--badge-decision-bg)",
            color: "var(--badge-decision-fg)",
          }}
        >
          {summary.statusLabel}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {summary.dateRange}
        </span>
      </div>
      <div className="flex items-start justify-between gap-4">
        <h1
          className="min-w-0 text-[18px] font-bold leading-7"
          style={{ color: "var(--text-main)" }}
        >
          {summary.title}
        </h1>
        <div className="shrink-0 text-right">
          <p className="text-[22px] font-bold" style={{ color: "var(--brand)" }}>
            {summary.duration}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            会議時間
          </p>
        </div>
      </div>
    </section>
  );
}
