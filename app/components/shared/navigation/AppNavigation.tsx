import {
  appNavigationItems,
  type AppNavigationItemId,
} from "~/components/shared/navigation/navigationItems";

type AppNavigationProps = {
  activeItem: AppNavigationItemId;
};

export function AppNavigation({ activeItem }: AppNavigationProps) {
  return (
    <nav className="relative z-10 flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
      {appNavigationItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeItem;

        return (
          <button
            key={item.id}
            type="button"
            className="flex items-center gap-3 w-full px-3 py-[9px] rounded-[9px] text-[13px] font-medium text-left transition hover:opacity-80"
            style={
              active
                ? { background: "var(--brand-light)", color: "var(--brand)" }
                : { background: "transparent", color: "var(--text-sub)" }
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
