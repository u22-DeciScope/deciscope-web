import type { BackendUser } from "~/api/auth/authApi";
import { HiChevronUpDown } from "react-icons/hi2";
import { UserAvatar } from "~/components/shared/navigation/UserAvatar";

type UserMenuButtonProps = {
  collapsed: boolean;
  onClick: () => void;
  open: boolean;
  user: BackendUser;
};

export function UserMenuButton({ collapsed, onClick, open, user }: UserMenuButtonProps) {
  const displayName = user.displayName ?? user.email ?? "ユーザー";
  const displayEmail = user.email ?? "";

  return (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={collapsed ? "アカウントメニューを開く" : undefined}
      onClick={onClick}
      className={`flex w-full items-center py-2 pt-3 text-left cursor-pointer transition hover:bg-(--ds-surface-muted) ${
        collapsed ? "justify-center" : "gap-2.5 px-3"
      }`}
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
