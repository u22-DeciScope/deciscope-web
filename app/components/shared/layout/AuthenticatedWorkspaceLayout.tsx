import { useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { WorkspaceChromeProvider } from "~/components/shared/layout/WorkspaceChromeContext";
import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
import { WorkspaceStatus } from "~/components/shared/layout/WorkspaceStatus";
import { APP_SIDEBAR_SIZES, AppSidebar } from "~/components/shared/navigation/AppSidebar";
import { setCurrentWorkspace } from "~/api/auth/authApi";
import { WORKSPACE_ROUTE_BASE } from "~/routing/workspacePaths";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

const { collapsedPaneWidth, defaultNavigationWidth, collapseThreshold } = APP_SIDEBAR_SIZES;

export function AuthenticatedWorkspaceLayout() {
  const [navigationWidth, setNavigationWidth] = useState<number>(collapsedPaneWidth);
  const { hash, pathname, search } = useLocation();
  const { workspaceId } = useParams();
  const session = useAuthenticatedSession();
  const workspace = session.session?.workspaces.find((item) => item.id === workspaceId);
  const loginRedirectState = useMemo(
    () => ({ from: `${pathname}${search}${hash}` }),
    [hash, pathname, search],
  );
  useEffect(() => {
    meetingStartDebug("auth-guard", "state", {
      authStatus: session.status,
      route: pathname,
      workspaceId: workspaceId ?? null,
    });
  }, [pathname, session.status, workspaceId]);

  useEffect(() => {
    if (workspaceId && workspace && session.session?.current_workspace_id !== workspaceId) {
      void setCurrentWorkspace(workspaceId);
    }
  }, [session.session?.current_workspace_id, workspace, workspaceId]);

  if (!workspaceId) {
    return <WorkspaceStatus message="ワークスペースを特定できませんでした。" />;
  }

  if (session.status === "loading") {
    meetingStartDebug("auth-guard", "redirect skipped because auth is loading", {
      route: pathname,
    });
    return <WorkspaceStatus message="認証状態を確認しています..." />;
  }

  if (session.status === "error") {
    return (
      <WorkspaceStatus message={session.error?.message ?? "認証状態を確認できませんでした。"} />
    );
  }

  if (session.status === "unauthenticated") {
    meetingStartDebug("auth-guard", "redirecting to login", {
      route: pathname,
      reason: "unauthenticated",
    });
    return <Navigate to="/login" replace state={loginRedirectState} />;
  }

  if (!session.user) {
    return <WorkspaceStatus message="認証済みユーザーを取得できませんでした。" />;
  }
  if (!workspace) {
    meetingStartDebug("auth-guard", "redirecting to workspace resolver", {
      route: pathname,
      reason: "workspace_not_found",
    });
    return <Navigate to={WORKSPACE_ROUTE_BASE} replace />;
  }

  const navigationCollapsed = navigationWidth <= collapseThreshold;
  const navigationPane = {
    collapsed: navigationCollapsed,
    onCollapsedChange: (collapsed: boolean) =>
      setNavigationWidth(collapsed ? collapsedPaneWidth : defaultNavigationWidth),
    onWidthChange: (width: number) =>
      setNavigationWidth(width <= collapseThreshold ? collapsedPaneWidth : width),
    onWidthReset: () => setNavigationWidth(defaultNavigationWidth),
    width: navigationWidth,
  };

  return (
    <AuthenticatedLayoutProvider
      logout={session.handleLogout}
      today={session.today}
      user={session.user}
      workspace={workspace}
      workspaces={session.session?.workspaces ?? []}
      workspaceId={workspaceId}
    >
      <div className="min-h-120 bg-(--ds-bg) md:flex md:h-[max(100dvh,480px)] md:overflow-hidden md:p-2.25">
        <section className="md:shrink-0">
          <AppSidebar navigation={navigationPane} />
        </section>

        <section className="min-w-0 flex-1 md:overflow-hidden">
          <div className="p-2 md:h-full md:overflow-hidden md:p-0">
            <WorkspaceChromeProvider>
              <WorkspacePageLayout>
                <Outlet />
              </WorkspacePageLayout>
            </WorkspaceChromeProvider>
          </div>
        </section>
      </div>
    </AuthenticatedLayoutProvider>
  );
}
