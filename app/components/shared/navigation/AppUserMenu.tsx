import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "~/components/shared/modal/ConfirmDialog";
import { UserMenuButton } from "~/components/shared/navigation/UserMenuButton";
import { UserMenuPopover } from "~/components/shared/navigation/UserMenuPopover";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";

type AppUserMenuProps = {
  collapsed: boolean;
};

export function AppUserMenu({ collapsed }: AppUserMenuProps) {
  const { logout, user } = useAuthenticatedLayout();
  const [open, setOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const popoverRoot = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRoot.current?.contains(target) || popoverRoot.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleRequestLogout() {
    setOpen(false);
    setLogoutConfirmOpen(true);
  }

  async function handleConfirmLogout() {
    setLogoutConfirmOpen(false);
    await logout();
  }

  return (
    <>
      <div ref={menuRoot} className="relative border-t" style={{ borderColor: "var(--ds-border)" }}>
        {open && (
          <UserMenuPopover
            anchorEl={menuRoot.current}
            collapsed={collapsed}
            menuRef={popoverRoot}
            onLogout={handleRequestLogout}
            user={user}
          />
        )}

        <UserMenuButton
          buttonRef={menuButton}
          collapsed={collapsed}
          open={open}
          onClick={() => setOpen((current) => !current)}
          user={user}
        />
      </div>
      {logoutConfirmOpen && (
        <ConfirmDialog
          title="ログアウトしますか？"
          confirmLabel="OK"
          cancelLabel="キャンセル"
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={handleConfirmLogout}
        />
      )}
    </>
  );
}
