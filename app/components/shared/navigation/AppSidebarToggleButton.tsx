import { LuPanelLeftClose } from "react-icons/lu";

type AppSidebarToggleButtonProps = {
  className?: string;
  flipped?: boolean;
  label: string;
  onClick: () => void;
  variant?: "filled" | "ghost";
};

export function AppSidebarToggleButton({
  className,
  flipped = false,
  label,
  onClick,
  variant = "ghost",
}: AppSidebarToggleButtonProps) {
  const classes = [
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-(--ds-radius-control) transition focus-visible:opacity-100",
    variant === "filled" ? "hover:opacity-70" : "hover:bg-(--ds-surface-muted)",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={onClick}
      className={classes}
      aria-label={label}
      title={label}
      style={{
        color: "var(--text-muted)",
        background: variant === "filled" ? "var(--ds-surface-muted)" : undefined,
      }}
    >
      <LuPanelLeftClose
        className="h-4 w-4 transition-transform"
        style={{ transform: flipped ? "scaleX(-1)" : undefined }}
      />
    </button>
  );
}
