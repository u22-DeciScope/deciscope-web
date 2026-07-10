import { normalizeWorkspaceRole } from "~/api/auth/authApi";

const roleStyles: Record<string, { background: string; color: string; label: string }> = {
  owner: { background: "var(--brand)", color: "#ffffff", label: "owner" },
  admin: { background: "var(--tag-topic-bg)", color: "var(--tag-topic-fg)", label: "admin" },
  viewer: { background: "var(--input-bg)", color: "var(--text-muted)", label: "viewer" },
};

export function RoleBadge({ role }: { role: string }) {
  const normalized = normalizeWorkspaceRole(role);
  const style = roleStyles[normalized] ?? roleStyles.viewer;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: style.background, color: style.color }}
    >
      {style.label}
    </span>
  );
}

export function ViewerOnlyBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: "var(--ds-border)", color: "var(--text-muted)" }}
    >
      閲覧のみ
    </span>
  );
}

export function InvitationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { background: string; color: string; label: string }> = {
    pending: { background: "var(--tag-topic-bg)", color: "var(--tag-topic-fg)", label: "招待中" },
    expired: { background: "var(--input-bg)", color: "var(--text-muted)", label: "期限切れ" },
  };
  const style = styles[status] ?? styles.pending;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: style.background, color: style.color }}
    >
      {style.label}
    </span>
  );
}
