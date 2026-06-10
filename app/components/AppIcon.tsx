import { HiSparkles } from "react-icons/hi2";

type AppIconProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { container: "h-6 w-6 rounded-[7px]", icon: "h-3.5 w-3.5" },
  md: { container: "h-8 w-8 rounded-[9px]", icon: "h-4.5 w-4.5" },
  lg: { container: "h-10 w-10 rounded-[11px]", icon: "h-5.5 w-5.5" },
};

export function AppIcon({ className = "", size = "md" }: AppIconProps) {
  const styles = sizes[size];

  return (
    <span
      aria-hidden="true"
      className={`${styles.container} ${className} inline-flex shrink-0 items-center justify-center`}
      style={{ background: "var(--brand)", color: "white" }}
    >
      <HiSparkles className={styles.icon} />
    </span>
  );
}
