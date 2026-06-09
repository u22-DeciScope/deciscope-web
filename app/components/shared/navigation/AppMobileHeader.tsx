import { Logo } from "~/components/Logo";
import { workspacePath } from "~/lib/workspace";

type AppMobileHeaderProps = {
  avatarLetter: string;
  photoUrl?: string | null;
  workspaceId: string;
};

export function AppMobileHeader({ avatarLetter, photoUrl, workspaceId }: AppMobileHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur md:hidden"
      style={{ background: "color-mix(in srgb, var(--ds-surface) 92%, transparent)", borderColor: "var(--ds-border)" }}
    >
      <Logo size="sm" linkTo={workspacePath(workspaceId, "/meetings")} />
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {avatarLetter}
        </div>
      )}
    </header>
  );
}
