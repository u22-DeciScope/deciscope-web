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
    // グリッド自体の高さを固定し、各パネル(タイムライン/議論ツリー/AIアシスタント)
    // 内部のスクロールに任せる。高さは表示領域(main)いっぱいにしたいので、親である
    // /summary ページのスクロールコンテナに対する h-full を使う。パーセンテージ高さは
    // 親のcontent box基準で解決されるため、親のpadding分はここで引く必要がない。
    <MeetingWorkspaceGrid
      className="min-h-140 shrink-0 pb-1 lg:h-full"
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
