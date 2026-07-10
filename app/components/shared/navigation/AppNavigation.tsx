import { Link } from "react-router";
import { canManageWorkspace } from "~/api/auth/authApi";
import { visibleNavigationItems } from "~/components/shared/navigation/navigationItems";
import { useActiveNavigationItem } from "~/components/shared/navigation/useActiveNavigationItem";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

type AppNavigationProps = {
  collapsed: boolean;
};

export function AppNavigation({ collapsed }: AppNavigationProps) {
  const activeItem = useActiveNavigationItem();
  const { workspace, workspaceId } = useAuthenticatedLayout();
  // viewer には管理系メニューを表示しない (backend 認可は別途維持されている)。
  const items = visibleNavigationItems(canManageWorkspace(workspace.role));

  return (
    <nav className={`relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto p-2`}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeItem;
        const className = `flex w-full items-center rounded-(--ds-radius-control) h-9 text-left font-medium transition hover:opacity-80 ${
          collapsed ? "justify-center" : "gap-3"
        }`;
        const style = active
          ? { background: "var(--brand-light)", color: "var(--brand)" }
          : { background: "transparent", color: "var(--text-sub)" };
        const content = (
          <>
            <Icon className="aspect-square w-10 shrink-0" />
            {!collapsed && item.label}
          </>
        );

        return (
          <Link
            key={item.id}
            to={workspacePath(workspaceId, item.path)}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
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
