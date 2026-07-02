import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { RuntimePartial } from "~/api/meetings/meetingRuntimeTypes";
import type { TranscriptSegment } from "~/api/transcripts/transcriptSegmentsApi";

export function transcriptSegmentsToMeetingSegments(
  session: MeetingSessionDto,
  segments: TranscriptSegment[],
): MeetingSegmentDto[] {
  const meetingId = session.meetingId || session.sessionId;
  return segments
    .filter((segment) => segment.isFinal && segment.text.trim())
    .map((segment, index) => {
      const startMs = transcriptOffsetMs(segment);
      const durationMs = ticksToMs(segment.durationTicks);
      return {
        meeting_id: meetingId,
        seq: transcriptSequence(segment, index),
        segment_id: transcriptSegmentId(segment, index),
        speaker_label: transcriptSpeakerName(segment),
        speaker_id: segment.speakerId ?? undefined,
        speaker_name: segment.speakerName ?? undefined,
        text: segment.text,
        start_ms: startMs,
        end_ms: durationMs > 0 ? startMs + durationMs : startMs,
        created_at: segment.recognizedAtUtc,
      };
    })
    .sort(compareMeetingSegments);
}

export function transcriptSegmentsToPartials(segments: TranscriptSegment[]): RuntimePartial[] {
  return segments
    .filter((segment) => !segment.isFinal && segment.text.trim())
    .map((segment, index) => ({
      partial_id: transcriptSegmentId(segment, index),
      speaker_label: transcriptSpeakerName(segment),
      text: segment.text,
      start_ms: transcriptOffsetMs(segment),
      ts_ms: transcriptTimestampMs(segment),
    }));
}

export function transcriptSpeakerName(segment: TranscriptSegment) {
  return segment.speakerName || segment.speakerLabel || "話者不明";
}

function compareMeetingSegments(first: MeetingSegmentDto, second: MeetingSegmentDto) {
  const firstTimestamp = Date.parse(first.created_at);
  const secondTimestamp = Date.parse(second.created_at);
  if (!Number.isNaN(firstTimestamp) && !Number.isNaN(secondTimestamp)) {
    if (firstTimestamp !== secondTimestamp) {
      return firstTimestamp - secondTimestamp;
    }
  }
  return first.seq - second.seq;
}

function transcriptSegmentId(segment: TranscriptSegment, index: number) {
  return (
    segment.eventId ||
    `${segment.sessionId || segment.callId || "transcript"}:${segment.sequenceNo || index}`
  );
}

function transcriptSequence(segment: TranscriptSegment, index: number) {
  return Number.isFinite(segment.sequenceNo) ? segment.sequenceNo : index + 1;
}

function transcriptOffsetMs(segment: TranscriptSegment) {
  return ticksToMs(segment.offsetTicks);
}

function transcriptTimestampMs(segment: TranscriptSegment) {
  const timestamp = Date.parse(segment.recognizedAtUtc);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function ticksToMs(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value / 10000));
}
