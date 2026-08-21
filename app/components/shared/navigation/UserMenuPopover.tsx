import type { BackendUser } from "~/api/auth/authApi";
import { HiArrowRightOnRectangle } from "react-icons/hi2";
import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type RefObject } from "react";

const POPOVER_WIDTH = 272;
const VIEWPORT_MARGIN = 8;

type UserMenuPopoverProps = {
  anchorEl: HTMLElement | null;
  collapsed: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onLogout: () => void | Promise<void>;
  user: BackendUser;
};

export function UserMenuPopover({
  anchorEl,
  collapsed,
  menuRef,
  onLogout,
  user,
}: UserMenuPopoverProps) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2);
      const popoverWidth = Math.min(POPOVER_WIDTH, availableWidth);
      const desiredLeft = collapsed ? rect.right : rect.left;
      setCoords({
        top: collapsed ? rect.bottom : rect.top,
        left: Math.min(
          Math.max(VIEWPORT_MARGIN, desiredLeft),
          Math.max(VIEWPORT_MARGIN, window.innerWidth - popoverWidth - VIEWPORT_MARGIN),
        ),
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorEl, collapsed]);

  if (!coords) return null;

  const displayName = user.displayName ?? user.email ?? "ユーザー";
  const displayEmail = user.email ?? "";

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="アカウントメニュー"
      className="fixed z-[9999] w-[min(17rem,calc(100vw-1rem))] overflow-hidden rounded-(--ds-radius-panel) border p-2"
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: "translateY(-100%)",
        background: "var(--ds-surface-raised)",
        borderColor: "var(--ds-border)",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      <p className="truncate px-3 pb-2 pt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {displayEmail || displayName}
      </p>

      <UserMenuItem icon={HiArrowRightOnRectangle} label="ログアウト" onClick={onLogout} />
    </div>,
    document.body,
  );
}

type UserMenuItemProps = {
  icon: typeof HiArrowRightOnRectangle;
  label: string;
  onClick: () => void | Promise<void>;
};

function UserMenuItem({ icon: Icon, label, onClick }: UserMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      autoFocus
      onClick={onClick}
      className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-(--ds-radius-control) px-4 py-3 text-left text-[14px] font-semibold transition hover:bg-(--ds-surface-muted) focus-visible:bg-(--ds-surface-muted) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--brand)"
      style={{ color: "var(--danger)" }}
    >
      <Icon className="h-5.5 w-5.5 shrink-0" />
      {label}
    </button>
  );
}
