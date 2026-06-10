import type { User } from "firebase/auth";
import { HiArrowRightOnRectangle, HiCog6Tooth } from "react-icons/hi2";

type UserMenuPopoverProps = {
  collapsed: boolean;
  onLogout: () => void | Promise<void>;
  onOpenSettings: () => void;
  user: User;
};

export function UserMenuPopover({
  collapsed,
  onLogout,
  onOpenSettings,
  user,
}: UserMenuPopoverProps) {
  const displayName = user.displayName ?? user.email ?? "ユーザー";
  const displayEmail = user.email ?? "";

  return (
    <div
      role="menu"
      aria-label="アカウントメニュー"
      className={`absolute bottom-full mb-2 w-64 overflow-hidden rounded-(--ds-radius-panel) border p-2 ${
        collapsed ? "left-0" : "left-2"
      }`}
      style={{
        background: "var(--ds-surface-raised)",
        borderColor: "var(--ds-border)",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      <p className="truncate px-3 pb-2 pt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {displayEmail || displayName}
      </p>

      <UserMenuItem icon={HiCog6Tooth} label="設定" onClick={onOpenSettings} />

      <div className="my-2 h-px" style={{ background: "var(--ds-border)" }} />

      <UserMenuItem icon={HiArrowRightOnRectangle} label="ログアウト" onClick={onLogout} />
    </div>
  );
}

type UserMenuItemProps = {
  icon: typeof HiCog6Tooth;
  label: string;
  onClick: () => void | Promise<void>;
};

function UserMenuItem({ icon: Icon, label, onClick }: UserMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 rounded-(--ds-radius-control) px-3 py-2.5 text-left text-[13px] font-medium transition hover:bg-(--ds-surface-muted)"
      style={{ color: "var(--text-main)" }}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </button>
  );
}
