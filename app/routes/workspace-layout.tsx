import { useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { AppMobileHeader } from "~/components/shared/navigation/AppMobileHeader";
import { AppMobileNavigation } from "~/components/shared/navigation/AppMobileNavigation";
import { AppSidebar } from "~/components/shared/navigation/AppSidebar";
import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";

const COLLAPSED_SIDEBAR_WIDTH = 68;
const DEFAULT_SIDEBAR_WIDTH = 220;
const RESIZE_HANDLE_WIDTH = 8;
const MAX_SIDEBAR_WIDTH = 360;
const COLLAPSED_THRESHOLD = 100;

export default function WorkspaceLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const { pathname } = useLocation();
  const { workspaceId } = useParams();
  const session = useAuthenticatedSession();

  if (!workspaceId) {
    return <WorkspaceStatus message="ワークスペースを特定できませんでした。" />;
  }

  if (session.status === "loading") {
    return <WorkspaceStatus message="認証状態を確認しています..." />;
  }

  if (session.status === "error") {
    return <WorkspaceStatus message={session.error?.message ?? "認証状態を確認できませんでした。"} />;
  }

  if (session.status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: pathname }} />;
  }

  if (!session.user) {
    return <WorkspaceStatus message="認証済みユーザーを取得できませんでした。" />;
  }

  const sidebarCollapsed = sidebarWidth <= COLLAPSED_THRESHOLD;

  return (
    <AuthenticatedLayoutProvider
      logout={session.handleLogout}
      today={session.today}
      user={session.user}
      workspaceId={workspaceId}
    >
      <main className="min-h-120 bg-(--ds-bg) md:flex md:h-[max(100dvh,480px)] md:overflow-hidden md:p-2.25">
        <section
          className="hidden md:flex md:shrink-0"
          style={{ width: sidebarWidth + RESIZE_HANDLE_WIDTH }}
        >
          <AppSidebar
            collapsed={sidebarCollapsed}
            className="flex"
            onCollapsedChange={(collapsed) =>
              setSidebarWidth(collapsed ? COLLAPSED_SIDEBAR_WIDTH : DEFAULT_SIDEBAR_WIDTH)
            }
          />
          <ResizeHandle
            max={MAX_SIDEBAR_WIDTH}
            min={COLLAPSED_SIDEBAR_WIDTH}
            value={sidebarWidth}
            onChange={setSidebarWidth}
            onReset={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          />
        </section>

        <section className="min-w-0 flex-1 md:overflow-hidden">
          <AppMobileHeader />
          <div className="p-2 pb-24 md:h-full md:overflow-hidden md:p-0">
            <Outlet />
          </div>
          <AppMobileNavigation />
        </section>
      </main>
    </AuthenticatedLayoutProvider>
  );
}

function WorkspaceStatus({ message }: { message: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-(--ds-bg) p-4 text-sm text-(--text-muted)">
      {message}
    </main>
  );
}
