import { BrandLogo } from "~/components/BrandLogo";
import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppSidebarSharedArea } from "~/components/shared/navigation/AppSidebarSharedArea";
import { AppUserMenu } from "~/components/shared/navigation/AppUserMenu";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { HiChevronDoubleLeft, HiChevronDoubleRight } from "react-icons/hi2";

export const APP_SIDEBAR_SIZES = {
  collapsedPaneWidth: 52,
  defaultNavigationWidth: 180,
  maxNavigationWidth: 280,
  defaultSharedAreaWidth: 320,
  maxSharedAreaWidth: 400,
  collapseThreshold: 100,
  resizeHandleWidth: 8,
} as const;

type AppSidebarProps = {
  navigation: {
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    onWidthChange: (width: number) => void;
    onWidthReset: () => void;
    width: number;
  };
  sharedArea: {
    collapsed: boolean;
    onClose: () => void;
    onOpen: () => void;
    width: number;
  };
};

export function AppSidebar({ navigation, sharedArea }: AppSidebarProps) {
  const { workspaceId } = useAuthenticatedLayout();
  const CollapseIcon = navigation.collapsed ? HiChevronDoubleRight : HiChevronDoubleLeft;

  return (
    <aside className="ds-surface-elevated flex h-full min-w-0 flex-col overflow-hidden">
      <header
        className="flex h-12.5 shrink-0 items-center border-b"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <div
          className={`group relative flex h-full shrink-0 items-center ${
            navigation.collapsed ? "justify-center px-2" : "px-4"
          }`}
          style={{ width: navigation.width }}
        >
          <div
            className={
              navigation.collapsed
                ? "transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                : ""
            }
          >
            <BrandLogo
              size="sm"
              linkTo={workspacePath(workspaceId, "/meetings")}
              showText={!navigation.collapsed}
            />
          </div>
          <button
            type="button"
            onClick={() => navigation.onCollapsedChange(!navigation.collapsed)}
            className={`absolute flex h-7 w-7 items-center justify-center rounded-(--ds-radius-control) opacity-0 transition hover:opacity-70 focus-visible:opacity-100 group-hover:opacity-100 ${
              navigation.collapsed ? "inset-x-0 mx-auto" : "right-3"
            }`}
            aria-label={navigation.collapsed ? "メニューを展開" : "メニューを折りたたむ"}
            title={navigation.collapsed ? "メニューを展開" : "メニューを折りたたむ"}
            style={{ color: "var(--text-muted)", background: "var(--ds-surface-muted)" }}
          >
            <CollapseIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 shrink-0 flex-col" style={{ width: navigation.width }}>
          <AppNavigation collapsed={navigation.collapsed} />

          <AppUserMenu collapsed={navigation.collapsed} />
        </div>

        <ResizeHandle
          ariaLabel="メニューの幅を変更"
          max={APP_SIDEBAR_SIZES.maxNavigationWidth}
          min={APP_SIDEBAR_SIZES.collapsedPaneWidth}
          value={navigation.width}
          onChange={navigation.onWidthChange}
          onReset={navigation.onWidthReset}
        />

        <AppSidebarSharedArea
          collapsed={sharedArea.collapsed}
          onClose={sharedArea.onClose}
          onOpen={sharedArea.onOpen}
          width={sharedArea.width}
        />
      </div>
    </aside>
  );
}
