import { useMemo } from "react";

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
}: {
  segments: TranscriptSegment[];
  session: MeetingSessionDto;
  tree: TreeUpdatePayload | null;
  analysisItems: AnalysisItem[];
}) {
  const finalSegments = useMemo(
    () => transcriptSegmentsToMeetingSegments(session, segments),
    [segments, session],
  );
  const partials = useMemo(() => transcriptSegmentsToPartials(segments), [segments]);

  return (
    <MeetingWorkspaceGrid
      className="min-h-[560px] shrink-0 pb-1"
      partials={partials}
      segments={finalSegments}
      treeNodes={tree?.nodes ?? []}
      treeEdges={tree?.edges ?? []}
      insights={analysisItems}
    />
  );
}
