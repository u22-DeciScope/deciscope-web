import { useMemo, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { WorkspaceChromeProvider } from "~/components/shared/layout/WorkspaceChromeContext";
import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
import { WorkspaceStatus } from "~/components/shared/layout/WorkspaceStatus";
import { AppMobileNavigation } from "~/components/shared/navigation/AppMobileNavigation";
import { APP_SIDEBAR_SIZES, AppSidebar } from "~/components/shared/navigation/AppSidebar";

const {
  collapsedPaneWidth,
  defaultNavigationWidth,
  defaultSharedAreaWidth,
  maxSharedAreaWidth,
  collapseThreshold,
  resizeHandleWidth,
} = APP_SIDEBAR_SIZES;

export function AuthenticatedWorkspaceLayout() {
  const [navigationWidth, setNavigationWidth] = useState<number>(collapsedPaneWidth);
  const [sharedAreaWidth, setSharedAreaWidth] = useState<number>(defaultSharedAreaWidth);
  const { hash, pathname, search } = useLocation();
  const { workspaceId } = useParams();
  const session = useAuthenticatedSession();
  const loginRedirectState = useMemo(
    () => ({ from: `${pathname}${search}${hash}` }),
    [hash, pathname, search],
  );

  if (!workspaceId) {
    return <WorkspaceStatus message="ワークスペースを特定できませんでした。" />;
  }

  if (session.status === "loading") {
    return <WorkspaceStatus message="認証状態を確認しています..." />;
  }

  if (session.status === "error") {
    return (
      <WorkspaceStatus message={session.error?.message ?? "認証状態を確認できませんでした。"} />
    );
  }

  if (session.status === "unauthenticated") {
    return <Navigate to="/login" replace state={loginRedirectState} />;
  }

  if (!session.user) {
    return <WorkspaceStatus message="認証済みユーザーを取得できませんでした。" />;
  }

  const navigationCollapsed = navigationWidth <= collapseThreshold;
  const sharedAreaCollapsed = sharedAreaWidth <= collapseThreshold;
  const sidebarWidth = navigationWidth + resizeHandleWidth + sharedAreaWidth + resizeHandleWidth;
  const navigationPane = {
    collapsed: navigationCollapsed,
    onCollapsedChange: (collapsed: boolean) =>
      setNavigationWidth(collapsed ? collapsedPaneWidth : defaultNavigationWidth),
    onWidthChange: (width: number) =>
      setNavigationWidth(width <= collapseThreshold ? collapsedPaneWidth : width),
    onWidthReset: () => setNavigationWidth(defaultNavigationWidth),
    width: navigationWidth,
  };
  const sharedAreaPane = {
    collapsed: sharedAreaCollapsed,
    onClose: () => setSharedAreaWidth(collapsedPaneWidth),
    onOpen: () => setSharedAreaWidth(defaultSharedAreaWidth),
    width: sharedAreaWidth,
  };

  return (
    <AuthenticatedLayoutProvider
      logout={session.handleLogout}
      today={session.today}
      user={session.user}
      workspaceId={workspaceId}
    >
      <div className="min-h-120 bg-(--ds-bg) md:flex md:h-[max(100dvh,480px)] md:overflow-hidden md:p-2.25">
        <section className="hidden md:flex md:shrink-0" style={{ width: sidebarWidth }}>
          <AppSidebar navigation={navigationPane} sharedArea={sharedAreaPane} />
          <ResizeHandle
            ariaLabel="表示エリアの幅を変更"
            max={maxSharedAreaWidth}
            min={collapsedPaneWidth}
            value={sharedAreaWidth}
            onChange={(width) =>
              setSharedAreaWidth(width <= collapseThreshold ? collapsedPaneWidth : width)
            }
            onReset={() => setSharedAreaWidth(defaultSharedAreaWidth)}
          />
        </section>

        <section className="min-w-0 flex-1 md:overflow-hidden">
          <div className="p-2 pb-24 md:h-full md:overflow-hidden md:p-0">
            <WorkspaceChromeProvider>
              <WorkspacePageLayout>
                <Outlet />
              </WorkspacePageLayout>
            </WorkspaceChromeProvider>
          </div>
          <AppMobileNavigation />
        </section>
      </div>
    </AuthenticatedLayoutProvider>
  );
}
