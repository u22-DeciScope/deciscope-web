import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import { preMeetingContextItems } from "~/components/meeting/summary/meetingSummaryViewModel";

export function PreMeetingContextPanel({ session }: { session: MeetingSessionDto }) {
  return (
    <section
      className="ds-surface shrink-0 rounded-(--ds-radius-panel) p-4"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
        会議前コンテキスト
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {preMeetingContextItems(session).map((item) => (
          <div key={item.label}>
            <dt className="text-[11px] font-semibold text-(--text-muted)">{item.label}</dt>
            <dd
              className="mt-1 whitespace-pre-wrap text-[12px]"
              style={{ color: "var(--text-sub)" }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
