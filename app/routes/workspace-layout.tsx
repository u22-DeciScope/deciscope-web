import { useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { AppMobileHeader } from "~/components/shared/navigation/AppMobileHeader";
import { AppMobileNavigation } from "~/components/shared/navigation/AppMobileNavigation";
import { AppSidebar } from "~/components/shared/navigation/AppSidebar";
import type { AppNavigationItemId } from "~/components/shared/navigation/navigationItems";
import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { workspacePath } from "~/lib/workspace";

export default function WorkspaceLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const activeItem = activeNavigationItem(pathname, workspaceId);

  return (
    <AuthenticatedLayoutProvider today={session.today} user={session.user} workspaceId={workspaceId}>
      <section className="min-h-[50vh] bg-(--ds-bg) md:flex md:h-dvh md:gap-2 md:overflow-hidden md:p-2.25">
        <AppSidebar
          activeItem={activeItem}
          avatarLetter={session.avatarLetter}
          className="hidden md:flex"
          collapsed={sidebarCollapsed}
          displayEmail={session.displayEmail}
          displayName={session.displayName}
          photoUrl={session.user.photoURL}
          workspaceId={workspaceId}
          onCollapsedChange={setSidebarCollapsed}
          onLogout={session.handleLogout}
        />
        <AppMobileHeader
          avatarLetter={session.avatarLetter}
          photoUrl={session.user.photoURL}
          workspaceId={workspaceId}
        />
        <main className="min-w-0 p-2 pb-24 md:flex-1 md:overflow-hidden md:p-0">
          <Outlet />
        </main>
        <AppMobileNavigation activeItem={activeItem} workspaceId={workspaceId} />
      </section>
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

function activeNavigationItem(pathname: string, workspaceId: string): AppNavigationItemId {
  const meetingsPath = workspacePath(workspaceId, "/meetings");

  if (pathname.startsWith(`${meetingsPath}/`)) {
    return "meetings";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/team"))) {
    return "team";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/reports"))) {
    return "reports";
  }
  return "home";
}
