import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router";
import { HiBars3 } from "react-icons/hi2";

import { AuthenticatedLayoutProvider } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { WorkspaceChromeProvider } from "~/components/shared/layout/WorkspaceChromeContext";
import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
import { WorkspaceStatus } from "~/components/shared/layout/WorkspaceStatus";
import { APP_SIDEBAR_SIZES, AppSidebar } from "~/components/shared/navigation/AppSidebar";
import { setCurrentWorkspace } from "~/api/auth/authApi";
import { saveLastWorkspaceId } from "~/routing/lastWorkspace";
import { BrandLogo } from "~/components/BrandLogo";
import { workspacePath } from "~/routing/workspacePaths";

const { collapsedPaneWidth, defaultNavigationWidth, collapseThreshold } = APP_SIDEBAR_SIZES;

export function AuthenticatedWorkspaceLayout() {
  const [navigationWidth, setNavigationWidth] = useState<number>(collapsedPaneWidth);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const { hash, pathname, search } = useLocation();
  const { workspaceId } = useParams();
  const session = useAuthenticatedSession();
  const workspace = session.session?.workspaces.find((item) => item.id === workspaceId);
  const currentPath = `${pathname}${search}${hash}`;
  const loginRedirectState = useMemo(() => ({ from: currentPath }), [currentPath]);

  useEffect(() => {
    if (workspaceId && workspace && session.session?.current_workspace_id !== workspaceId) {
      void setCurrentWorkspace(workspaceId);
    }
  }, [session.session?.current_workspace_id, workspace, workspaceId]);

  // 最後に開いたワークスペースをログイン後の遷移先ヒントとして保存する。
  useEffect(() => {
    if (workspaceId && workspace) {
      saveLastWorkspaceId(workspaceId);
    }
  }, [workspace, workspaceId]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavigationOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        mobileMenuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileNavigationOpen]);

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
  if (!workspace) {
    const memberWorkspaces = session.session?.workspaces ?? [];

    // 所属していないワークスペースへのURL直打ちはアクセス不可を明示する。
    // 所属0件のユーザーには作成導線を出す。
    return <WorkspaceAccessDenied hasWorkspaces={memberWorkspaces.length > 0} />;
  }

  const navigationCollapsed = navigationWidth <= collapseThreshold;
  const navigationPane = {
    collapsed: navigationCollapsed,
    onWidthChange: (width: number) =>
      setNavigationWidth(width <= collapseThreshold ? collapsedPaneWidth : width),
    onWidthReset: () => setNavigationWidth(defaultNavigationWidth),
    width: navigationWidth,
  };
  const mobileNavigationPane = {
    collapsed: false,
    onWidthChange: () => undefined,
    onWidthReset: () => undefined,
    width: APP_SIDEBAR_SIZES.maxNavigationWidth,
  };
  const closeMobileNavigation = () => setMobileNavigationOpen(false);

  return (
    <AuthenticatedLayoutProvider
      logout={session.handleLogout}
      today={session.today}
      user={session.user}
      workspace={workspace}
      workspaces={session.session?.workspaces ?? []}
      workspaceId={workspaceId}
    >
      <div className="min-h-dvh bg-(--ds-bg) md:flex md:h-[max(100dvh,480px)] md:gap-2 md:overflow-hidden md:p-2.25">
        <header className="ds-mobile-app-bar ds-surface sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 md:hidden">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--ds-radius-control) transition hover:bg-(--ds-surface-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
            aria-controls="mobile-workspace-navigation"
            aria-expanded={mobileNavigationOpen}
            aria-label="メニューを開く"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <HiBars3 className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 overflow-hidden">
            <BrandLogo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} />
          </div>
        </header>

        {mobileNavigationOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 h-full w-full bg-black/45 backdrop-blur-[2px]"
              aria-label="メニューを閉じる"
              onClick={closeMobileNavigation}
            />
            <section
              id="mobile-workspace-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="メインメニュー"
              className="ds-mobile-navigation absolute inset-y-0 left-0 w-[min(20rem,calc(100vw-3rem))] p-2"
            >
              <AppSidebar
                mobile
                navigation={mobileNavigationPane}
                onClose={closeMobileNavigation}
                onNavigate={closeMobileNavigation}
              />
            </section>
          </div>
        ) : null}

        <section className="hidden md:block md:shrink-0">
          <AppSidebar navigation={navigationPane} />
        </section>

        <section className="min-w-0 flex-1 md:overflow-hidden">
          <div className="p-2 sm:p-3 md:h-full md:overflow-hidden md:p-0">
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

function WorkspaceAccessDenied({ hasWorkspaces }: { hasWorkspaces: boolean }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-(--ds-bg) px-4">
      <div className="ds-surface flex w-full max-w-md flex-col items-center gap-3 rounded-(--ds-radius-panel) p-8 text-center">
        <p className="text-base font-bold">このワークスペースにアクセスできません</p>
        <p className="text-sm text-(--text-muted)">
          {hasWorkspaces
            ? "このワークスペースに所属していないか、ワークスペースが存在しません。"
            : "まだワークスペースに所属していません。まずはワークスペースを作成してください。"}
        </p>
        {hasWorkspaces ? (
          <Link className="text-sm text-(--brand) hover:underline" to="/workspaces">
            ワークスペース一覧へ
          </Link>
        ) : (
          <Link className="text-sm text-(--brand) hover:underline" to="/workspaces/new">
            ワークスペースを作成する
          </Link>
        )}
      </div>
    </div>
  );
}
