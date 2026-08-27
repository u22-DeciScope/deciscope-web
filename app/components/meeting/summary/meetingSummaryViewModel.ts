import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingSummaryViewModel } from "~/components/meeting/summary/meetingSummaryTypes";
import { formatStatus } from "~/utils/meetingStatusLabels";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";

export function summaryFromMeetingSession(session: MeetingSessionDto): MeetingSummaryViewModel {
  return {
    title: getMeetingDisplayTitle(session),
    statusLabel: formatStatus(session.status),
    dateRange: formatSessionRange(session),
    duration: sessionDuration(session),
  };
}

function formatSessionRange(session: MeetingSessionDto) {
  const start = formatDate(session.joinedAt || session.requestedAt || session.createdAt || "");
  const end = formatDate(session.endedAt || session.updatedAt || "");
  return [start, end].filter(Boolean).join(" - ");
}

function sessionDuration(session: MeetingSessionDto) {
  const start = Date.parse(session.joinedAt || session.requestedAt || session.createdAt || "");
  const end = Date.parse(session.endedAt || session.updatedAt || "");
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return "記録中";
  }
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return `${minutes}分`;
}

export function hasPreMeetingContext(session: MeetingSessionDto) {
  return preMeetingContextItems(session).length > 0;
}

export function preMeetingContextItems(session: MeetingSessionDto) {
  // 現行の入室フォームは 目的・ゴール / 前提・背景 / アジェンダ / AIへの補足指示 の構成。
  // 決定したいこと・懸念点・期待するアウトプットは旧フォームの項目で、値が入っている
  // 過去の会議でだけ表示される(空はfilterで落ちる)。
  return [
    { label: "目的・ゴール", value: session.purpose },
    { label: "前提・背景", value: session.context },
    { label: "アジェンダ", value: session.agenda },
    { label: "決定したいこと", value: session.decisionPoints },
    { label: "懸念点", value: session.concerns },
    { label: "期待するアウトプット", value: session.expectedOutput },
    { label: "AIへの補足指示", value: session.customInstruction },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value?.trim()));
}

export function formatDate(value: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
