import { useMemo } from "react";
import { HiArrowDownTray, HiShare } from "react-icons/hi2";

import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { meetingSummaryDemo } from "~/components/meeting/summary/meetingSummaryDemoData";
import { MeetingSummaryMain } from "~/components/meeting/summary/MeetingSummaryMain";
import { MeetingSummarySidebar } from "~/components/meeting/summary/MeetingSummarySidebar";

export default function MeetingSummary() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");

  const chrome = useMemo(
    () => ({
      header: {
        title: meetingSummaryDemo.title,
        breadcrumbs: [
          { label: "ホーム", to: meetingsPath },
          { label: meetingSummaryDemo.title },
        ],
        actions: (
          <>
            <DsButton variant="secondary">
              <HiShare className="h-3.5 w-3.5" />
              共有
            </DsButton>
            <DsButton variant="secondary">
              <HiArrowDownTray className="h-3.5 w-3.5" />
              エクスポート
            </DsButton>
          </>
        ),
      },
      rightSidebar: <MeetingSummarySidebar summary={meetingSummaryDemo} />,
      rightSidebarClassName: "w-55",
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  return <MeetingSummaryMain meetingsPath={meetingsPath} summary={meetingSummaryDemo} />;
}
