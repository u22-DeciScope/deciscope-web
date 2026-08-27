import type { BackendUser } from "~/api/auth/authApi";
import type { RefObject } from "react";
import { HiChevronUpDown } from "react-icons/hi2";
import { UserAvatar } from "~/components/shared/navigation/UserAvatar";

type UserMenuButtonProps = {
  buttonRef?: RefObject<HTMLButtonElement | null>;
  collapsed: boolean;
  onClick: () => void;
  open: boolean;
  user: BackendUser;
};

export function UserMenuButton({ buttonRef, collapsed, onClick, open, user }: UserMenuButtonProps) {
  const displayName = user.displayName ?? user.email ?? "ユーザー";
  const displayEmail = user.email ?? "";

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={collapsed ? "アカウントメニューを開く" : undefined}
      onClick={onClick}
      className={`flex min-h-15 w-full cursor-pointer items-center py-2 pt-3 text-left transition hover:bg-(--ds-surface-muted) focus-visible:bg-(--ds-surface-muted) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--brand) ${
        collapsed ? "justify-center" : "gap-2.5 px-3"
      }`}
      style={open ? { background: "var(--ds-surface-muted)" } : undefined}
    >
      <UserAvatar user={user} />
      <div className={collapsed ? "hidden" : "min-w-0 flex-1"}>
        <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-main)" }}>
          {displayName}
        </p>
        <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
          {displayEmail}
        </p>
      </div>
      {!collapsed && (
        <HiChevronUpDown className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
      )}
    </button>
  );
}
