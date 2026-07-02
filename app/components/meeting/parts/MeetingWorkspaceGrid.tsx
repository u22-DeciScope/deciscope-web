import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type {
  AnalysisItem,
  RuntimePartial,
  RuntimeSpeakerSummary,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { DiscussionTree } from "~/components/meeting/parts/discussionTree/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";

type MeetingWorkspaceGridProps = {
  className?: string;
  partials: RuntimePartial[];
  segments: MeetingSegmentDto[];
  treeNodes: TreeNodePayload[];
  treeEdges: TreeEdgePayload[];
  insights: AnalysisItem[];
  speakerSummaries?: RuntimeSpeakerSummary[];
};

export function MeetingWorkspaceGrid({
  className,
  partials,
  segments,
  treeNodes,
  treeEdges,
  insights,
  speakerSummaries = [],
}: MeetingWorkspaceGridProps) {
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
      <DiscussionTree nodes={treeNodes} edges={treeEdges} />
      <MeetingAssistantPanel insights={insights} speakerSummaries={speakerSummaries} />
    </section>
  );
}
