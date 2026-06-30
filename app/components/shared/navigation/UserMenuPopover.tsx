import type { BackendUser } from "~/api/auth/authApi";
import { HiArrowRightOnRectangle, HiCog6Tooth } from "react-icons/hi2";
import { createPortal } from "react-dom"; // 💡 追記
import { useLayoutEffect, useState } from "react"; // 💡 追記


type UserMenuPopoverProps = {
  anchorEl: HTMLElement | null; // 💡 追記
  collapsed: boolean;
  onLogout: () => void | Promise<void>;
  onOpenSettings: () => void;
  user: BackendUser;
};

export function UserMenuPopover({
  anchorEl,
  collapsed,
  onLogout,
  onOpenSettings,
  user,
}:UserMenuPopoverProps) {
  // 💡 追記: ポップオーバーの表示位置を管理するステート
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // 💡 追記: アンカー要素の位置を動的に計算する
  useLayoutEffect(() => {
    if (!anchorEl) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
      });
    };

    updatePosition();
    
    // ウィンドウのリサイズ時にも位置を追従させる
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchorEl]);

  // 位置計算が終わるまでは何も描画しない
  if (!coords) return null;

  const displayName = user.displayName ?? user.email ?? "ユーザー";
  const displayEmail = user.email ?? "";

  // 💡 変更: createPortal で body 直下にレンダリングする
  return createPortal(
    <div
      role="menu"
      aria-label="アカウントメニュー"
      // 💡 変更: absolute, bottom-full, left-0, left-2 を削除し、代わりに fixed を設定
      className="fixed z-[9999] w-64 overflow-hidden rounded-(--ds-radius-panel) border p-2"
      style={{
        // 💡 変更: 計算した座標を適用
        top: `${coords.top}px`,
        // 元の left-2 (8px) の微調整を再現
        left: `${coords.left + (collapsed ? 0 : 8)}px`,
        // 💡 テクニック: ポップオーバー自身の高さ分、綺麗に上に押し上げる
        transform: "translateY(-100%) translateY(-8px)", 
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
    </div>,
    document.body // 💡 追記: 描画先を body 直下に指定
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
