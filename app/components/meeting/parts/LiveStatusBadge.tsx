export function LiveStatusBadge({ label, status }: { label: string; status: string }) {
  const ended = status === "ended" || status === "closed";
  const live =
    status === "started" ||
    status === "connected" ||
    status === "joined" ||
    status === "active" ||
    status === "recording";

  return (
    <span
      className="inline-flex h-8 items-center gap-2 rounded-(--ds-radius-control) border px-3 text-[12px] font-bold"
      style={{
        background: live ? "var(--ai-risk-bg)" : "var(--input-bg)",
        borderColor: live ? "var(--ai-risk-border)" : "var(--input-border)",
        color: ended ? "var(--text-muted)" : live ? "var(--ai-risk-fg)" : "var(--text-sub)",
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: ended ? "var(--text-muted)" : live ? "var(--status-live)" : "var(--warning)",
        }}
      />
      {label}
    </span>
  );
}
