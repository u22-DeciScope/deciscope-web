import { useEffect, useMemo, useRef } from "react";

import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { RuntimePartial } from "~/api/meetings/meetingRuntimeTypes";

// 前の発言が終わってから次の発言が始まるまでの無音がこれ以下なら、短い間や
// 言いよどみとみなして同一話者の連続発言を1つのバブルにまとめる。Bot側のAzure Speech
// 無音タイムアウトは既知の問題を避けるため500〜800msに抑えているので、バブルの
// 体感間隔はここで調整する。
const finalBubbleGapThresholdMs = 3000;

type MeetingChatPanelProps = {
  partials: RuntimePartial[];
  segments: MeetingSegmentDto[];
  // ヘッダー右端に置く操作ボタン(タイムラインの折りたたみなど)。
  headerAction?: React.ReactNode;
};

type SegmentBubbleGroup = {
  key: string;
  speaker: string;
  speakerId?: string;
  speakerKey: string;
  text: string;
  time: string;
};

export function MeetingChatPanel({ partials, segments, headerAction }: MeetingChatPanelProps) {
  const visibleSegments = useMemo(
    () => segments.filter((segment) => segment.text.trim()),
    [segments],
  );
  const bubbleGroups = useMemo(() => groupSegmentsIntoBubbles(visibleSegments), [visibleSegments]);
  const visiblePartials = useMemo(
    () => partials.filter((partial) => (partial.text ?? "").trim()),
    [partials],
  );
  const itemCount = bubbleGroups.length + visiblePartials.length;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const timelineVersion = useMemo(
    () =>
      [
        bubbleGroups.length,
        bubbleGroups[bubbleGroups.length - 1]?.key ?? "",
        bubbleGroups[bubbleGroups.length - 1]?.text ?? "",
        visiblePartials.length,
        ...visiblePartials.map((partial) => `${partial.partial_id}:${partial.text ?? ""}`),
      ].join("|"),
    [bubbleGroups, visiblePartials],
  );

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [timelineVersion]);

  return (
    <section
      className="flex min-h-0 w-full flex-col overflow-hidden rounded-(--ds-radius-panel) border"
      style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
    >
      <header
        className="flex h-11 shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_4px_var(--brand-light)]"
          style={{ background: "var(--brand)" }}
        />
        <div className="ml-2 min-w-0 flex-1">
          <p className="text-[12px] font-bold" style={{ color: "var(--text-main)" }}>
            タイムライン
          </p>
        </div>
        <span
          className="rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ background: "var(--brand-light)", color: "var(--brand)" }}
        >
          {itemCount}
        </span>
        {headerAction}
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 py-3"
        onScroll={(event) => {
          shouldStickToBottomRef.current = isNearBottom(event.currentTarget);
        }}
      >
        {bubbleGroups.length === 0 && visiblePartials.length === 0 && <EmptyTranscript />}
        {bubbleGroups.map((group, index) => {
          const previous = bubbleGroups[index - 1];
          return (
            <TranscriptBubble
              key={group.key}
              sameSpeakerAsPrevious={previous ? previous.speakerKey === group.speakerKey : false}
              speaker={group.speaker}
              speakerId={group.speakerId}
              speakerKey={group.speakerKey}
              text={group.text}
              time={group.time}
            />
          );
        })}
        {visiblePartials.map((partial) => (
          <TranscriptBubble
            key={partial.partial_id}
            partial
            speaker={partial.speaker_label ?? "Speaker"}
            text={partial.text ?? ""}
            time={formatPartialTime(partial)}
          />
        ))}
      </div>
    </section>
  );
}

function TranscriptBubble({
  partial = false,
  sameSpeakerAsPrevious = false,
  speaker,
  speakerId,
  speakerKey,
  text,
  time,
}: {
  partial?: boolean;
  sameSpeakerAsPrevious?: boolean;
  speaker: string;
  speakerId?: string;
  speakerKey?: string;
  text: string;
  time: string;
}) {
  const speakerColor = speakerColorFor(speakerKey ?? speaker);

  return (
    <article>
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              background: `color-mix(in srgb, ${speakerColor} 14%, var(--ds-surface))`,
              border: `1px solid color-mix(in srgb, ${speakerColor} 42%, var(--ds-border))`,
              color: speakerColor,
            }}
            aria-hidden="true"
          >
            {speakerInitial(speaker)}
          </span>
          <p
            className="truncate text-[11px] font-bold"
            title={speakerId ? `${speaker} (${speakerId})` : speaker}
            style={{ color: speakerColor, opacity: sameSpeakerAsPrevious ? 0.58 : 1 }}
          >
            {speaker}
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
          {time}
        </p>
      </div>
      <p
        className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] leading-5"
        style={{
          background: partial
            ? "var(--input-bg)"
            : `color-mix(in srgb, ${speakerColor} 6%, var(--chat-other-bg))`,
          borderColor: partial
            ? speakerColor
            : `color-mix(in srgb, ${speakerColor} 28%, var(--chat-other-border))`,
          color: "var(--text-main)",
          opacity: partial ? 0.78 : 1,
        }}
      >
        {text || "..."}
      </p>
    </article>
  );
}

