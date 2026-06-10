import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppSidebarHeader } from "~/components/shared/navigation/AppSidebarHeader";
import { AppSidebarSharedArea } from "~/components/shared/navigation/AppSidebarSharedArea";
import { AppUserMenu } from "~/components/shared/navigation/AppUserMenu";
import { APP_SIDEBAR_SIZES } from "~/components/shared/navigation/appSidebarSizes";

export { APP_SIDEBAR_SIZES };

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
  return (
    <aside className="ds-surface-elevated flex h-full min-w-0 flex-col overflow-hidden">
      <AppSidebarHeader navigation={navigation} width={navigation.width} />

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
