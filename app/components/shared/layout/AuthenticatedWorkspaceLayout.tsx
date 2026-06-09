import { useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { ResizeHandle } from "./ResizeHandle";
import { AppMobileHeader } from "../navigation/AppMobileHeader";
import { AppMobileNavigation } from "../navigation/AppMobileNavigation";
import { AppSidebar } from "../navigation/AppSidebar";

const COLLAPSED_PANE_WIDTH = 68;
const DEFAULT_NAVIGATION_WIDTH = 220;
const MAX_NAVIGATION_WIDTH = 220;
const DEFAULT_SHARED_AREA_WIDTH = 220;
const MAX_SHARED_AREA_WIDTH = 360;
const PANE_COLLAPSE_THRESHOLD = 100;
const RESIZE_HANDLE_WIDTH = 8;

export function AuthenticatedWorkspaceLayout() {
  const [navigationWidth, setNavigationWidth] = useState(COLLAPSED_PANE_WIDTH);
  const [sharedAreaWidth, setSharedAreaWidth] = useState(DEFAULT_SHARED_AREA_WIDTH);
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

  const navigationCollapsed = navigationWidth <= PANE_COLLAPSE_THRESHOLD;
  const sharedAreaCollapsed = sharedAreaWidth <= PANE_COLLAPSE_THRESHOLD;
  const sidebarWidth =
    navigationWidth + RESIZE_HANDLE_WIDTH + sharedAreaWidth + RESIZE_HANDLE_WIDTH;

  return (
    <AuthenticatedLayoutProvider
      logout={session.handleLogout}
      today={session.today}
      user={session.user}
      workspaceId={workspaceId}
    >
      <div className="min-h-120 bg-(--ds-bg) md:flex md:h-[max(100dvh,480px)] md:overflow-hidden md:p-2.25">
        <section
          className="hidden md:flex md:shrink-0"
          style={{ width: sidebarWidth }}
        >
          <AppSidebar
            className="flex h-full"
            navigationCollapsed={navigationCollapsed}
            navigationWidth={navigationWidth}
            navigationWidthMax={MAX_NAVIGATION_WIDTH}
            navigationWidthMin={COLLAPSED_PANE_WIDTH}
            onNavigationCollapsedChange={(collapsed) =>
              setNavigationWidth(
                collapsed ? COLLAPSED_PANE_WIDTH : DEFAULT_NAVIGATION_WIDTH,
              )
            }
            onNavigationWidthChange={(width) =>
              setNavigationWidth(
                width <= PANE_COLLAPSE_THRESHOLD
                  ? COLLAPSED_PANE_WIDTH
                  : width,
              )
            }
            onNavigationWidthReset={() => setNavigationWidth(DEFAULT_NAVIGATION_WIDTH)}
            onSharedAreaClose={() => setSharedAreaWidth(COLLAPSED_PANE_WIDTH)}
            onSharedAreaOpen={() => setSharedAreaWidth(DEFAULT_SHARED_AREA_WIDTH)}
            sharedAreaCollapsed={sharedAreaCollapsed}
            sharedAreaWidth={sharedAreaWidth}
          />
          <ResizeHandle
            ariaLabel="表示エリアの幅を変更"
            max={MAX_SHARED_AREA_WIDTH}
            min={COLLAPSED_PANE_WIDTH}
            value={sharedAreaWidth}
            onChange={(width) =>
              setSharedAreaWidth(
                width <= PANE_COLLAPSE_THRESHOLD
                  ? COLLAPSED_PANE_WIDTH
                  : width,
              )
            }
            onReset={() => setSharedAreaWidth(DEFAULT_SHARED_AREA_WIDTH)}
          />
        </section>

        <section className="min-w-0 flex-1 md:overflow-hidden">
          <AppMobileHeader />
          <div className="p-2 pb-24 md:h-full md:overflow-hidden md:p-0">
            <Outlet />
          </div>
          <AppMobileNavigation />
        </section>
      </div>
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
