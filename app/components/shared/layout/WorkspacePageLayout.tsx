import type { ReactNode } from "react";

type WorkspacePageLayoutProps = {
  children: ReactNode;
  header: ReactNode;
  rightSidebar?: ReactNode;
  rightSidebarClassName?: string;
};

export function WorkspacePageLayout({
  children,
  header,
  rightSidebar,
  rightSidebarClassName = "w-72",
}: WorkspacePageLayoutProps) {
  return (
    <div className="flex min-h-full min-w-0 flex-col gap-2 md:h-full md:overflow-hidden">
      <header
        className="ds-surface shrink-0 overflow-hidden rounded-[14px]"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        {header}
      </header>

      <div className="flex min-h-0 flex-1 gap-2">
        <main
          className="ds-surface min-w-0 flex-1 rounded-[14px] p-2 md:overflow-hidden"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          {children}
        </main>

        {rightSidebar ? (
          <aside
            className={`ds-surface hidden shrink-0 overflow-hidden rounded-[14px] p-2 lg:flex ${rightSidebarClassName}`}
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            {rightSidebar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
