import { requestJson } from "~/api/core/apiClient";

export type MeetingSegmentDto = {
  meeting_id: string;
  seq: number;
  segment_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
  created_at: string;
};

export type MeetingRealtimeEventDto = {
  type: string;
  meeting_id: string;
  seq?: number;
  ts_ms: number;
  payload: Record<string, unknown>;
};

export async function listMeetingEvents(meetingId: string, afterSeq = 0) {
  const path = `/v1/meetings/${encodeURIComponent(meetingId)}/events?after_seq=${encodeURIComponent(String(afterSeq))}`;
  const result = await requestJson<{ events: MeetingRealtimeEventDto[] | null }>(path);
  return { events: Array.isArray(result.events) ? result.events : [] };
}

export async function listMeetingSegments(meetingId: string, afterSeq = 0) {
  const path = `/v1/meetings/${encodeURIComponent(meetingId)}/segments?after_seq=${encodeURIComponent(String(afterSeq))}`;
  const result = await requestJson<{ segments: MeetingSegmentDto[] | null }>(path);
  return { segments: Array.isArray(result.segments) ? result.segments : [] };
}
