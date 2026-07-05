import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { DiscussionTree } from "~/components/meeting/parts/discussionTree/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import type { LiveAnalysisMeta } from "~/hooks/useMeetingTranscriptSession";

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
}: MeetingWorkspaceGridProps) {
  const [focusedAnalysisItemId, setFocusedAnalysisItemId] = useState<string | null>(null);
  const [highlightedAnalysisItemId, setHighlightedAnalysisItemId] = useState<string | null>(null);
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

  return (
    <section
      className={[
        "grid gap-2 lg:grid-cols-[minmax(250px,0.85fr)_minmax(420px,1.65fr)_minmax(280px,0.95fr)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <MeetingChatPanel partials={partials} segments={segments} />
      <DiscussionTree
        nodes={treeNodes}
        edges={treeEdges}
        analysisItems={relatedAnalysisItems}
        onSelectAnalysisItem={handleSelectAnalysisItem}
        updateStatus={liveAnalysisMeta ? <AiUpdateStatusChip meta={liveAnalysisMeta} /> : undefined}
      />
      <MeetingAssistantPanel
        insights={insights}
        speakerSummaries={speakerSummaries}
        liveAnalysis={liveAnalysis}
        focusedAnalysisItemId={focusedAnalysisItemId}
        highlightedAnalysisItemId={highlightedAnalysisItemId}
        updateStatus={liveAnalysisMeta ? <AiUpdateStatusChip meta={liveAnalysisMeta} /> : undefined}
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
