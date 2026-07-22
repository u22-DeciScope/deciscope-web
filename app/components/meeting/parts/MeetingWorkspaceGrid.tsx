import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";

import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type {
  AnalysisItem,
  RuntimePartial,
  RuntimeSpeakerSummary,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { AiUpdateStatusChip } from "~/components/meeting/parts/AiUpdateStatusChip";
import {
  DiscussionTree,
  type DiscussionTreeFocusRequest,
} from "~/components/meeting/parts/discussionTree/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import type {
  LiveAnalysisMeta,
  TranscriptSessionConnectionStatus,
} from "~/hooks/useMeetingTranscriptSession";

// タイムライン(左カラム)の開閉状態を会議中(タブを閉じるまで)維持するためのキー。
const TIMELINE_COLLAPSED_STORAGE_KEY = "deciscope.meeting.timelineCollapsed";

function readStoredTimelineCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(TIMELINE_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type MeetingWorkspaceGridProps = {
  className?: string;
  partials: RuntimePartial[];
  segments: MeetingSegmentDto[];
  treeNodes: TreeNodePayload[];
  treeEdges: TreeEdgePayload[];
  insights: AnalysisItem[];
  speakerSummaries?: RuntimeSpeakerSummary[];
  liveAnalysis?: MeetingAIAnalysis | null;
  liveAnalysisMeta?: LiveAnalysisMeta | null;
  // AIアシスタントのライブタブを表示するか。会議終了後のレビュー画面では false。
  showLiveTab?: boolean;
  // アジェンダ進捗セクションの状態行・操作可否向け。いずれもoptionalで、
  // workspaceId/sessionIdが無ければ操作UI(手動override)は非表示になる。
  connectionStatus?: TranscriptSessionConnectionStatus | null;
  canManageSessions?: boolean;
  workspaceId?: string;
  sessionId?: string;
};

export function MeetingWorkspaceGrid({
  className,
  partials,
  segments,
  treeNodes,
  treeEdges,
  insights,
  speakerSummaries = [],
  liveAnalysis,
  liveAnalysisMeta,
  showLiveTab = true,
  connectionStatus,
  canManageSessions = false,
  workspaceId = "",
  sessionId = "",
}: MeetingWorkspaceGridProps) {
  const [focusedAnalysisItemId, setFocusedAnalysisItemId] = useState<string | null>(null);
  const [highlightedAnalysisItemId, setHighlightedAnalysisItemId] = useState<string | null>(null);
  const [treeFocusRequest, setTreeFocusRequest] = useState<DiscussionTreeFocusRequest | null>(null);
  const [timelineCollapsed, setTimelineCollapsed] = useState<boolean>(() =>
    readStoredTimelineCollapsed(),
  );
  const highlightTimerRef = useRef<number | null>(null);
  const livePayload = (liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  const liveItems = useMemo(
    () => (livePayload?.items ?? []).filter((item) => item.status !== "dismissed"),
    [livePayload],
  );
  const relatedAnalysisItems = useMemo(
    () => mergeAnalysisItems(liveItems, insights),
    [insights, liveItems],
  );
  // AIアシスタントのカードクリック → 議論ツリーの該当ノードへフォーカス。
  // 同じカードを続けてクリックしても再フォーカスできるよう token を増やす。
  const handleFocusTreeItem = useCallback((itemId: string) => {
    if (!itemId) {
      return;
    }
    setTreeFocusRequest((current) => ({ itemId, token: (current?.token ?? 0) + 1 }));
  }, []);

  const handleSelectAnalysisItem = useCallback((itemId: string) => {
    if (!itemId) {
      return;
    }
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    setFocusedAnalysisItemId(null);
    setHighlightedAnalysisItemId(itemId);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setFocusedAnalysisItemId(itemId), 0);
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedAnalysisItemId(null);
      }, 1600);
    } else {
      setFocusedAnalysisItemId(itemId);
    }
  }, []);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  // 会議中は開閉状態を維持したいので localStorage に保存する。SSR/初回描画では
  // window が無いためガードする。
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(TIMELINE_COLLAPSED_STORAGE_KEY, timelineCollapsed ? "1" : "0");
    } catch {
      // プライベートモード等でlocalStorageが使えない場合は保存を諦める(致命的ではない)。
    }
  }, [timelineCollapsed]);

  return (
    <section
      className={[
        "grid gap-2 transition-[grid-template-columns] duration-200",
        timelineCollapsed
          ? "lg:grid-cols-[56px_minmax(420px,2.4fr)_minmax(280px,0.95fr)]"
          : "lg:grid-cols-[minmax(250px,0.85fr)_minmax(420px,1.65fr)_minmax(280px,0.95fr)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-h-0 min-w-0">
        {timelineCollapsed ? (
          <button
            type="button"
            className="flex h-full min-h-20 w-full flex-col items-center justify-start gap-2.5 rounded-(--ds-radius-panel) border py-3"
            style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
            onClick={() => setTimelineCollapsed(false)}
            aria-label="タイムラインを開く"
            title="タイムラインを開く"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
              style={{
                background: "var(--ds-surface-muted)",
                borderColor: "var(--ds-border)",
                color: "var(--text-sub)",
              }}
            >
              <HiChevronRight className="h-3.5 w-3.5" />
            </span>
            <span
              className="text-[10px] font-semibold tracking-widest [writing-mode:vertical-rl]"
              style={{ color: "var(--text-sub)" }}
            >
              タイムライン
            </span>
          </button>
        ) : (
          <div className="grid h-full min-h-0 min-w-0">
            <MeetingChatPanel
              partials={partials}
              segments={segments}
              headerAction={
                <button
                  type="button"
                  className="group relative ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-(--ds-radius-control) border"
                  style={{
                    background: "var(--ds-surface-muted)",
                    borderColor: "var(--ds-border)",
                    color: "var(--text-sub)",
                  }}
                  onClick={() => setTimelineCollapsed(true)}
                  aria-label="タイムラインを折りたたむ"
                >
                  <HiChevronLeft className="h-3.5 w-3.5" />
                  {/* ホバーして1秒後に出るラベル。パネルは角丸のためoverflow-hiddenで
                      上方向は切れてしまうので、ボタンの左横に表示する。 */}
                  <span
                    className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-1000"
                    style={{
                      background: "var(--ds-surface)",
                      borderColor: "var(--ds-border)",
                      color: "var(--text-sub)",
                    }}
                    aria-hidden="true"
                  >
                    たたむ
                  </span>
                </button>
              }
            />
          </div>
        )}
      </div>
      <DiscussionTree
        nodes={treeNodes}
        edges={treeEdges}
        analysisItems={relatedAnalysisItems}
        segments={segments}
        onSelectAnalysisItem={handleSelectAnalysisItem}
        updateStatus={liveAnalysisMeta ? <AiUpdateStatusChip meta={liveAnalysisMeta} /> : undefined}
        layoutSignal={timelineCollapsed}
        focusItemRequest={treeFocusRequest}
        treeChanges={livePayload?.treeChanges}
      />
      <MeetingAssistantPanel
        insights={insights}
        speakerSummaries={speakerSummaries}
        segments={segments}
        treeNodes={treeNodes}
        liveAnalysis={liveAnalysis}
        focusedAnalysisItemId={focusedAnalysisItemId}
        highlightedAnalysisItemId={highlightedAnalysisItemId}
        updateStatus={liveAnalysisMeta ? <AiUpdateStatusChip meta={liveAnalysisMeta} /> : undefined}
        showLiveTab={showLiveTab}
        onFocusTreeItem={handleFocusTreeItem}
        liveAnalysisMeta={liveAnalysisMeta}
        connectionStatus={connectionStatus}
        canManage={canManageSessions}
        workspaceId={workspaceId}
        sessionId={sessionId}
      />
    </section>
  );
}

function mergeAnalysisItems(primary: AnalysisItem[], secondary: AnalysisItem[]) {
  const merged: AnalysisItem[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    if (!item.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}
