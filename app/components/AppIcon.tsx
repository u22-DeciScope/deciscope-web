type AppIconProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

export function AppIcon({ className = "", size = "md" }: AppIconProps) {
  return (
    <img
      src="/deciscope-mark.png"
      alt=""
      aria-hidden="true"
      className={`${sizes[size]} ${className} shrink-0 object-contain`}
    />
  );
}
