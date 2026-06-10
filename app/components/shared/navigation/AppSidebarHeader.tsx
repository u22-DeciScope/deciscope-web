import { BrandLogo } from "~/components/BrandLogo";
import { AppSidebarToggleButton } from "~/components/shared/navigation/AppSidebarToggleButton";
import { APP_SIDEBAR_SIZES } from "~/components/shared/navigation/appSidebarSizes";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

const LOGO_TEXT_MIN_WIDTH = 156;

type AppSidebarHeaderProps = {
  navigation: {
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
  };
  width: number;
};

export function AppSidebarHeader({ navigation, width }: AppSidebarHeaderProps) {
  const { workspaceId } = useAuthenticatedLayout();
  const showLogoText = width >= LOGO_TEXT_MIN_WIDTH;
  const toggleLabel = navigation.collapsed ? "メニューを展開" : "メニューを折りたたむ";
  const logoFrameWidth = showLogoText ? width : APP_SIDEBAR_SIZES.collapsedPaneWidth;

  function handleToggle() {
    navigation.onCollapsedChange(!navigation.collapsed);
  }

  return (
    <header
      className="flex h-12.5 shrink-0 items-center border-b"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div
        className={`relative flex h-full min-w-0 items-center px-3 ${
          showLogoText ? "justify-start" : "justify-center"
        }`}
        style={{ width: logoFrameWidth }}
      >
        {showLogoText ? (
          <>
            <div className="min-w-0 overflow-hidden pr-12">
              <BrandLogo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} />
            </div>
            <AppSidebarToggleButton
              onClick={handleToggle}
              className="absolute right-2"
              flipped={navigation.collapsed}
              label={toggleLabel}
              variant="filled"
            />
          </>
        ) : (
          <div className="group relative flex h-7 w-7 items-center justify-center">
            <BrandLogo
              size="sm"
              linkTo={workspacePath(workspaceId, "/meetings")}
              showText={false}
            />
            <AppSidebarToggleButton
              onClick={handleToggle}
              className="absolute inset-0 opacity-0 hover:opacity-70 group-hover:opacity-100"
              flipped={navigation.collapsed}
              label={toggleLabel}
              variant="filled"
            />
          </div>
        )}
      </div>
    </header>
  );
}
