import { Logo } from "~/components/Logo";
import { AppNavigation } from "~/components/shared/navigation/AppNavigation";
import { AppUserMenu } from "~/components/shared/navigation/AppUserMenu";
import type { AppNavigationItemId } from "~/components/shared/navigation/navigationItems";

type AppSidebarProps = {
  activeItem: AppNavigationItemId;
  avatarLetter: string;
  displayEmail: string;
  displayName: string;
  photoUrl?: string | null;
  onLogout: () => void | Promise<void>;
};

export function AppSidebar({
  activeItem,
  avatarLetter,
  displayEmail,
  displayName,
  photoUrl,
  onLogout,
}: AppSidebarProps) {
  return (
    <aside className="relative w-[220px] shrink-0 flex flex-col">
      <div className="absolute inset-0 ds-surface rounded-[14px]" style={{ boxShadow: "var(--ds-shadow)" }} />

      <div
        className="relative z-10 flex items-center h-[50px] px-4 shrink-0 border-b"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <Logo size="sm" linkTo="/" />
      </div>

      <AppNavigation activeItem={activeItem} />
      <AppUserMenu
        avatarLetter={avatarLetter}
        displayEmail={displayEmail}
        displayName={displayName}
        photoUrl={photoUrl}
        onLogout={onLogout}
      />
    </aside>
  );
}
