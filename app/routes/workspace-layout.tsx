import { Navigate, Outlet, useLocation, useParams } from "react-router";

import { AppMobileHeader } from "~/components/shared/navigation/AppMobileHeader";
import { AppMobileNavigation } from "~/components/shared/navigation/AppMobileNavigation";
import { AppSidebar } from "~/components/shared/navigation/AppSidebar";
import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";

export default function WorkspaceLayout() {
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

  return (
    <AuthenticatedLayoutProvider
      logout={session.handleLogout}
      today={session.today}
      user={session.user}
      workspaceId={workspaceId}
    >
      <section className="min-h-120 bg-(--ds-bg) md:flex md:h-[max(100dvh,480px)] md:gap-2 md:overflow-hidden md:p-2.25">
        <AppSidebar className="hidden md:flex" />
        <AppMobileHeader />
        <main className="min-w-0 p-2 pb-24 md:flex-1 md:overflow-hidden md:p-0">
          <Outlet />
        </main>
        <AppMobileNavigation />
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
