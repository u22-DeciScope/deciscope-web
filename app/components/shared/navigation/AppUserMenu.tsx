import { useEffect, useRef, useState } from "react";
import {
  HiArrowRightOnRectangle,
  HiChevronUpDown,
  HiCog6Tooth,
  HiLanguage,
  HiQuestionMarkCircle,
} from "react-icons/hi2";
import { AppSettingsModal } from "~/components/shared/settings/AppSettingsModal";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";

type AppUserMenuProps = {
  collapsed: boolean;
};

export function AppUserMenu({ collapsed }: AppUserMenuProps) {
  const { logout, user } = useAuthenticatedLayout();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const displayName = user.displayName ?? "ゲスト";
  const displayEmail = user.email ?? "";
  const avatarLetter = displayName.charAt(0);
  const photoUrl = user.photoURL;

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

  async function handleLogout() {
    setOpen(false);
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
        className="relative z-20 border-t"
        style={{ borderColor: "var(--ds-border)" }}
      >
        {open && (
          <div
            role="menu"
            aria-label="アカウントメニュー"
            className={`absolute bottom-full mb-2 w-64 overflow-hidden rounded-[14px] border p-2 ${
              collapsed ? "left-0" : "left-2"
            }`}
            style={{
              background: "var(--ds-surface-raised)",
              borderColor: "var(--ds-border)",
              boxShadow: "var(--ds-shadow)",
            }}
          >
            <p
              className="truncate px-3 pb-2 pt-1 text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {displayEmail || displayName}
            </p>

            <AccountMenuItem icon={HiCog6Tooth} label="設定" onClick={handleOpenSettings} />
            <AccountMenuItem icon={HiLanguage} label="言語" />
            <AccountMenuItem icon={HiQuestionMarkCircle} label="ヘルプを表示" />

            <div className="my-2 h-px" style={{ background: "var(--ds-border)" }} />

            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-[13px] font-medium transition hover:bg-(--ds-surface-muted)"
              style={{ color: "var(--text-main)" }}
            >
              <HiArrowRightOnRectangle className="h-5 w-5 shrink-0" />
              ログアウト
            </button>
          </div>
        )}

        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={collapsed ? "アカウントメニューを開く" : undefined}
          onClick={() => setOpen((current) => !current)}
          className={`flex w-full items-center py-3 text-left transition hover:bg-(--ds-surface-muted) ${
            collapsed ? "justify-center px-2" : "gap-2.5 px-4"
          }`}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ background: "var(--brand)" }}
            >
              {avatarLetter}
            </div>
          )}
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
      </div>
      {settingsOpen && <AppSettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

type AccountMenuItemProps = {
  icon: typeof HiCog6Tooth;
  label: string;
  onClick?: () => void;
};

function AccountMenuItem({ icon: Icon, label, onClick }: AccountMenuItemProps) {
  const disabled = !onClick;

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? `${label}は準備中です` : undefined}
      className={`flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-[13px] font-medium transition ${
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-(--ds-surface-muted)"
      }`}
      style={{ color: "var(--text-main)" }}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
      {disabled && (
        <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
          準備中
        </span>
      )}
    </button>
  );
}