function EmptyTranscript() {
  return (
    <div
      className="rounded-(--ds-radius-control) border px-3 py-4 text-[12px]"
      style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
    >
      <p className="font-semibold" style={{ color: "var(--text-main)" }}>
        まだ発言はありません
      </p>
      <p className="mt-1 leading-5" style={{ color: "var(--text-muted)" }}>
        会議の音声が届くと、ここに文字起こしが流れます。
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

function formatSegmentTime(segment: MeetingSegmentDto) {
  const timestamp = Date.parse(segment.created_at);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  return formatDuration(segment.start_ms);
}

function formatPartialTime(partial: RuntimePartial) {
  if (partial.ts_ms > 0) {
    return new Date(partial.ts_ms).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  return formatDuration(partial.start_ms ?? 0);
}

function groupSegmentsIntoBubbles(segments: MeetingSegmentDto[]): SegmentBubbleGroup[] {
  const groups: SegmentBubbleGroup[] = [];
  let lastRecognizedAtMs: number | null = null;

  for (const segment of segments) {
    const speakerKey = segmentSpeakerKey(segment);
    const recognizedAtMs = Date.parse(segment.created_at);
    // recognizedAtUtc は「発言が確定した時刻」であり、発言自体の長さぶん遅れて届く。
    // そのため確定時刻同士の差をそのまま間隔として使うと、次の発言が長いほど
    // 実際の無音時間より過大に見積もってしまう。次の発言の長さ(duration)を差し引くことで、
    // 「前の発言が終わってから次の発言が始まるまでの無音時間」を求める。
    const durationMs = Math.max(0, segment.end_ms - segment.start_ms);
    const gapMs =
      lastRecognizedAtMs !== null && !Number.isNaN(recognizedAtMs)
        ? recognizedAtMs - lastRecognizedAtMs - durationMs
        : null;
    const current = groups[groups.length - 1];

    if (
      current &&
      current.speakerKey === speakerKey &&
      gapMs !== null &&
      gapMs <= finalBubbleGapThresholdMs
    ) {
      current.text = `${current.text}${segment.text}`;
    } else {
      groups.push({
        key: segment.segment_id,
        speaker: segmentSpeakerName(segment),
        speakerId: segment.speaker_id,
        speakerKey,
        text: segment.text,
        time: formatSegmentTime(segment),
      });
    }

    if (!Number.isNaN(recognizedAtMs)) {
      lastRecognizedAtMs = recognizedAtMs;
    }
  }

  return groups;
}

function segmentSpeakerName(segment: MeetingSegmentDto) {
  const speakerName = segment.speaker_name?.trim();
  if (speakerName) {
    return speakerName;
  }
  const speakerLabel = segment.speaker_label?.trim();
  if (speakerLabel) {
    return speakerLabel;
  }
  const speakerId = segment.speaker_id?.trim();
  if (speakerId) {
    return `話者 ${compactSpeakerId(speakerId)}`;
  }
  return "話者不明";
}

function segmentSpeakerKey(segment: MeetingSegmentDto) {
  return (
    segment.speaker_id?.trim() ||
    segment.speaker_name?.trim() ||
    segment.speaker_label?.trim() ||
    "unknown"
  );
}

function compactSpeakerId(speakerId: string) {
  if (speakerId.length <= 24) {
    return speakerId;
  }
  const lastPart = speakerId.split(":").filter(Boolean).at(-1);
  if (lastPart && lastPart.length <= 24) {
    return lastPart;
  }
  return `${speakerId.slice(0, 21)}...`;
}

function isNearBottom(element: HTMLElement) {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= 40;
}

const speakerColors = [
  "#2563eb",
  "#0f766e",
  "#9333ea",
  "#c2410c",
  "#be123c",
  "#15803d",
  "#0369a1",
  "#a16207",
];

function speakerColorFor(speaker: string) {
  const normalized = speaker.trim() || "unknown";
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return speakerColors[hash % speakerColors.length];
}

function speakerInitial(speaker: string) {
  return speaker.trim().charAt(0).toUpperCase() || "?";
}
