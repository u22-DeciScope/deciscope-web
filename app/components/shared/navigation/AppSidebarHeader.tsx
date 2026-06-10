import { HiChevronDoubleLeft, HiChevronDoubleRight } from "react-icons/hi2";
import { BrandLogo } from "~/components/BrandLogo";
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
  const CollapseIcon = navigation.collapsed ? HiChevronDoubleRight : HiChevronDoubleLeft;
  const showLogoText = width >= LOGO_TEXT_MIN_WIDTH;
  const toggleLabel = navigation.collapsed ? "メニューを展開" : "メニューを折りたたむ";

  function handleToggle() {
    navigation.onCollapsedChange(!navigation.collapsed);
  }

  return (
    <header
      className="flex h-12.5 shrink-0 items-center border-b"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div className="relative flex h-full w-full min-w-0 items-center px-3">
        {showLogoText ? (
          <>
            <div className="min-w-0 overflow-hidden pr-12">
              <BrandLogo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} />
            </div>
            <button
              type="button"
              onClick={handleToggle}
              className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-(--ds-radius-control) transition hover:opacity-70 focus-visible:opacity-100"
              aria-label={toggleLabel}
              title={toggleLabel}
              style={{ color: "var(--text-muted)", background: "var(--ds-surface-muted)" }}
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="group relative ml-auto flex h-7 w-7 items-center justify-center">
            <BrandLogo
              size="sm"
              linkTo={workspacePath(workspaceId, "/meetings")}
              showText={false}
            />
            <button
              type="button"
              onClick={handleToggle}
              className="absolute inset-0 flex items-center justify-center rounded-(--ds-radius-control) opacity-0 transition hover:opacity-70 focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={toggleLabel}
              title={toggleLabel}
              style={{ color: "var(--text-muted)", background: "var(--ds-surface-muted)" }}
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
