import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";

export function mergeDisplaySegments(
  runtimeSegments: MeetingSegmentDto[],
  transcriptSegments: MeetingSegmentDto[],
) {
  const byId = new Map<string, MeetingSegmentDto>();
  for (const segment of runtimeSegments) {
    byId.set(segment.segment_id, segment);
  }
  for (const segment of transcriptSegments) {
    byId.set(segment.segment_id, segment);
  }
  return [...byId.values()].sort((a, b) => {
    const timeA = Date.parse(a.created_at);
    const timeB = Date.parse(b.created_at);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.seq - b.seq;
  });
}
