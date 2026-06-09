import { Logo } from "~/components/Logo";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppUserMenu } from "~/components/shared/navigation/AppUserMenu";
import type { AppNavigationItemId } from "~/components/shared/navigation/navigationItems";
import { HiChevronDoubleLeft, HiChevronDoubleRight } from "react-icons/hi2";
import { workspacePath } from "~/lib/workspace";

type AppSidebarProps = {
  activeItem: AppNavigationItemId;
  avatarLetter: string;
  className?: string;
  collapsed: boolean;
  displayEmail: string;
  displayName: string;
  photoUrl?: string | null;
  workspaceId: string;
  onCollapsedChange: (collapsed: boolean) => void;
  onLogout: () => void | Promise<void>;
};

export function AppSidebar({
  activeItem,
  avatarLetter,
  className = "",
  collapsed,
  displayEmail,
  displayName,
  photoUrl,
  workspaceId,
  onCollapsedChange,
  onLogout,
}: AppSidebarProps) {
  const CollapseIcon = collapsed ? HiChevronDoubleRight : HiChevronDoubleLeft;

  return (
    <aside
      className={`relative shrink-0 flex-col transition-[width] duration-200 ease-out ${
        collapsed ? "w-[68px]" : "w-[220px]"
      } ${className}`}
    >
      <div className="absolute inset-0 ds-surface rounded-[14px]" style={{ boxShadow: "var(--ds-shadow)" }} />

      <div
        className={`group relative z-10 flex h-[50px] shrink-0 items-center border-b ${
          collapsed ? "justify-center px-2" : "px-4"
        }`}
        style={{ borderColor: "var(--ds-border)" }}
      >
        <div className={collapsed ? "transition-opacity group-hover:opacity-0 group-focus-within:opacity-0" : ""}>
          <Logo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} showText={!collapsed} />
        </div>
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className={`absolute flex h-7 w-7 items-center justify-center rounded-[7px] opacity-0 transition hover:opacity-70 focus-visible:opacity-100 group-hover:opacity-100 ${
            collapsed ? "inset-x-0 mx-auto" : "right-3"
          }`}
          aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          title={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          style={{ color: "var(--text-muted)", background: "var(--ds-surface-muted)" }}
        >
          <CollapseIcon className="h-4 w-4" />
        </button>
      </div>

      <AppNavigation activeItem={activeItem} collapsed={collapsed} workspaceId={workspaceId} />
      <AppUserMenu
        avatarLetter={avatarLetter}
        collapsed={collapsed}
        displayEmail={displayEmail}
        displayName={displayName}
        photoUrl={photoUrl}
        onLogout={onLogout}
      />
    </aside>
  );
}
