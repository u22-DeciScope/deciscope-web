import type { BackendUser } from "~/api/auth/authApi";

type UserAvatarProps = {
  className?: string;
  user: BackendUser;
};

export function UserAvatar({ className = "h-8 w-8", user }: UserAvatarProps) {
  const displayName = user.displayName ?? user.email ?? "ユーザー";
  const avatarLetter = displayName.charAt(0);

  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white`}
      style={{ background: "var(--brand)" }}
    >
      {avatarLetter}
    </div>
  );
}
