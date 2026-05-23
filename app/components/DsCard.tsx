interface DsCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function DsCard({ children, className = "", padding = false }: DsCardProps) {
  return (
    <div
      className={`bg-white rounded-[14px] overflow-hidden ${padding ? "p-6" : ""} ${className}`}
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      {children}
    </div>
  );
}

interface DsCardHeaderProps {
  children: React.ReactNode;
  dot?: boolean;
}

export function DsCardHeader({ children, dot = true }: DsCardHeaderProps) {
  return (
    <div
      className="h-[40px] flex items-center px-4 shrink-0 border-b"
      style={{ borderColor: "var(--ds-border)" }}
    >
      {dot && (
        <span
          className="w-[10px] h-[10px] rounded-full shrink-0 mr-2"
          style={{ background: "var(--brand)" }}
        />
      )}
      {children}
    </div>
  );
}
