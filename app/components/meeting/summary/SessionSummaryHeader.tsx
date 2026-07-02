import type { MeetingSummaryViewModel } from "~/components/meeting/summary/meetingSummaryTypes";

export function SessionSummaryHeader({ summary }: { summary: MeetingSummaryViewModel }) {
  return (
    <section
      className="grid shrink-0 gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      aria-label="会議概要"
    >
      <div
        className="ds-surface rounded-(--ds-radius-panel) px-5 py-4"
        style={{ boxShadow: "var(--ds-shadow)" }}
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
      </div>
      <div
        className="rounded-(--ds-radius-panel) px-5 py-4"
        style={{
          background: "var(--ai-quest-bg)",
          border: "1px solid var(--ai-quest-border)",
          boxShadow: "var(--ds-shadow)",
        }}
      >
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ai-quest-fg)" }}>
          AI サマリー
        </p>
        <p
          className="whitespace-pre-wrap text-[12px] leading-6"
          style={{ color: "var(--ai-quest-fg)" }}
        >
          {summary.aiSummary}
        </p>
      </div>
    </section>
  );
}
