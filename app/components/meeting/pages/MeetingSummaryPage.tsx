import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";

import {
  getWorkspaceMeetingSessionAIAnalyses,
  retryWorkspaceMeetingSessionFinalization,
  type LiveAnalysisPayload,
  type MeetingAIAnalysis,
  type MeetingFinalizationAnalysis,
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
import {
  deriveFinalSummaryState,
  mergeFinalizationAnalysis,
} from "~/components/meeting/summary/finalSummaryState";
import { PreMeetingContextPanel } from "~/components/meeting/summary/PreMeetingContextPanel";
import { SessionReviewWorkspace } from "~/components/meeting/summary/SessionReviewWorkspace";
import { SessionSummaryHeader } from "~/components/meeting/summary/SessionSummaryHeader";
import { StatusPanel } from "~/components/meeting/summary/StatusPanel";
import { summaryAnalysisLastKnownGood } from "~/components/meeting/summary/summaryAnalysisLkg";
import {
  hasPreMeetingContext,
  summaryFromMeetingSession,
} from "~/components/meeting/summary/meetingSummaryViewModel";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { recordDiagnosticEvent } from "~/utils/clientDiagnostics/clientDiagnostics";

import { boundedRetryDelay } from "~/utils/boundedRetry";

const finalAnalysisPollIntervalMs = 10_000;
const finalAnalysisErrorRetryDelaysMs = [2000, 5000, 10000];
// 再生成要求から新しい finalization 行が現れるまでの短い確認窓。
const finalizationRetryConfirmIntervalMs = 1_000;
const finalizationRetryConfirmMaxAttempts = 10;

// バックエンドの finalization 状態が terminal になったらポーリングを止める。
// 「要約が無いから生成中」という推測は行わない(永久スピナーの原因になる)。
function finalizationInProgress(
  finalization: MeetingFinalizationAnalysis | null,
  final: MeetingAIAnalysis | null,
): boolean {
  if (finalization) {
    const status = finalization.payload.finalizationStatus;
    if (status === "completed" || status === "failed" || status === "incomplete") {
      return false;
    }
    return finalization.status === "running";
  }
  return final?.status === "running";
}

export default function MeetingSummary() {
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const cachedAnalysis = useMemo(
    () => (id ? summaryAnalysisLastKnownGood(id, workspaceId) : null),
    [id, workspaceId],
  );
  const [session, setSession] = useState<MeetingSessionDto | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [tree, setTree] = useState<TreeUpdatePayload | null>(() => cachedAnalysis?.tree ?? null);
  const [treeSnapshot, setTreeSnapshot] = useState<TreeSnapshotPayload | null>(
    () => cachedAnalysis?.treeSnapshot ?? null,
  );
  const [analysisItems, setAnalysisItems] = useState<AnalysisItem[]>(
    () => cachedAnalysis?.analysisItems ?? [],
  );
  const [finalAnalysis, setFinalAnalysis] = useState<MeetingAIAnalysis | null>(
    () => cachedAnalysis?.finalAnalysis ?? null,
  );
  const [finalAnalysisPending, setFinalAnalysisPending] = useState(true);
  const [finalization, setFinalization] = useState<MeetingFinalizationAnalysis | null>(null);
  const [retryInProgress, setRetryInProgress] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  // 再生成要求時点の finalization version。新しい試行の行が現れたかの判定に使う。
  const retryBaselineVersionRef = useRef<number | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<MeetingAIAnalysis | null>(
    () => cachedAnalysis?.liveAnalysis ?? null,
  );
  const [liveHistory, setLiveHistory] = useState<MeetingAIAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finalAnalysisError, setFinalAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let active = true;
    const cached = summaryAnalysisLastKnownGood(id, workspaceId);
    setError(null);
    setSession(null);
    setTranscriptSegments([]);
    setTree(cached.tree);
    setTreeSnapshot(cached.treeSnapshot);
    setAnalysisItems(cached.analysisItems);
    setFinalAnalysis(cached.finalAnalysis);
    setFinalAnalysisPending(true);
    setFinalization(null);
    setRetryInProgress(false);
    setRetryError(null);
    setLiveAnalysis(cached.liveAnalysis);
    setLiveHistory([]);
    setFinalAnalysisError(null);
    if (!id.startsWith("session_")) {
      // この画面は会議セッション(session_...)の記録だけを表示する。
      setError("会議記録が見つかりませんでした。");
      return;
    }
    if ((cached.tree?.nodes?.length ?? 0) > 0) {
      recordDiagnosticEvent("tree_render_recovery", {
        sessionId: id,
        workspaceId,
        treeVersion: cached.treeVersion,
        nodeCount: cached.tree?.nodes?.length ?? 0,
        rootNodeId: cached.tree?.nodes?.find((node) => !node.parentId)?.id ?? "",
        details: {
          reason: "summary_route_last_known_good_seed",
          recoveryAttempted: true,
          recoveryResult: "success",
          snapshotSource: cached.source,
        },
      });
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

  // 会議終了直後にこの画面へ遷移した場合、終了処理はまだ進行中のことがある。
  // バックエンドの finalization 状態が terminal になるまで10秒間隔でポーリングし、
  // アンマウント/セッション切替/再生成要求で作り直す。
  useEffect(() => {
    if (!id || !id.startsWith("session_")) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;
    let retryConfirmAttempts = 0;
    setFinalAnalysisPending(true);
    setFinalAnalysisError(null);

    async function poll() {
      try {
        const analyses = await getWorkspaceMeetingSessionAIAnalyses(workspaceId, id as string);
        if (!active) {
          return;
        }
        consecutiveErrors = 0;
        setFinalAnalysisError(null);
        setFinalAnalysis(analyses.final);
        setFinalization((current) =>
          mergeFinalizationAnalysis(current, analyses.finalization ?? null),
        );
        setLiveAnalysis(analyses.live);
        setLiveHistory(analyses.liveHistory);
        setTreeSnapshot(analyses.treeSnapshot);
        setFinalAnalysisPending(false);
        // 再生成を要求した直後は、新しい試行の行がまだ書かれていないことがある。
        // 古い terminal 状態を見てポーリングを止めると、実行中なのに失敗表示へ
        // 戻ってしまうため、versionが進むまで短間隔で確認する。
        const awaitingRetry =
          retryBaselineVersionRef.current !== null &&
          (analyses.finalization?.version ?? 0) <= retryBaselineVersionRef.current &&
          retryConfirmAttempts < finalizationRetryConfirmMaxAttempts;
        if (awaitingRetry) {
          retryConfirmAttempts += 1;
          timer = setTimeout(() => void poll(), finalizationRetryConfirmIntervalMs);
          return;
        }
        retryBaselineVersionRef.current = null;
        if (finalizationInProgress(analyses.finalization ?? null, analyses.final)) {
          timer = setTimeout(() => void poll(), finalAnalysisPollIntervalMs);
        } else {
          setRetryInProgress(false);
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
  }, [id, workspaceId, retryGeneration]);

  const summary = useMemo(() => (session ? summaryFromMeetingSession(session) : null), [session]);

  const finalSummaryState = useMemo(
    () =>
      deriveFinalSummaryState({
        ...(session ? { sessionStatus: session.status } : {}),
        finalization,
        final: finalAnalysis,
        loading: finalAnalysisPending,
      }),
    [session, finalization, finalAnalysis, finalAnalysisPending],
  );

  const retryFinalization = useCallback(async () => {
    if (!id) {
      return;
    }
    setRetryInProgress(true);
    setRetryError(null);
    retryBaselineVersionRef.current = finalization?.version ?? 0;
    try {
      const analyses = await retryWorkspaceMeetingSessionFinalization(workspaceId, id);
      setFinalization((current) =>
        mergeFinalizationAnalysis(current, analyses.finalization ?? null),
      );
      // ポーリングを作り直し、再生成の進行と結果をバックエンド状態から観測する。
      setRetryGeneration((generation) => generation + 1);
    } catch (cause) {
      retryBaselineVersionRef.current = null;
      setRetryInProgress(false);
      setRetryError(
        cause instanceof Error ? cause.message : "最終要約の再生成を開始できませんでした。",
      );
    }
  }, [id, workspaceId, finalization]);

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
          state={finalSummaryState}
          onRetry={() => void retryFinalization()}
          retryInProgress={retryInProgress}
          retryError={retryError}
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
