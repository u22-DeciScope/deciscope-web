import type { ButtonHTMLAttributes } from "react";

interface DsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
}

export function DsButton({
  children,
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}: DsButtonProps) {
  const base = `inline-flex items-center justify-center gap-2 rounded-[9px] px-4 py-[10px] text-[13px] font-semibold transition focus:outline-none disabled:opacity-50 ${fullWidth ? "w-full" : ""}`;

  const variants = {
    primary:   { background: "var(--brand)",   color: "#fff",               border: "none" },
    secondary: { background: "#fff",            color: "var(--text-sub)",    border: "1px solid var(--ds-border)" },
    ghost:     { background: "transparent",     color: "var(--text-sub)",    border: "none" },
  };

  return (
    <button className={`${base} ${className}`} style={variants[variant]} {...props}>
      {children}
    </button>
  );
}
