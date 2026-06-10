import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { meetingSummaryDemo } from "~/components/meeting/summary/meetingSummaryDemoData";
import { MeetingSummaryHeader } from "~/components/meeting/summary/MeetingSummaryHeader";
import { MeetingSummaryMain } from "~/components/meeting/summary/MeetingSummaryMain";
import { MeetingSummarySidebar } from "~/components/meeting/summary/MeetingSummarySidebar";

export default function MeetingSummary() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");

  return (
    <WorkspacePageLayout
      header={<MeetingSummaryHeader meetingsPath={meetingsPath} title={meetingSummaryDemo.title} />}
      rightSidebar={<MeetingSummarySidebar summary={meetingSummaryDemo} />}
      rightSidebarClassName="w-55"
    >
      <MeetingSummaryMain meetingsPath={meetingsPath} summary={meetingSummaryDemo} />
    </WorkspacePageLayout>
  );
}
