import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { HiArrowDownTray, HiShare } from "react-icons/hi2";

import {
  getWorkspaceMeetingSession,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import { getMeetingReport, getMeetingReportMarkdown } from "~/api/meetings/meetingReportsApi";
import { createMeetingJoinToken, getMeeting, type MeetingDto } from "~/api/meetings/meetingsApi";
import type { RuntimePartial } from "~/api/meetings/meetingRuntimeTypes";
import type { MeetingReportDto } from "~/api/meetings/meetingReportsApi";
import {
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";
import { DsButton } from "~/components/DsButton";
import { DiscussionTree } from "~/components/meeting/parts/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { MeetingSummaryMain } from "~/components/meeting/summary/MeetingSummaryMain";
import { MeetingSummarySidebar } from "~/components/meeting/summary/MeetingSummarySidebar";
import type { MeetingSummaryViewModel } from "~/components/meeting/summary/meetingSummaryTypes";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";

export default function MeetingSummary() {
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [meeting, setMeeting] = useState<MeetingDto | null>(null);
  const [session, setSession] = useState<MeetingSessionDto | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [report, setReport] = useState<MeetingReportDto | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let active = true;
    setError(null);
    setMeeting(null);
    setSession(null);
    setReport(null);
    setMarkdown("");
    setTranscriptSegments([]);
    if (id.startsWith("session_")) {
      Promise.all([
        getWorkspaceMeetingSession(workspaceId, id),
        fetchWorkspaceMeetingSessionTranscriptSegmentHistory(workspaceId, id, 300),
      ])
        .then(([sessionResult, transcriptResult]) => {
          if (!active) {
            return;
          }
          setSession(sessionResult);
          setTranscriptSegments(transcriptResult.segments);
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(cause instanceof Error ? cause.message : "会議記録を取得できませんでした。");
          }
        });
      return () => {
        active = false;
      };
    }

    Promise.all([getMeeting(id), getMeetingReport(id), getMeetingReportMarkdown(id)])
      .then(([meetingResult, reportResult, markdownResult]) => {
        if (!active) {
          return;
        }
        setMeeting(meetingResult);
        setReport(reportResult);
        setMarkdown(markdownResult);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "レポートを取得できませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [id, workspaceId]);

  const summary = useMemo(() => {
    if (session) {
      return summaryFromMeetingSession(session, transcriptSegments);
    }
    return summaryFromReport(meeting, report);
  }, [meeting, report, session, transcriptSegments]);

  async function shareReport() {
    if (!id) {
      return;
    }
    const token = await createMeetingJoinToken(id);
    setShareToken(token.token);
  }

  async function exportMarkdown() {
    const content = session
      ? transcriptMarkdown(session, transcriptSegments)
      : markdown || report?.content || "";
    if (!content) {
      return;
    }
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${session?.title ?? meeting?.title ?? "meeting-report"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const chrome = useMemo(
    () => ({
      header: {
        title: session
          ? getMeetingDisplayTitle(session, { component: "meeting-session-summary-header" })
          : (meeting?.title ?? "会議サマリー"),
        breadcrumbs: [
          { label: "ホーム", to: meetingsPath },
          {
            label: session
              ? getMeetingDisplayTitle(session, { component: "meeting-session-summary-crumb" })
              : (meeting?.title ?? "会議サマリー"),
          },
        ],
        actions: (
          <>
            {!session && (
              <DsButton variant="secondary" onClick={shareReport}>
                <HiShare className="h-3.5 w-3.5" />
                共有
              </DsButton>
            )}
            <DsButton variant="secondary" onClick={exportMarkdown}>
              <HiArrowDownTray className="h-3.5 w-3.5" />
              エクスポート
            </DsButton>
          </>
        ),
      },
      rightSidebar: <MeetingSummarySidebar summary={summary} />,
      rightSidebarClassName: "w-55",
    }),
    [meeting?.title, meetingsPath, session, summary],
  );
  useWorkspaceChrome(chrome);

  if (error) {
    return <StatusPanel message={error} />;
  }

  if (!session && !report) {
    return <StatusPanel message="レポートを読み込んでいます..." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
      {shareToken && (
        <div
          className="rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
        >
          共有トークン: <span className="font-mono">{shareToken}</span>
        </div>
      )}
      {session ? (
        <>
          <SessionSummaryHeader summary={summary} />
          {hasPreMeetingContext(session) && <PreMeetingContextPanel session={session} />}
          <SessionReviewWorkspace session={session} segments={transcriptSegments} />
        </>
      ) : (
        <>
          <MeetingSummaryMain meetingsPath={meetingsPath} summary={summary} />
          <section
            className="ds-surface min-h-60 overflow-auto rounded-(--ds-radius-panel) p-4"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
              Markdown レポート
            </h2>
            <pre
              className="whitespace-pre-wrap text-[12px] leading-5"
              style={{ color: "var(--text-sub)" }}
            >
              {markdown || report?.content}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}

function SessionSummaryHeader({ summary }: { summary: MeetingSummaryViewModel }) {
  return (
    <section
      className="grid shrink-0 gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
      aria-label="会議概要"
    >
      <div
        className="ds-surface rounded-(--ds-radius-panel) px-5 py-4"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{
              background: "var(--badge-decision-bg)",
              color: "var(--badge-decision-fg)",
            }}
          >
            {summary.statusLabel}
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {summary.dateRange}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1
            className="min-w-0 text-[18px] font-bold leading-7"
            style={{ color: "var(--text-main)" }}
          >
            {summary.title}
          </h1>
          <div className="shrink-0 text-right">
            <p className="text-[22px] font-bold" style={{ color: "var(--brand)" }}>
              {summary.duration}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              会議時間
            </p>
          </div>
        </div>
      </div>
      <div
        className="rounded-(--ds-radius-panel) px-5 py-4"
        style={{
          background: "var(--ai-quest-bg)",
          border: "1px solid var(--ai-quest-border)",
          boxShadow: "var(--ds-shadow)",
        }}
      >
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ai-quest-fg)" }}>
          AI サマリー
        </p>
        <p
          className="whitespace-pre-wrap text-[12px] leading-6"
          style={{ color: "var(--ai-quest-fg)" }}
        >
          {summary.aiSummary}
        </p>
      </div>
    </section>
  );
}

function PreMeetingContextPanel({ session }: { session: MeetingSessionDto }) {
  return (
    <section
      className="ds-surface shrink-0 rounded-(--ds-radius-panel) p-4"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
        会議前コンテキスト
      </h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {preMeetingContextItems(session).map((item) => (
          <div key={item.label}>
            <dt className="text-[11px] font-semibold text-(--text-muted)">{item.label}</dt>
            <dd
              className="mt-1 whitespace-pre-wrap text-[12px]"
              style={{ color: "var(--text-sub)" }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SessionReviewWorkspace({
  segments,
  session,
}: {
  segments: TranscriptSegment[];
  session: MeetingSessionDto;
}) {
  const finalSegments = useMemo(
    () => transcriptSegmentsToMeetingSegments(session, segments),
    [segments, session],
  );
  const partials = useMemo(() => transcriptSegmentsToPartials(segments), [segments]);

  return (
    <section className="grid min-h-[560px] shrink-0 gap-2 pb-1 lg:grid-cols-[minmax(250px,0.85fr)_minmax(420px,1.65fr)_minmax(280px,0.95fr)]">
      <MeetingChatPanel partials={partials} segments={finalSegments} />
      <DiscussionTree nodes={[]} edges={[]} />
      <MeetingAssistantPanel insights={[]} speakerSummaries={[]} />
    </section>
  );
}

function StatusPanel({ message }: { message: string }) {
  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) p-5 text-[13px]"
      style={{ boxShadow: "var(--ds-shadow)", color: "var(--text-sub)" }}
    >
      {message}
    </div>
  );
}

function summaryFromReport(
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

function summaryFromMeetingSession(
  session: MeetingSessionDto,
  segments: TranscriptSegment[],
): MeetingSummaryViewModel {
  return {
    title: getMeetingDisplayTitle(session, { component: "meeting-session-summary" }),
    statusLabel: formatStatus(session.status),
    dateRange: formatSessionRange(session),
    duration: sessionDuration(session),
    aiSummary: "AI分析は未接続です。文字起こしを会議記録として保存しています。",
    decisions: [],
    actions: [],
    participants: uniqueSpeakers(segments),
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

function transcriptSegmentsToMeetingSegments(
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

function transcriptSegmentsToPartials(segments: TranscriptSegment[]): RuntimePartial[] {
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

function transcriptSpeakerName(segment: TranscriptSegment) {
  return segment.speakerName || segment.speakerLabel || "話者不明";
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

function transcriptMarkdown(session: MeetingSessionDto, segments: TranscriptSegment[]) {
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

function hasPreMeetingContext(session: MeetingSessionDto) {
  return preMeetingContextItems(session).length > 0;
}

function preMeetingContextItems(session: MeetingSessionDto) {
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

function formatDate(value: string) {
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

function formatStatus(status: string) {
  switch (status) {
    case "loading":
      return "読み込み中";
    case "created":
      return "作成済み";
    case "started":
      return "進行中";
    case "ended":
      return "終了";
    case "requested":
      return "参加要求済み";
    case "pending_join":
      return "参加待機";
    case "command_sent":
      return "Bot参加命令済み";
    case "joining":
      return "Bot参加中";
    case "joined":
      return "Bot参加済み";
    case "active":
      return "進行中";
    case "recording":
      return "録音中";
    case "failed":
      return "失敗";
    case "stale":
      return "停止扱い";
    default:
      return status;
  }
}
