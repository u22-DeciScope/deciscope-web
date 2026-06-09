import {
  appNavigationItems,
  type AppNavigationItemId,
} from "~/components/shared/navigation/navigationItems";
import { Link } from "react-router";
import { WORKSPACE_MEETINGS_PATH } from "~/lib/workspace";

type AppNavigationProps = {
  activeItem: AppNavigationItemId;
  collapsed: boolean;
};

export function AppNavigation({ activeItem, collapsed }: AppNavigationProps) {
  return (
    <nav className={`relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto py-4 ${collapsed ? "px-2" : "px-3"}`}>
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
            to={item.path === "/" ? WORKSPACE_MEETINGS_PATH : item.path}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={className}
            style={style}
          >
            {content}
          </Link>
        ) : (
          <button key={item.id} type="button" className={className} style={style}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
