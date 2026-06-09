import { BrandLogo } from "~/components/BrandLogo";
import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppSidebarSharedArea } from "~/components/shared/navigation/AppSidebarSharedArea";
import { AppUserMenu } from "~/components/shared/navigation/AppUserMenu";
import { HiChevronDoubleLeft, HiChevronDoubleRight } from "react-icons/hi2";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/lib/workspace";

type AppSidebarProps = {
  className?: string;
  navigationCollapsed: boolean;
  navigationWidth: number;
  navigationWidthMax: number;
  navigationWidthMin: number;
  onNavigationCollapsedChange: (collapsed: boolean) => void;
  onNavigationWidthChange: (width: number) => void;
  onNavigationWidthReset: () => void;
  onSharedAreaClose: () => void;
  onSharedAreaOpen: () => void;
  sharedAreaCollapsed: boolean;
};

export function AppSidebar({
  className = "",
  navigationCollapsed,
  navigationWidth,
  navigationWidthMax,
  navigationWidthMin,
  onNavigationCollapsedChange,
  onNavigationWidthChange,
  onNavigationWidthReset,
  onSharedAreaClose,
  onSharedAreaOpen,
  sharedAreaCollapsed,
}: AppSidebarProps) {
  const { workspaceId } = useAuthenticatedLayout();
  const CollapseIcon = navigationCollapsed ? HiChevronDoubleRight : HiChevronDoubleLeft;

  return (
    <aside
      className={`relative min-w-0 rounded-[14px] ${className}`}
    >
      <div
        className="absolute inset-0 rounded-[14px] bg-(--ds-surface)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      />

      <div className="relative z-10 flex min-w-0 shrink-0 flex-col" style={{ width: navigationWidth }}>
        <div
          className={`group relative flex h-[50px] shrink-0 items-center border-b ${
            navigationCollapsed ? "justify-center px-2" : "px-4"
          }`}
          style={{ borderColor: "var(--ds-border)" }}
        >
          <div className={navigationCollapsed ? "transition-opacity group-hover:opacity-0 group-focus-within:opacity-0" : ""}>
            <BrandLogo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} showText={!navigationCollapsed} />
          </div>
          <button
            type="button"
            onClick={() => onNavigationCollapsedChange(!navigationCollapsed)}
            className={`absolute flex h-7 w-7 items-center justify-center rounded-[7px] opacity-0 transition hover:opacity-70 focus-visible:opacity-100 group-hover:opacity-100 ${
              navigationCollapsed ? "inset-x-0 mx-auto" : "right-3"
            }`}
            aria-label={navigationCollapsed ? "ナビゲーションを展開" : "ナビゲーションを折りたたむ"}
            title={navigationCollapsed ? "ナビゲーションを展開" : "ナビゲーションを折りたたむ"}
            style={{ color: "var(--text-muted)", background: "var(--ds-surface-muted)" }}
          >
            <CollapseIcon className="h-4 w-4" />
          </button>
        </div>

        <AppNavigation collapsed={navigationCollapsed} />

        <AppUserMenu collapsed={navigationCollapsed} />
      </div>

      <ResizeHandle
        ariaLabel="ナビゲーションの幅を変更"
        max={navigationWidthMax}
        min={navigationWidthMin}
        value={navigationWidth}
        onChange={onNavigationWidthChange}
        onReset={onNavigationWidthReset}
      />

      <AppSidebarSharedArea
        collapsed={sharedAreaCollapsed}
        onClose={onSharedAreaClose}
        onOpen={onSharedAreaOpen}
      />
    </aside>
  );
}
