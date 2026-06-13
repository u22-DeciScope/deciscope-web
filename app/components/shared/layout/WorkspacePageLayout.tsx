import type { ReactNode } from "react";

import { WorkspaceHeader } from "~/components/shared/layout/WorkspaceHeader";
import { useWorkspaceChromeContext } from "~/components/shared/layout/WorkspaceChromeContext";

type WorkspacePageLayoutProps = {
  children: ReactNode;
};

export function WorkspacePageLayout({ children }: WorkspacePageLayoutProps) {
  const { chrome } = useWorkspaceChromeContext();
  const rightSidebarClassName = chrome.rightSidebarClassName ?? "w-72";

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-2 md:h-full md:overflow-hidden">
      <WorkspaceHeader {...chrome.header} />

      <div className="flex min-h-0 flex-1 gap-2">
        <main
          className="ds-surface min-w-0 flex-1 rounded-(--ds-radius-panel) p-2 md:overflow-hidden"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          {children}
        </main>

        {chrome.rightSidebar ? (
          <aside
            className={`ds-surface hidden shrink-0 overflow-hidden rounded-(--ds-radius-panel) p-2 lg:flex ${rightSidebarClassName}`}
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            {chrome.rightSidebar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
