import { requestJson } from "~/api/core/apiClient";
import type { MeetingRealtimeEventDto } from "~/api/meetings/meetingEventsApi";
import type { MeetingReportDto } from "~/api/meetings/meetingReportsApi";

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

export type MeetingJoinTokenDto = {
  token: string;
  token_type: string;
  expires_at: string;
};

export async function listMeetings(workspaceId: string) {
  return requestJson<{ meetings: MeetingDto[] }>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/meetings`,
  );
}

export async function createMeeting(workspaceId: string, title: string, source: string) {
  return requestJson<MeetingDto>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/meetings`, {
    method: "POST",
    body: JSON.stringify({ title, source }),
  });
}

export async function getMeeting(meetingId: string) {
  return requestJson<MeetingDto>(`/v1/meetings/${encodeURIComponent(meetingId)}`);
}

export async function createMeetingJoinToken(meetingId: string) {
  return requestJson<MeetingJoinTokenDto>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/join-token`,
    { method: "POST" },
  );
}

export async function endMeeting(meetingId: string) {
  return requestJson<{ report: MeetingReportDto; events: MeetingRealtimeEventDto[] }>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/end`,
    { method: "POST" },
  );
}
