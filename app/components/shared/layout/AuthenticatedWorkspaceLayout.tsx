import { useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { ResizeHandle } from "./ResizeHandle";
import { AppMobileHeader } from "../navigation/AppMobileHeader";
import { AppMobileNavigation } from "../navigation/AppMobileNavigation";
import { AppSidebar } from "../navigation/AppSidebar";

const COLLAPSED_NAVIGATION_WIDTH = 68;
const DEFAULT_NAVIGATION_WIDTH = 220;
const MAX_NAVIGATION_WIDTH = 220;
const NAVIGATION_COLLAPSE_THRESHOLD = 100;
const DEFAULT_SHARED_AREA_WIDTH = 220;
const MAX_SHARED_AREA_WIDTH = 360;
const COLLAPSED_SHARED_AREA_WIDTH = 68;
const SHARED_AREA_COLLAPSE_THRESHOLD = 100;
const RESIZE_HANDLE_WIDTH = 8;

export function AuthenticatedWorkspaceLayout() {
  const [navigationWidth, setNavigationWidth] = useState(COLLAPSED_NAVIGATION_WIDTH);
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

  const navigationCollapsed = navigationWidth <= NAVIGATION_COLLAPSE_THRESHOLD;
  const sharedAreaCollapsed = sharedAreaWidth <= SHARED_AREA_COLLAPSE_THRESHOLD;
  const sidebarWidth =
    navigationWidth + RESIZE_HANDLE_WIDTH + sharedAreaWidth;

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
          style={{ width: sidebarWidth + RESIZE_HANDLE_WIDTH }}
        >
          <AppSidebar
            className="flex h-full"
            navigationCollapsed={navigationCollapsed}
            navigationWidth={navigationWidth}
            navigationWidthMax={MAX_NAVIGATION_WIDTH}
            navigationWidthMin={COLLAPSED_NAVIGATION_WIDTH}
            onNavigationCollapsedChange={(collapsed) =>
              setNavigationWidth(
                collapsed ? COLLAPSED_NAVIGATION_WIDTH : DEFAULT_NAVIGATION_WIDTH,
              )
            }
            onNavigationWidthChange={(width) =>
              setNavigationWidth(
                width <= NAVIGATION_COLLAPSE_THRESHOLD
                  ? COLLAPSED_NAVIGATION_WIDTH
                  : width,
              )
            }
            onNavigationWidthReset={() => setNavigationWidth(DEFAULT_NAVIGATION_WIDTH)}
            onSharedAreaClose={() => setSharedAreaWidth(COLLAPSED_SHARED_AREA_WIDTH)}
            onSharedAreaOpen={() => setSharedAreaWidth(DEFAULT_SHARED_AREA_WIDTH)}
            sharedAreaCollapsed={sharedAreaCollapsed}
          />
          <ResizeHandle
            ariaLabel="共有エリアの幅を変更"
            max={MAX_SHARED_AREA_WIDTH}
            min={COLLAPSED_SHARED_AREA_WIDTH}
            value={sharedAreaWidth}
            onChange={(width) =>
              setSharedAreaWidth(
                width <= SHARED_AREA_COLLAPSE_THRESHOLD
                  ? COLLAPSED_SHARED_AREA_WIDTH
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
