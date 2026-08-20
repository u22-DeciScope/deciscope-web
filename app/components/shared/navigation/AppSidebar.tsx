import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppSidebarHeader } from "~/components/shared/navigation/AppSidebarHeader";
import { AppUserMenu } from "~/components/shared/navigation/AppUserMenu";
import { APP_SIDEBAR_SIZES } from "~/components/shared/navigation/appSidebarSizes";

export { APP_SIDEBAR_SIZES };

type AppSidebarProps = {
  navigation: {
    collapsed: boolean;
    onWidthChange: (width: number) => void;
    onWidthReset: () => void;
    width: number;
  };
  mobile?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
};

export function AppSidebar({ mobile = false, navigation, onClose, onNavigate }: AppSidebarProps) {
  return (
    <aside className="ds-surface-elevated z-[999] flex h-full min-w-0 flex-col overflow-hidden">
      <AppSidebarHeader navigationWidth={navigation.width} onClose={onClose} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={`min-w-0 flex-1 flex-col overflow-y-auto ${mobile ? "w-full" : ""}`}
          style={mobile ? undefined : { width: navigation.width }}
        >
          <AppNavigation collapsed={navigation.collapsed} onNavigate={onNavigate} />
        </div>

        <div
          className={`min-w-0 flex-col pb-2 ${mobile ? "w-full" : ""}`}
          style={mobile ? undefined : { width: navigation.width }}
        >
          <AppUserMenu collapsed={navigation.collapsed} />
        </div>

        {!mobile ? (
          <ResizeHandle
            ariaLabel="メニューの幅を変更"
            max={APP_SIDEBAR_SIZES.maxNavigationWidth}
            min={APP_SIDEBAR_SIZES.collapsedPaneWidth}
            value={navigation.width}
            onChange={navigation.onWidthChange}
            onReset={navigation.onWidthReset}
          />
        ) : null}
      </div>
    </aside>
  );
}
