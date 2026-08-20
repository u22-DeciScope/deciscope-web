import { BrandLogo } from "~/components/BrandLogo";
import { APP_SIDEBAR_SIZES } from "~/components/shared/navigation/appSidebarSizes";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { HiXMark } from "react-icons/hi2";

const LOGO_TEXT_MIN_WIDTH = 156;

type AppSidebarHeaderProps = {
  navigationWidth: number;
  onClose?: () => void;
};

export function AppSidebarHeader({ navigationWidth, onClose }: AppSidebarHeaderProps) {
  const { workspaceId } = useAuthenticatedLayout();
  const showLogoText = navigationWidth >= LOGO_TEXT_MIN_WIDTH;
  const logoFrameWidth = showLogoText ? navigationWidth : APP_SIDEBAR_SIZES.collapsedPaneWidth;

  return (
    <header
      className="flex h-12.5 items-center border-b"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div
        className={`flex h-full min-w-0 flex-1 items-center px-3 ${
          showLogoText ? "justify-start" : "justify-center"
        }`}
        style={{ width: logoFrameWidth }}
      >
        <div
          className={`flex h-full min-w-0 items-center px-3 ${
            showLogoText ? "justify-start" : "justify-center"
          }`}
        >
          {showLogoText ? (
            <div className="min-w-0 overflow-hidden pr-12">
              <BrandLogo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} />
            </div>
          ) : (
            <div className="group relative flex h-9 w-9 items-center justify-center">
              <BrandLogo
                size="md"
                linkTo={workspacePath(workspaceId, "/meetings")}
                showText={false}
              />
            </div>
          )}
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          autoFocus
          className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-(--ds-radius-control) transition hover:bg-(--ds-surface-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
          aria-label="メニューを閉じる"
          onClick={onClose}
        >
          <HiXMark className="h-5 w-5" />
        </button>
      ) : null}
    </header>
  );
}
