import type { FinalSummaryPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingReportDto } from "~/api/meetings/meetingReportsApi";
import type { MeetingDto } from "~/api/meetings/meetingsApi";
import type { TranscriptSegment } from "~/api/transcripts/transcriptSegmentsApi";
import type {
  MeetingActionSummary,
  MeetingDecisionSummary,
  MeetingSummaryViewModel,
} from "~/components/meeting/summary/meetingSummaryTypes";
import { formatStatus } from "~/utils/meetingStatusLabels";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { transcriptSpeakerName } from "~/utils/transcriptSegmentView";

export function summaryFromReport(
  meeting: MeetingDto | null,
  report: MeetingReportDto | null,
): MeetingSummaryViewModel {
  return {
    title: meeting?.title ?? "会議サマリー",
    statusLabel: formatStatus(meeting?.status ?? "loading"),
    dateRange: formatRange(meeting),
    duration: "MVP0 再生",
    aiSummary:
      firstParagraph(report?.content) || "バックエンドイベントからレポートを生成しています。",
    decisions: [],
    actions: [],
    participants: [],
  };
}

export function summaryFromMeetingSession(
  session: MeetingSessionDto,
  segments: TranscriptSegment[],
  finalAnalysis?: MeetingAIAnalysis | null,
): MeetingSummaryViewModel {
  const base: MeetingSummaryViewModel = {
    title: getMeetingDisplayTitle(session, { component: "meeting-session-summary" }),
    statusLabel: formatStatus(session.status),
    dateRange: formatSessionRange(session),
    duration: sessionDuration(session),
    aiSummary: "AI分析は未接続です。文字起こしを会議記録として保存しています。",
    decisions: [],
    actions: [],
    participants: uniqueSpeakers(segments),
  };
  return summaryFromFinalAnalysis(base, finalAnalysis);
}

// final分析(会議終了後の要約)が completed かつ payload を持つ場合のみ、
// AIサマリー・決定事項・アクションアイテムをベースの summary に上書きマージする。
// running/failed/payload欠損時はベースの summary をそのまま返す(既存表示を維持)。
export function summaryFromFinalAnalysis(
  summary: MeetingSummaryViewModel,
  finalAnalysis?: MeetingAIAnalysis | null,
): MeetingSummaryViewModel {
  if (!finalAnalysis || finalAnalysis.status !== "completed") {
    return summary;
  }
  const payload = finalAnalysis.payload as FinalSummaryPayload | null;
  if (!payload) {
    return summary;
  }

  const overview = payload.overview?.trim();
  const decisions: MeetingDecisionSummary[] = payload.decisions.map((decision, index) => ({
    id: index + 1,
    text: decision.text,
    votes: "",
    level: decision.importance ?? "medium",
  }));
  const actions: MeetingActionSummary[] = payload.actionItems.map((action, index) => ({
    id: index + 1,
    text: action.text,
    owner: action.owner ?? "",
    due: action.due ?? "",
    done: false,
    priority: action.priority ?? "medium",
  }));

  return {
    ...summary,
    ...(overview ? { aiSummary: overview } : {}),
    ...(decisions.length > 0 ? { decisions } : {}),
    ...(actions.length > 0 ? { actions } : {}),
  };
}

function firstParagraph(content = "") {
  return content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#") && !part.startsWith("-"))
    ?.replace(/\n/g, " ");
}

function formatRange(meeting: MeetingDto | null) {
  if (!meeting) {
    return "";
  }
  const start = formatDate(meeting.created_at);
  const end = formatDate(meeting.ended_at || meeting.updated_at);
  return `${start} - ${end}`;
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

function uniqueSpeakers(segments: TranscriptSegment[]) {
  return [
    ...new Set(
      segments
        .map((segment) => segment.speakerName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ].map((name, index) => ({
    name,
    role: "参加者",
    avatar: String(index + 1),
  }));
}

export function transcriptMarkdown(session: MeetingSessionDto, segments: TranscriptSegment[]) {
  const title = getMeetingDisplayTitle(session, { component: "meeting-session-transcript-md" });
  const lines = [`# ${title}`, "", `status: ${session.status}`, ""];
  lines.push("## 文字起こし", "");
  if (segments.length === 0) {
    lines.push("文字起こしはまだ保存されていません。");
    return lines.join("\n");
  }
  for (const segment of segments) {
    const finalLabel = segment.isFinal ? "" : " (partial)";
    lines.push(
      `- ${formatDate(segment.recognizedAtUtc)} ${transcriptSpeakerName(segment)}${finalLabel}: ${segment.text}`,
    );
  }
  return lines.join("\n");
}

export function hasPreMeetingContext(session: MeetingSessionDto) {
  return preMeetingContextItems(session).length > 0;
}

export function preMeetingContextItems(session: MeetingSessionDto) {
  return [
    { label: "目的", value: session.purpose },
    { label: "前提・背景", value: session.context },
    { label: "アジェンダ", value: session.agenda },
    { label: "決定したいこと", value: session.decisionPoints },
    { label: "懸念点", value: session.concerns },
    { label: "期待するアウトプット", value: session.expectedOutput },
    { label: "補足指示", value: session.customInstruction },
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
