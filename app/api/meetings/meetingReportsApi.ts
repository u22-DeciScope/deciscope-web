import { requestJson, requestText } from "~/api/core/apiClient";

export type MeetingReportDto = {
  artifact_id: string;
  meeting_id: string;
  format: string;
  content: string;
  created_at: string;
};

export async function getMeetingReport(meetingId: string) {
  return requestJson<MeetingReportDto>(`/v1/meetings/${encodeURIComponent(meetingId)}/report`);
}

export async function getMeetingReportMarkdown(meetingId: string) {
  return requestText(`/v1/meetings/${encodeURIComponent(meetingId)}/report`, {
    headers: { Accept: "text/markdown" },
  });
}
