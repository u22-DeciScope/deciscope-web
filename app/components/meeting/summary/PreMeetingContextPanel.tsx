import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import { preMeetingContextItems } from "~/components/meeting/summary/meetingSummaryViewModel";

// AI最終要約カード内の折りたたみに埋め込む前提のため、カード枠と見出しは持たない
// (見出しの役割は展開用のトグルボタンが兼ねる)。項目数が多くても縦に伸びすぎない
// よう、広い画面では2カラムに並べる。
export function PreMeetingContextPanel({ session }: { session: MeetingSessionDto }) {
  return (
    <dl className="grid gap-5 sm:grid-cols-2">
      {preMeetingContextItems(session).map((item) => (
        <div key={item.label}>
          <dt className="text-[11px] font-semibold text-(--text-muted)">{item.label}</dt>
          <dd
            className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed"
            style={{ color: "var(--text-sub)" }}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
