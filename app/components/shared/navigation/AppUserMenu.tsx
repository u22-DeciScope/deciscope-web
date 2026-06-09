import { HiArrowRightOnRectangle } from "react-icons/hi2";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";

type AppUserMenuProps = {
  collapsed: boolean;
};

export function AppUserMenu({ collapsed }: AppUserMenuProps) {
  const { logout, user } = useAuthenticatedLayout();
  const displayName = user.displayName ?? "ゲスト";
  const displayEmail = user.email ?? "";
  const avatarLetter = displayName.charAt(0);
  const photoUrl = user.photoURL;

  return (
    <div className="relative z-10 border-t" style={{ borderColor: "var(--ds-border)" }}>
      <div className={`flex items-center py-3 ${collapsed ? "justify-center px-2" : "gap-2.5 px-4"}`}>
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
        <button
          type="button"
          onClick={logout}
          className={`${collapsed ? "hidden" : ""} shrink-0 p-1 rounded-[6px] transition hover:opacity-70`}
          title="ログアウト"
          style={{ color: "var(--text-muted)" }}
        >
          <HiArrowRightOnRectangle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
