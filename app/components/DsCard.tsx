import type { ReactNode } from "react";

interface DsCardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export function DsCard({ children, className = "", padding = false }: DsCardProps) {
  return (
    <div className={`ds-surface-elevated overflow-hidden ${padding ? "p-6" : ""} ${className}`}>
      {children}
    </div>
  );
}

interface DsCardHeaderProps {
  children: ReactNode;
  dot?: boolean;
}

export function DsCardHeader({ children, dot = true }: DsCardHeaderProps) {
  return (
    <div
      className="h-10 flex items-center px-4 shrink-0 border-b"
      style={{ borderColor: "var(--ds-border)" }}
    >
      {dot && (
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 mr-2"
          style={{ background: "var(--brand)" }}
        />
      )}
      {children}
    </div>
  );
}
