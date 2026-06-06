import { HiArrowRightOnRectangle } from "react-icons/hi2";

type AppUserMenuProps = {
  avatarLetter: string;
  displayEmail: string;
  displayName: string;
  photoUrl?: string | null;
  onLogout: () => void | Promise<void>;
};

export function AppUserMenu({
  avatarLetter,
  displayEmail,
  displayName,
  photoUrl,
  onLogout,
}: AppUserMenuProps) {
  return (
    <div className="relative z-10 border-t" style={{ borderColor: "var(--ds-border)" }}>
      <div className="flex items-center gap-2.5 px-4 py-3">
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
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-main)" }}>
            {displayName}
          </p>
          <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
            {displayEmail}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 p-1 rounded-[6px] transition hover:opacity-70"
          title="ログアウト"
          style={{ color: "var(--text-muted)" }}
        >
          <HiArrowRightOnRectangle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
