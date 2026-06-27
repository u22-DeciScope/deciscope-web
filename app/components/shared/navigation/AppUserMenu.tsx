import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "~/components/shared/modal/ConfirmDialog";
import { AppSettingsModal } from "~/components/shared/settings/AppSettingsModal";
import { UserMenuButton } from "~/components/shared/navigation/UserMenuButton";
import { UserMenuPopover } from "~/components/shared/navigation/UserMenuPopover";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";

type AppUserMenuProps = {
  collapsed: boolean;
};

export function AppUserMenu({ collapsed }: AppUserMenuProps) {
  const { logout, user } = useAuthenticatedLayout();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRoot.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
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

  function handleOpenSettings() {
    setOpen(false);
    setSettingsOpen(true);
  }

  return (
    <>
<div
        ref={menuRoot}
        className="relative border-t"
        style={{ borderColor: "var(--ds-border)" }}
      >
        {open && (
          <UserMenuPopover
            anchorEl={menuRoot.current} // 💡 追記：親要素の参照を渡す
            collapsed={collapsed}
            onLogout={handleRequestLogout}
            onOpenSettings={handleOpenSettings}
            user={user}
          />
        )}

        <UserMenuButton
          collapsed={collapsed}
          open={open}
          onClick={() => setOpen((current) => !current)}
          user={user}
        />
      </div>
      {settingsOpen && <AppSettingsModal onClose={() => setSettingsOpen(false)} />}
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
