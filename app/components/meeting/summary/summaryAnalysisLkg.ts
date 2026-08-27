import type {
  LiveAnalysisPayload,
  MeetingAIAnalysis,
  TreeSnapshotPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import type { AnalysisItem, TreeUpdatePayload } from "~/api/meetings/meetingRuntimeTypes";
import { getMeetingAnalysisSessionStore } from "~/hooks/meetingAnalysisSessionStore";
import { selectedAnalysisTree } from "~/hooks/meetingAnalysisState";

export type SummaryAnalysisLastKnownGood = {
  tree: TreeUpdatePayload | null;
  treeVersion: number | null;
  source: "live" | "final_snapshot" | null;
  treeSnapshot: TreeSnapshotPayload | null;
  analysisItems: AnalysisItem[];
  liveAnalysis: MeetingAIAnalysis | null;
  finalAnalysis: MeetingAIAnalysis | null;
};

// The live meeting route and summary route are two component trees, but they
// share one session-scoped analysis store. Reading that store synchronously
// prevents the summary route from committing an empty tree while REST hydrate
// is in flight.
export function summaryAnalysisLastKnownGood(
  sessionId: string,
  workspaceId: string,
): SummaryAnalysisLastKnownGood {
  const state = getMeetingAnalysisSessionStore(sessionId, workspaceId).getSnapshot();
  const selected = selectedAnalysisTree(state);
  const livePayload = (state.liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  return {
    tree: selected.tree ?? null,
    treeVersion: selected.treeVersion,
    source: selected.source,
    treeSnapshot: state.finalTreeSnapshot,
    analysisItems: (livePayload?.items ?? []).filter((item) => item.status !== "dismissed"),
    liveAnalysis: state.liveAnalysis,
    finalAnalysis: state.finalSummary,
  };
}
