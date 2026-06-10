import { websocketBaseUrl } from "~/api/core/apiConfig";

export function meetingRealtimeUrl(meetingId: string, lastSeq = 0) {
  const url = new URL(`${websocketBaseUrl()}/v1/realtime`);
  url.searchParams.set("meeting_id", meetingId);
  url.searchParams.set("last_seq", String(lastSeq));
  return url.toString();
}

export function connectMeetingRealtime(meetingId: string, lastSeq = 0) {
  return new WebSocket(meetingRealtimeUrl(meetingId, lastSeq));
}
