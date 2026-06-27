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
  const sidebarContentWidth =
    navigation.width + APP_SIDEBAR_SIZES.resizeHandleWidth;

  return (
    // min-w-0 を削除（子要素の width 指定を優先させるため）
    <aside className="ds-surface-elevated flex h-full flex-col overflow-hidden z-[999]">
      <AppSidebarHeader
        navigation={navigation}
        navigationWidth={navigation.width}
        width={sidebarContentWidth}
      />

      {/* 💡 変更点1: ここの div も flex-col にし、h-full (残り全高) を持たせる */}
      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        
        {/* 💡 変更点2: ナビゲーション部分を flex-1 にして、残りのスペースをすべて埋めるようにする */}
        <div className="min-w-0 flex-1 flex-col overflow-y-auto" style={{ width: navigation.width }}>
          <AppNavigation collapsed={navigation.collapsed} />
        </div>

        {/* 💡 変更点3: ユーザーメニューをナビゲーションの外に出す。
             これにより、ナビゲーションが flex-1 で広がった分、
             ユーザーメニューは自動的に画面下部に押し下げられる。 */}
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
