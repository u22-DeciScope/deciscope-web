import { ResizeHandle } from "~/components/shared/layout/ResizeHandle";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppSidebarHeader } from "~/components/shared/navigation/AppSidebarHeader";
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
};

export function AppSidebar({ navigation }: AppSidebarProps) {
  const sidebarContentWidth = navigation.width + APP_SIDEBAR_SIZES.resizeHandleWidth;

  return (
    <aside className="ds-surface-elevated flex h-full flex-col overflow-hidden z-[999]">
      <AppSidebarHeader
        navigation={navigation}
        navigationWidth={navigation.width}
        width={sidebarContentWidth}
      />

      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        <div
          className="min-w-0 flex-1 flex-col overflow-y-auto"
          style={{ width: navigation.width }}
        >
          <AppNavigation collapsed={navigation.collapsed} />
        </div>

        <div className="min-w-0 flex-col pb-2" style={{ width: navigation.width }}>
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
      </div>
    </aside>
  );
}
