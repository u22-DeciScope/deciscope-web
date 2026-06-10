import { Link } from "react-router";
import { appNavigationItems } from "~/components/shared/navigation/navigationItems";
import { useActiveNavigationItem } from "~/components/shared/navigation/useActiveNavigationItem";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export function AppMobileNavigation() {
  const activeItem = useActiveNavigationItem();
  const { workspaceId } = useAuthenticatedLayout();

  return (
    <nav
      className="fixed inset-x-2 z-30 grid overflow-hidden rounded-(--ds-radius-panel) border md:hidden"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--ds-border)",
        bottom: "max(0.5rem, env(safe-area-inset-bottom))",
        gridTemplateColumns: `repeat(${appNavigationItems.length}, minmax(0, 1fr))`,
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

        return (
          <Link
            key={item.id}
            to={workspacePath(workspaceId, item.path)}
            className={className}
            style={style}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
