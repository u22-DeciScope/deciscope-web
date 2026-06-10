import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { RuntimePartial } from "~/api/meetings/meetingRuntimeTypes";

type MeetingChatPanelProps = {
  partials: RuntimePartial[];
  segments: MeetingSegmentDto[];
};

export function MeetingChatPanel({ partials, segments }: MeetingChatPanelProps) {
  return (
    <section
      className="flex max-h-72 w-full shrink-0 flex-col overflow-hidden rounded-(--ds-radius-panel) xl:max-h-none xl:w-66"
      style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
    >
      <header
        className="flex h-10 shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: "var(--brand)" }}
        />
        <span className="ml-2 text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
          文字起こし
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {segments.length === 0 && partials.length === 0 && (
          <p className="px-2 py-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            テストデータ再生を開始すると文字起こしが流れます。
          </p>
        )}
        {segments.map((segment) => (
          <TranscriptBubble
            key={segment.segment_id}
            speaker={segment.speaker_label}
            text={segment.text}
            time={formatDuration(segment.start_ms)}
          />
        ))}
        {partials.map((partial) => (
          <TranscriptBubble
            key={partial.partial_id}
            partial
            speaker={partial.speaker_label ?? "Speaker"}
            text={partial.text ?? ""}
            time={formatDuration(partial.start_ms ?? 0)}
          />
        ))}
      </div>
    </section>
  );
}

function TranscriptBubble({
  partial = false,
  speaker,
  text,
  time,
}: {
  partial?: boolean;
  speaker: string;
  text: string;
  time: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 px-2">
        <p className="truncate text-[10px] font-semibold" style={{ color: "var(--text-sub)" }}>
          {speaker}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {time}
        </p>
      </div>
      <p
        className="rounded-(--ds-radius-panel) border px-2.5 py-2 text-[11px] leading-4"
        style={{
          background: partial ? "var(--input-bg)" : "var(--chat-other-bg)",
          borderColor: partial ? "var(--brand)" : "var(--chat-other-border)",
          color: "var(--text-main)",
          opacity: partial ? 0.78 : 1,
        }}
      >
        {text || "..."}
      </p>
    </div>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
