import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";

import {
  getWorkspaceMeetingSessionAIAnalyses,
  type LiveAnalysisPayload,
  type MeetingAIAnalysis,
  type TreeSnapshotPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import {
  getWorkspaceMeetingSession,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import { listMeetingEvents } from "~/api/meetings/meetingEventsApi";
import {
  initialMeetingRuntimeState,
  meetingRuntimeReducer,
} from "~/api/meetings/meetingRuntimeReducer";
import type { AnalysisItem, TreeUpdatePayload } from "~/api/meetings/meetingRuntimeTypes";
import {
  fetchWorkspaceMeetingSessionTranscriptSegmentHistory,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { AiFinalSummaryPanel } from "~/components/meeting/summary/AiFinalSummaryPanel";
import { PreMeetingContextPanel } from "~/components/meeting/summary/PreMeetingContextPanel";
import { SessionReviewWorkspace } from "~/components/meeting/summary/SessionReviewWorkspace";
import { SessionSummaryHeader } from "~/components/meeting/summary/SessionSummaryHeader";
import { StatusPanel } from "~/components/meeting/summary/StatusPanel";
import {
  hasPreMeetingContext,
  summaryFromMeetingSession,
} from "~/components/meeting/summary/meetingSummaryViewModel";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";

import { boundedRetryDelay } from "~/utils/boundedRetry";

const finalAnalysisPollIntervalMs = 10_000;
// final レコードがまだ作成されていない(final: null)場合の最大ポーリング回数。
// running になった後は打ち切らず、null が続く場合のみこの回数で諦める(約5分)。
const finalAnalysisMaxPendingAttempts = 30;
const finalAnalysisErrorRetryDelaysMs = [2000, 5000, 10000];

export default function MeetingSummary() {
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [session, setSession] = useState<MeetingSessionDto | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [tree, setTree] = useState<TreeUpdatePayload | null>(null);
  const [treeSnapshot, setTreeSnapshot] = useState<TreeSnapshotPayload | null>(null);
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>([]);
  const [finalAnalysis, setFinalAnalysis] = useState<MeetingAIAnalysis | null>(null);
  const [finalAnalysisPending, setFinalAnalysisPending] = useState(false);
  const [liveAnalysis, setLiveAnalysis] = useState<MeetingAIAnalysis | null>(null);
  const [liveHistory, setLiveHistory] = useState<MeetingAIAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finalAnalysisError, setFinalAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let active = true;
    setError(null);
    setSession(null);
    setTranscriptSegments([]);
    setTree(null);
    setTreeSnapshot(null);
    setAnalysisItems([]);
    setFinalAnalysis(null);
    setFinalAnalysisPending(false);
    setLiveAnalysis(null);
    setLiveHistory([]);
    setFinalAnalysisError(null);
    if (!id.startsWith("session_")) {
      // この画面は会議セッション(session_...)の記録だけを表示する。
      setError("会議記録が見つかりませんでした。");
      return;
    }
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
  }, [id, workspaceId]);

  // 会議終了直後にこの画面へ遷移した場合、final分析はバックエンドでまだ running のことがある。
  // completed/failed になるまで10秒間隔でポーリングし、アンマウント/セッション切替で停止する。
  useEffect(() => {
    if (!id || !id.startsWith("session_")) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let consecutiveErrors = 0;
    setFinalAnalysisPending(true);
    setFinalAnalysisError(null);

    async function poll() {
      attempt += 1;
      try {
        const analyses = await getWorkspaceMeetingSessionAIAnalyses(workspaceId, id as string);
        if (!active) {
          return;
        }
        consecutiveErrors = 0;
        setFinalAnalysisError(null);
        setFinalAnalysis(analyses.final);
        setLiveAnalysis(analyses.live);
        setLiveHistory(analyses.liveHistory);
        setTreeSnapshot(analyses.treeSnapshot);
        if (analyses.final?.status === "running") {
          // running の間は打ち切らず、完了/失敗になるまでポーリングし続ける。
          timer = setTimeout(() => void poll(), finalAnalysisPollIntervalMs);
        } else if (analyses.final === null && attempt < finalAnalysisMaxPendingAttempts) {
          // final レコードがまだ作成されていない。最大試行回数まではポーリングを継続する。
          timer = setTimeout(() => void poll(), finalAnalysisPollIntervalMs);
        } else {
          setFinalAnalysisPending(false);
        }
      } catch (cause) {
        if (!active) {
          return;
        }
        const delay = boundedRetryDelay(finalAnalysisErrorRetryDelaysMs, consecutiveErrors);
        consecutiveErrors += 1;
        if (delay !== null) {
          setFinalAnalysisError("AI分析の取得に一時的に失敗しました。再試行しています。");
          timer = setTimeout(() => void poll(), delay);
        } else {
          setFinalAnalysisPending(false);
          setFinalAnalysisError(
            "AI分析を取得できませんでした。時間をおいてページを再読み込みしてください。",
          );
        }
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

  const summary = useMemo(() => (session ? summaryFromMeetingSession(session) : null), [session]);

  // 議論ツリーは、会議終了時に保存されたdurableスナップショットを最優先し、
  // 無ければ durable イベント(旧経路)、最後にライブ分析payloadのtreeで補う。
  const livePayload = (liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  const effectiveTree = treeSnapshot?.tree?.nodes?.length
    ? treeSnapshot.tree
    : tree?.nodes?.length
      ? tree
      : (livePayload?.tree ?? null);
  // dismissed だけを除外し、resolved は解決済みカードとして残す。
  const effectiveAnalysisItems =
    analysisItems.length > 0
      ? analysisItems
      : (livePayload?.items ?? []).filter((item) => item.status !== "dismissed");
  const chrome = useMemo(
    () => ({
      header: {
        title: session ? getMeetingDisplayTitle(session) : "会議サマリー",
        breadcrumbs: [
          { label: "ホーム", to: meetingsPath },
          {
            label: session ? getMeetingDisplayTitle(session) : "会議サマリー",
          },
        ],
      },
      // /meetings と同じく、mainの白パネルを外して各カードを青背景の上に置く。
      fullBleedMain: true,
    }),
    [meetingsPath, session],
  );
  useWorkspaceChrome(chrome);

  if (error) {
    return <StatusPanel message={error} />;
  }

  if (!session || !summary) {
    return <StatusPanel message="会議記録を読み込んでいます..." />;
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto rounded-(--ds-radius-panel) p-3 sm:p-4"
      style={{ background: "var(--ds-bg)" }}
    >
      {finalAnalysisError && (
        <p
          className="ds-surface shrink-0 rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {finalAnalysisError}
        </p>
      )}
      {/* 1. ヘッダーエリア */}
      <div className="shrink-0">
        <SessionSummaryHeader summary={summary} />
      </div>

      {/* 2. AI最終要約(会議前コンテキストの折りたたみを含む)とサマリーカード */}
      <div className="shrink-0">
        <AiFinalSummaryPanel
          final={finalAnalysis}
          pending={finalAnalysisPending}
          contextPanel={
            hasPreMeetingContext(session) ? <PreMeetingContextPanel session={session} /> : undefined
          }
        />
      </div>

      {/* 3. 操作を行わない領域: 現状のまま完全に維持 */}
      <SessionReviewWorkspace
        session={session}
        segments={transcriptSegments}
        tree={effectiveTree}
        analysisItems={effectiveAnalysisItems}
        liveAnalysis={liveAnalysis}
        liveHistory={liveHistory}
        workspaceId={workspaceId}
        sessionId={id}
      />
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
