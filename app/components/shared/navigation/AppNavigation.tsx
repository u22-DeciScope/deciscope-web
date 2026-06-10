import { appNavigationItems } from "~/components/shared/navigation/navigationItems";
import { Link } from "react-router";
import { useActiveNavigationItem } from "~/components/shared/navigation/useActiveNavigationItem";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

type AppNavigationProps = {
  collapsed: boolean;
};

export function AppNavigation({ collapsed }: AppNavigationProps) {
  const activeItem = useActiveNavigationItem();
  const { workspaceId } = useAuthenticatedLayout();

  return (
    <nav
      className={`relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}
    >
      {appNavigationItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeItem;
        const className = `flex w-full items-center rounded-[9px] py-2.25 text-left text-[13px] font-medium transition hover:opacity-80 ${
          collapsed ? "justify-center px-2" : "gap-3 px-3"
        }`;
        const style = active
          ? { background: "var(--brand-light)", color: "var(--brand)" }
          : { background: "transparent", color: "var(--text-sub)" };
        const content = (
          <>
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && item.label}
          </>
        );

        return item.path ? (
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
