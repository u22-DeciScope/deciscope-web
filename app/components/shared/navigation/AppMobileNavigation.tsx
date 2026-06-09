import { Link } from "react-router";
import {
  appNavigationItems,
} from "~/components/shared/navigation/navigationItems";
import { useActiveNavigationItem } from "~/components/shared/navigation/useActiveNavigationItem";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export function AppMobileNavigation() {
  const activeItem = useActiveNavigationItem();
  const { workspaceId } = useAuthenticatedLayout();

  return (
    <nav
      className="fixed inset-x-2 z-30 grid grid-cols-4 overflow-hidden rounded-xl border md:hidden"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--ds-border)",
        bottom: "max(0.5rem, env(safe-area-inset-bottom))",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      {appNavigationItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeItem;
        const content = (
          <>
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </>
        );
        const className = "flex min-h-14 flex-col items-center justify-center gap-1";
        const style = { color: active ? "var(--brand)" : "var(--text-muted)" };

        return item.path ? (
          <Link
            key={item.id}
            to={workspacePath(workspaceId, item.path)}
            className={className}
            style={style}
          >
            {content}
          </Link>
        ) : (
          <button
            key={item.id}
            type="button"
            disabled
            title={`${item.label}は準備中です`}
            className={`${className} cursor-not-allowed opacity-60`}
            style={style}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
