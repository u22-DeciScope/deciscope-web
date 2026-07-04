import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { HiArrowDownTray, HiShare } from "react-icons/hi2";

import {
  getWorkspaceMeetingSessionAIAnalyses,
  type LiveAnalysisPayload,
  type MeetingAIAnalysis,
} from "~/api/aiAnalysis/aiAnalysisApi";
import {
  getWorkspaceMeetingSession,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import { listMeetingEvents } from "~/api/meetings/meetingEventsApi";
import { getMeetingReport, getMeetingReportMarkdown } from "~/api/meetings/meetingReportsApi";
import { createMeetingJoinToken, getMeeting, type MeetingDto } from "~/api/meetings/meetingsApi";
import {
  initialMeetingRuntimeState,
  meetingRuntimeReducer,
} from "~/api/meetings/meetingRuntimeReducer";
import type { AnalysisItem, TreeUpdatePayload } from "~/api/meetings/meetingRuntimeTypes";
import type { MeetingReportDto } from "~/api/meetings/meetingReportsApi";
import {
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { AiFinalSummaryPanel } from "~/components/meeting/summary/AiFinalSummaryPanel";
import { MeetingSummaryMain } from "~/components/meeting/summary/MeetingSummaryMain";
import { MeetingSummarySidebar } from "~/components/meeting/summary/MeetingSummarySidebar";
import { MarkdownReportPanel } from "~/components/meeting/summary/MarkdownReportPanel";
import { PreMeetingContextPanel } from "~/components/meeting/summary/PreMeetingContextPanel";
import { SessionReviewWorkspace } from "~/components/meeting/summary/SessionReviewWorkspace";
import { SessionSummaryHeader } from "~/components/meeting/summary/SessionSummaryHeader";
import { StatusPanel } from "~/components/meeting/summary/StatusPanel";
import {
  hasPreMeetingContext,
  summaryFromMeetingSession,
  summaryFromReport,
  transcriptMarkdown,
} from "~/components/meeting/summary/meetingSummaryViewModel";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

const finalAnalysisPollIntervalMs = 10_000;

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
  const [tree, setTree] = useState<TreeUpdatePayload | null>(null);
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);
  const [finalAnalysis, setFinalAnalysis] = useState<MeetingAIAnalysis | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<MeetingAIAnalysis | null>(null);
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
    setTree(null);
    setAnalysisItems([]);
    setFinalAnalysis(null);
    setLiveAnalysis(null);
    if (id.startsWith("session_")) {
      getWorkspaceMeetingSession(workspaceId, id)
        .then(async (sessionResult) => {
          if (!active) {
            return;
          }
          setSession(sessionResult);
          const [transcriptResult, analysis] = await Promise.all([
            fetchWorkspaceMeetingSessionTranscriptSegmentHistory(workspaceId, id, 300),
            loadMeetingAnalysis(sessionResult.meetingId),
          ]);
          if (!active) {
            return;
          }
          setTranscriptSegments(transcriptResult.segments);
          setTree(analysis.tree);
          setAnalysisItems(analysis.analysisItems);
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

  // 会議終了直後にこの画面へ遷移した場合、final分析はバックエンドでまだ running のことがある。
  // completed/failed になるまで10秒間隔でポーリングし、アンマウント/セッション切替で停止する。
  useEffect(() => {
    if (!id || !id.startsWith("session_")) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const analyses = await getWorkspaceMeetingSessionAIAnalyses(workspaceId, id as string);
        if (!active) {
          return;
        }
        setFinalAnalysis(analyses.final);
        setLiveAnalysis(analyses.live);
        if (analyses.final?.status === "running") {
          timer = setTimeout(() => void poll(), finalAnalysisPollIntervalMs);
        }
      } catch (cause) {
        if (!active) {
          return;
        }
        meetingStartDebug("meeting-summary-page", "ai final analysis load failed", {
          sessionId: id,
          message: cause instanceof Error ? cause.message : "unknown error",
        });
      }
    }

    void poll();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [id, workspaceId]);

  const summary = useMemo(() => {
    if (session) {
      return summaryFromMeetingSession(session, transcriptSegments, finalAnalysis);
    }
    return summaryFromReport(meeting, report);
  }, [finalAnalysis, meeting, report, session, transcriptSegments]);

  // 議論ツリー/分析カードは durable イベント(旧経路)を優先し、
  // 無ければライブ分析payloadのtree/itemsで補って終了後も閲覧できるようにする。
  const livePayload = (liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  const effectiveTree = tree?.nodes?.length ? tree : (livePayload?.tree ?? null);
  // resolved/dismissed の解消済みliveItemはカード表示から除外する(防御)。
  const effectiveAnalysisItems =
    analysisItems.length > 0
      ? analysisItems
      : (livePayload?.items ?? []).filter(
          (item) => item.status !== "dismissed" && item.status !== "resolved",
        );

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
          <AiFinalSummaryPanel final={finalAnalysis} currentTitle={summary.title} />
          {hasPreMeetingContext(session) && <PreMeetingContextPanel session={session} />}
          <SessionReviewWorkspace
            session={session}
            segments={transcriptSegments}
            tree={effectiveTree}
            analysisItems={effectiveAnalysisItems}
          />
        </>
      ) : (
        <>
          <MeetingSummaryMain meetingsPath={meetingsPath} summary={summary} />
          <MarkdownReportPanel content={markdown || report?.content || ""} />
        </>
      )}
    </div>
  );
}

// セッションに紐づく会議(meeting_id)の durable イベントを取得し、議論ツリーと分析カードへ整形する。
// meeting_id が無い、または取得に失敗した場合は空（従来どおりの表示）にフォールバックする。
async function loadMeetingAnalysis(
  meetingId?: string,
): Promise<{ tree: TreeUpdatePayload | null; analysisItems: AnalysisItem[] }> {
  const id = meetingId?.trim();
  if (!id) {
    return { tree: null, analysisItems: [] };
  }
  try {
    const { events } = await listMeetingEvents(id, 0);
    let state = initialMeetingRuntimeState;
    for (const event of events) {
      state = meetingRuntimeReducer(state, { type: "event", event });
    }
    return { tree: state.tree, analysisItems: state.analysisItems };
  } catch {
    return { tree: null, analysisItems: [] };
  }
}
