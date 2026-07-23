import { useMemo } from "react";

import type { MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import type { AnalysisItem, TreeUpdatePayload } from "~/api/meetings/meetingRuntimeTypes";
import type { TranscriptSegment } from "~/api/transcripts/transcriptSegmentsApi";
import { MeetingWorkspaceGrid } from "~/components/meeting/parts/MeetingWorkspaceGrid";
import {
  transcriptSegmentsToMeetingSegments,
  transcriptSegmentsToPartials,
} from "~/utils/transcriptSegmentView";

export function SessionReviewWorkspace({
  segments,
  session,
  tree,
  analysisItems,
  liveAnalysis,
  liveHistory,
  workspaceId,
  sessionId,
}: {
  segments: TranscriptSegment[];
  session: MeetingSessionDto;
  tree: TreeUpdatePayload | null;
  analysisItems: AnalysisItem[];
  liveAnalysis?: MeetingAIAnalysis | null;
  liveHistory?: MeetingAIAnalysis[];
  workspaceId?: string;
  sessionId?: string;
}) {
  const finalSegments = useMemo(
    () => transcriptSegmentsToMeetingSegments(session, segments),
    [segments, session],
  );
  const partials = useMemo(() => transcriptSegmentsToPartials(segments), [segments]);

  return (
    // タイムラインなど中身の高さでページ全体が無限に伸びないよう、lg以上では
    // グリッド自体を一定の高さ(ビューポート連動・上下限つき)に固定し、
    // 各パネル(タイムライン/議論ツリー/AIアシスタント)内部のスクロールに任せる。
    <MeetingWorkspaceGrid
      className="min-h-140 shrink-0 pb-1 lg:h-[clamp(560px,72vh,900px)]"
      partials={partials}
      segments={finalSegments}
      treeNodes={tree?.nodes ?? []}
      treeEdges={tree?.edges ?? []}
      insights={analysisItems}
      liveAnalysis={liveAnalysis}
      liveHistory={liveHistory}
      showLiveTab={true}
      showLiveUpdates={false}
      workspaceId={workspaceId}
      sessionId={sessionId}
    />
  );
}
