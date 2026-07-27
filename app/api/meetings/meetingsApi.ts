import { requestJson } from "~/api/core/apiClient";
import type { MeetingRealtimeEventDto } from "~/api/meetings/meetingEventsApi";

export type MeetingDto = {
  id: string;
  workspace_id: string;
  title: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  ended_at?: string;
};

export async function getMeeting(meetingId: string) {
  return requestJson<MeetingDto>(`/v1/meetings/${encodeURIComponent(meetingId)}`);
}

export async function endMeeting(meetingId: string) {
  return requestJson<{ events: MeetingRealtimeEventDto[] }>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/end`,
    { method: "POST" },
  );
}
