export function StatusPanel({ message }: { message: string }) {
  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) p-5 text-[13px]"
      style={{ boxShadow: "var(--ds-shadow)", color: "var(--text-sub)" }}
    >
      {message}
    </div>
  );
}
