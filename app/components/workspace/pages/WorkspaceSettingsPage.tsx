import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { canManageWorkspace, normalizeWorkspaceRole, type WorkspaceRole } from "~/api/auth/authApi";
import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
  updateWorkspaceName,
  type WorkspaceInvitationDto,
  type WorkspaceMemberDto,
} from "~/api/workspaces/workspaceApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

type InviteRole = "admin" | "viewer";

export default function WorkspaceSettingsPage() {
  const { user, workspace, workspaces, workspaceId } = useAuthenticatedLayout();
  const role = normalizeWorkspaceRole(workspace.role);
  const canManage = canManageWorkspace(role);
  const workspaceList = useMemo(() => (Array.isArray(workspaces) ? workspaces : []), [workspaces]);
  const [name, setName] = useState(workspace.name);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("viewer");
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    setName(workspace.name);
  }, [workspace.name, workspaceId]);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const [membersResult, invitationsResult] = await Promise.all([
        listWorkspaceMembers(workspaceId),
        canManage
          ? listWorkspaceInvitations(workspaceId)
          : Promise.resolve({ invitations: [] as WorkspaceInvitationDto[] }),
      ]);
      setMembers(membersResult.members);
      setInvitations(invitationsResult.invitations);
    } catch (cause) {
      setMembers([]);
      setInvitations([]);
      setLoadError(errorMessage(cause) || "Workspace設定を取得できませんでした。");
    } finally {
      setIsLoading(false);
    }
  }, [canManage, workspaceId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveName() {
    if (!canManage) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setActionError("Workspace名を入力してください。");
      return;
    }
    setBusyAction("rename");
    setActionError(null);
    setMessage("");
    try {
      const updated = await updateWorkspaceName(workspaceId, trimmedName);
      setName(updated.name);
      setMessage("Workspace名を更新しました。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "Workspace名を更新できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setActionError("招待するメールアドレスを入力してください。");
      return;
    }
    setBusyAction("invite");
    setActionError(null);
    setMessage("");
    try {
      const invitation = await inviteWorkspaceMember(workspaceId, trimmedEmail, inviteRole);
      setInvitations((current) => [
        ...current.filter((item) => item.id !== invitation.id),
        invitation,
      ]);
      setEmail("");
      setInviteRole("viewer");
      setMessage("招待を登録しました。対象メールアドレスでの次回ログイン時に参加します。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "招待を登録できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  async function revokeInvitation(invitationId: string) {
    setBusyAction(`revoke:${invitationId}`);
    setActionError(null);
    setMessage("");
    try {
      await revokeWorkspaceInvitation(workspaceId, invitationId);
      setInvitations((current) => current.filter((item) => item.id !== invitationId));
      setMessage("招待を取り消しました。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "招待を取り消せませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  async function removeMember(memberId: string) {
    setBusyAction(`remove:${memberId}`);
    setActionError(null);
    setMessage("");
    try {
      await removeWorkspaceMember(workspaceId, memberId);
      setMembers((current) => current.filter((item) => item.user_id !== memberId));
      setMessage("メンバーを削除しました。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "メンバーを削除できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  async function changeMemberRole(memberId: string, nextRole: InviteRole) {
    setBusyAction(`role:${memberId}`);
    setActionError(null);
    setMessage("");
    try {
      const member = await updateWorkspaceMemberRole(workspaceId, memberId, nextRole);
      setMembers((current) => current.map((item) => (item.user_id === memberId ? member : item)));
      setMessage("メンバー権限を更新しました。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "メンバー権限を更新できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <section className="ds-surface rounded-(--ds-radius-panel) p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">Workspace設定</h1>
              <p className="mt-1 text-xs text-(--text-muted)">Workspaceコード: {workspaceId}</p>
            </div>
            <RoleBadge role={role} />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="メンバー" value={members.length} />
            <Metric label="招待中" value={invitations.length} />
            <Metric label="現在の権限" value={roleLabel(role)} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <DsInput
                label="Workspace名"
                value={name}
                disabled={!canManage || busyAction === "rename"}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            <DsButton
              type="button"
              disabled={!canManage || busyAction === "rename"}
              onClick={saveName}
            >
              {busyAction === "rename" ? "変更中" : "変更"}
            </DsButton>
          </div>

          {!canManage && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-(--text-muted)">
              閲覧者権限のため、Workspace名・招待・メンバー権限は変更できません。
            </p>
          )}

          {workspaceList.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {workspaceList.map((item) => (
                <Link
                  className="rounded-(--ds-radius-control) border px-3 py-2 text-sm"
                  key={item.id}
                  to={workspacePath(item.id, "/meetings")}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {canManage && (
        <form className="ds-surface rounded-(--ds-radius-panel) p-5" onSubmit={invite}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">メールアドレスで招待</h2>
            <span className="text-xs text-(--text-muted)">owner権限は招待できません</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <DsInput
                label="メールアドレス"
                type="email"
                value={email}
                disabled={busyAction === "invite"}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>
            <RoleSelect
              label="権限"
              value={inviteRole}
              disabled={busyAction === "invite"}
              onChange={setInviteRole}
            />
            <DsButton type="submit" disabled={busyAction === "invite"}>
              {busyAction === "invite" ? "招待中" : "招待"}
            </DsButton>
          </div>

          <div className="mt-4">
            {invitations.length === 0 ? (
              <EmptyLine>招待中のメールアドレスはありません。</EmptyLine>
            ) : (
              invitations.map((item) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-0"
                  key={item.id}
                >
                  <span>
                    {item.email}{" "}
                    <span className="text-xs text-(--text-muted)">
                      {roleLabel(item.role)}で招待中
                    </span>
                  </span>
                  <DsButton
                    type="button"
                    variant="secondary"
                    disabled={busyAction === `revoke:${item.id}`}
                    onClick={() => revokeInvitation(item.id)}
                  >
                    {busyAction === `revoke:${item.id}` ? "取消中" : "取消"}
                  </DsButton>
                </div>
              ))
            )}
          </div>
        </form>
      )}

      <section className="ds-surface rounded-(--ds-radius-panel) p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">メンバー</h2>
          <DsButton type="button" variant="secondary" disabled={isLoading} onClick={loadSettings}>
            再読み込み
          </DsButton>
        </div>

        {isLoading ? (
          <EmptyLine>Workspaceメンバーを読み込んでいます...</EmptyLine>
        ) : loadError ? (
          <div className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
            {loadError}
          </div>
        ) : members.length === 0 ? (
          <EmptyLine>メンバーはまだ登録されていません。</EmptyLine>
        ) : (
          members.map((member) => {
            const memberRole = normalizeWorkspaceRole(member.role);
            const canEditMember = canManage && memberRole !== "owner" && member.user_id !== user.id;
            return (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
                key={member.user_id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {member.display_name || member.email}
                  </p>
                  <p className="truncate text-xs text-(--text-muted)">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canEditMember ? (
                    <RoleSelect
                      value={memberRole === "admin" ? "admin" : "viewer"}
                      disabled={busyAction === `role:${member.user_id}`}
                      onChange={(nextRole) => changeMemberRole(member.user_id, nextRole)}
                    />
                  ) : (
                    <span className="text-sm">{roleLabel(memberRole)}</span>
                  )}
                  {canEditMember && (
                    <DsButton
                      type="button"
                      variant="secondary"
                      disabled={busyAction === `remove:${member.user_id}`}
                      onClick={() => removeMember(member.user_id)}
                    >
                      {busyAction === `remove:${member.user_id}` ? "削除中" : "削除"}
                    </DsButton>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {(message || actionError) && (
        <p className={`text-sm ${actionError ? "text-red-600" : "text-(--brand)"}`}>
          {actionError || message}
        </p>
      )}
    </div>
  );
}

function RoleSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label?: string;
  value: InviteRole;
  disabled?: boolean;
  onChange: (role: InviteRole) => void;
}) {
  return (
    <label className="flex min-w-28 flex-col gap-1 text-[11px] text-(--text-muted)">
      {label}
      <select
        className="h-10 rounded-(--ds-radius-control) border bg-(--input-bg) px-2 text-[13px] text-(--text-main)"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value as InviteRole)}
      >
        <option value="viewer">viewer</option>
        <option value="admin">admin</option>
      </select>
    </label>
  );
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span className="rounded-(--ds-radius-control) border px-3 py-2 text-xs font-semibold">
      {roleLabel(role)}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-(--ds-radius-control) border px-3 py-2">
      <p className="text-[11px] text-(--text-muted)">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function EmptyLine({ children }: { children: string }) {
  return (
    <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-(--text-muted)">
      {children}
    </p>
  );
}

function roleLabel(role: WorkspaceRole | string) {
  switch (normalizeWorkspaceRole(role)) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "viewer":
      return "viewer";
    default:
      return role;
  }
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "";
}
