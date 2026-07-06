import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { canManageWorkspace, normalizeWorkspaceRole } from "~/api/auth/authApi";
import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspace,
  updateWorkspaceMemberRole,
  type WorkspaceInvitationDto,
  type WorkspaceMemberDto,
} from "~/api/workspaces/workspaceApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { ConfirmDialog } from "~/components/shared/modal/ConfirmDialog";
import {
  InvitationStatusBadge,
  RoleBadge,
  ViewerOnlyBadge,
} from "~/components/workspace/parts/RoleBadge";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

type InviteRole = "admin" | "viewer";

type ConfirmState =
  | { type: "invite"; email: string; role: InviteRole }
  | { type: "revoke"; invitation: WorkspaceInvitationDto }
  | { type: "remove"; member: WorkspaceMemberDto }
  | null;

export default function WorkspaceSettingsPage() {
  const { user, workspace, workspaces, workspaceId } = useAuthenticatedLayout();
  const role = normalizeWorkspaceRole(workspace.role);
  const canManage = canManageWorkspace(role);
  // ロール変更は owner のみ(backend でも同様に強制される)。
  const canChangeRoles = role === "owner";
  const workspaceList = useMemo(() => (Array.isArray(workspaces) ? workspaces : []), [workspaces]);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("viewer");
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setName(workspace.name);
    setDescription(workspace.description ?? "");
  }, [workspace.description, workspace.name, workspaceId]);

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
      setMembers(membersResult.members ?? []);
      setInvitations(invitationsResult.invitations ?? []);
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

  async function saveWorkspaceInfo() {
    if (!canManage) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setActionError("Workspace名を入力してください。");
      return;
    }
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    setJustSaved(false);
    setBusyAction("rename");
    setActionError(null);
    setMessage("");
    try {
      const updated = await updateWorkspace(workspaceId, {
        name: trimmedName,
        description: description.trim(),
      });
      setName(updated.name);
      setDescription(updated.description ?? "");
      // 保存完了が一瞬で分からないため、数秒間「保存しました」をボタンに表示する。
      setJustSaved(true);
      savedTimerRef.current = setTimeout(() => {
        setJustSaved(false);
        savedTimerRef.current = null;
      }, 2500);
    } catch (cause) {
      setActionError(errorMessage(cause) || "Workspace情報を更新できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  function requestInvite(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setActionError("招待するメールアドレスを入力してください。");
      return;
    }
    setActionError(null);
    setConfirmState({ type: "invite", email: trimmedEmail, role: inviteRole });
  }

  async function sendInvite(targetEmail: string, targetRole: InviteRole) {
    setConfirmState(null);
    setBusyAction("invite");
    setActionError(null);
    setMessage("");
    try {
      const invitation = await inviteWorkspaceMember(workspaceId, targetEmail, targetRole);
      setEmail("");
      setInviteRole("viewer");
      setInvitations((current) => [
        ...(current ?? []).filter((item) => item.id !== invitation.id),
        invitation,
      ]);
      setMessage(`${invitation.email} に招待メールを送信しました。リンクの有効期限は72時間です。`);
    } catch (cause) {
      setActionError(errorMessage(cause) || "招待メールを送信できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  async function revokeInvitation(invitation: WorkspaceInvitationDto) {
    setConfirmState(null);
    setBusyAction(`revoke:${invitation.id}`);
    setActionError(null);
    setMessage("");
    try {
      await revokeWorkspaceInvitation(workspaceId, invitation.id);
      setInvitations((current) => (current ?? []).filter((item) => item.id !== invitation.id));
      setMessage("招待を取り消しました。この招待リンクは使用できなくなりました。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "招待を取り消せませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  async function removeMember(member: WorkspaceMemberDto) {
    setConfirmState(null);
    setBusyAction(`remove:${member.user_id}`);
    setActionError(null);
    setMessage("");
    try {
      await removeWorkspaceMember(workspaceId, member.user_id);
      setMembers((current) => (current ?? []).filter((item) => item.user_id !== member.user_id));
      setMessage(
        `${member.display_name || member.email} を削除しました。以後このWorkspaceにはアクセスできません。`,
      );
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
      setMembers((current) =>
        (current ?? []).map((item) => (item.user_id === memberId ? member : item)),
      );
      setMessage("メンバー権限を更新しました。");
    } catch (cause) {
      setActionError(errorMessage(cause) || "メンバー権限を更新できませんでした。");
    } finally {
      setBusyAction("");
    }
  }

  const memberList = members ?? [];
  const invitationList = invitations ?? [];

  return (
    // 親レイアウト(main)が md:overflow-hidden のため、ページ側でスクロールを持つ。
    <div className="h-full min-h-0 md:overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-4">
        {/* 上部ヘッダー: ワークスペース名・ロール・メンバー数・招待中数 */}
        <section className="ds-surface rounded-(--ds-radius-panel) p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-(--text-muted)">Workspace設定</p>
              <h1 className="mt-1 truncate text-xl font-bold">{workspace.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RoleBadge role={role} />
                {role === "viewer" && <ViewerOnlyBadge />}
                <span className="text-xs text-(--text-muted)">
                  {user.displayName ?? user.email}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="メンバー" value={isLoading ? "-" : memberList.length} />
              <Metric label="招待中" value={isLoading ? "-" : invitationList.length} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {workspaceList.length > 1 &&
              workspaceList.map((item) => (
                <Link
                  className="rounded-(--ds-radius-control) border px-3 py-1.5 text-xs"
                  key={item.id}
                  to={workspacePath(item.id, "/meetings")}
                >
                  {item.name}
                </Link>
              ))}
            <Link
              className="rounded-(--ds-radius-control) border px-3 py-1.5 text-xs text-(--brand)"
              to="/workspaces"
            >
              ワークスペース一覧・新規作成
            </Link>
          </div>
        </section>

        {/* セクション1: 基本情報 */}
        <section className="ds-surface rounded-(--ds-radius-panel) p-6">
          <SectionTitle
            title="基本情報"
            subtitle={canManage ? "ワークスペース名と説明を編集できます。" : "閲覧のみ可能です。"}
          />
          <div className="mt-4 flex flex-col gap-3">
            <DsInput
              label="Workspace名"
              value={name}
              disabled={!canManage || busyAction === "rename"}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            <DsInput
              label="説明"
              value={description}
              disabled={!canManage || busyAction === "rename"}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
            {canManage && (
              <div className="flex justify-end">
                <DsButton
                  type="button"
                  disabled={busyAction === "rename" || justSaved}
                  onClick={saveWorkspaceInfo}
                >
                  {busyAction === "rename" ? "保存中..." : justSaved ? "✓ 保存しました" : "保存"}
                </DsButton>
              </div>
            )}
          </div>
        </section>

        {/* セクション2: メンバー */}
        <section className="ds-surface rounded-(--ds-radius-panel) p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle title="メンバー" subtitle="参加済みのメンバー一覧です。" />
            <DsButton type="button" variant="secondary" disabled={isLoading} onClick={loadSettings}>
              再読み込み
            </DsButton>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <EmptyLine>Workspaceメンバーを読み込んでいます...</EmptyLine>
            ) : loadError ? (
              <div className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
                {loadError}
              </div>
            ) : memberList.length === 0 ? (
              <EmptyLine>メンバーはまだ登録されていません。</EmptyLine>
            ) : (
              memberList.map((member) => {
                const memberRole = normalizeWorkspaceRole(member.role);
                const canEditMember =
                  canManage && memberRole !== "owner" && member.user_id !== user.id;
                const canEditMemberRole = canEditMember && canChangeRoles;
                return (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
                    key={member.user_id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {member.display_name || member.email}
                        {member.user_id === user.id && (
                          <span className="ml-2 text-[11px] font-normal text-(--text-muted)">
                            (自分)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-(--text-muted)">{member.email}</p>
                      {member.joined_at && (
                        <p className="text-[11px] text-(--text-muted)">
                          参加: {formatDateTime(member.joined_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditMemberRole ? (
                        <RoleSelect
                          value={memberRole === "admin" ? "admin" : "viewer"}
                          disabled={busyAction === `role:${member.user_id}`}
                          onChange={(nextRole) => changeMemberRole(member.user_id, nextRole)}
                        />
                      ) : (
                        <RoleBadge role={memberRole} />
                      )}
                      {canEditMember && (
                        <DsButton
                          type="button"
                          variant="secondary"
                          disabled={busyAction === `remove:${member.user_id}`}
                          onClick={() => setConfirmState({ type: "remove", member })}
                        >
                          {busyAction === `remove:${member.user_id}` ? "削除中..." : "削除"}
                        </DsButton>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* セクション3: 招待 (owner/admin のみ表示) */}
        {canManage && (
          <section className="ds-surface rounded-(--ds-radius-panel) p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle
                title="メールアドレスで招待"
                subtitle="招待されたユーザーは、メール内のリンクから Microsoft または Google アカウントでログインすると参加できます。ログイン時のメールアドレスが招待先メールアドレスと一致する必要があります。リンクの有効期限は72時間です。"
              />
              <span className="text-xs text-(--text-muted)">owner権限は招待できません</span>
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={requestInvite}
            >
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
                {busyAction === "invite" ? "送信中..." : "招待を送信"}
              </DsButton>
            </form>

            <div className="mt-5">
              <p className="text-sm font-semibold">招待中</p>
              <div className="mt-2">
                {isLoading ? (
                  <EmptyLine>招待を読み込んでいます...</EmptyLine>
                ) : invitationList.length === 0 ? (
                  <EmptyLine>招待中のメールアドレスはありません。</EmptyLine>
                ) : (
                  invitationList.map((item) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-0"
                      key={item.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.email}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                          <RoleBadge role={item.role} />
                          <InvitationStatusBadge status={item.status} />
                          {item.expires_at && <span>期限: {formatDateTime(item.expires_at)}</span>}
                          {item.invited_by_name && <span>招待者: {item.invited_by_name}</span>}
                        </p>
                      </div>
                      <DsButton
                        type="button"
                        variant="secondary"
                        disabled={busyAction === `revoke:${item.id}`}
                        onClick={() => setConfirmState({ type: "revoke", invitation: item })}
                      >
                        {busyAction === `revoke:${item.id}` ? "取消中..." : "取り消す"}
                      </DsButton>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {!canManage && (
          <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-(--text-muted)">
            閲覧者権限のため、Workspace情報・招待・メンバー権限は変更できません。
          </p>
        )}

        {(message || actionError) && (
          <p className={`text-sm ${actionError ? "text-red-600" : "text-(--brand)"}`}>
            {actionError || message}
          </p>
        )}

        {confirmState?.type === "invite" && (
          <ConfirmDialog
            title="招待メールの送信"
            confirmLabel="招待メールを送信"
            onCancel={() => setConfirmState(null)}
            onConfirm={() => sendInvite(confirmState.email, confirmState.role)}
            description={
              <div className="flex flex-col gap-2">
                <p>以下の相手をワークスペース「{workspace.name}」に招待します。</p>
                <div className="rounded-(--ds-radius-control) border px-3 py-2">
                  <p>
                    メールアドレス: <span className="font-semibold">{confirmState.email}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-2">
                    ロール: <RoleBadge role={confirmState.role} />
                  </p>
                </div>
                {confirmState.role === "admin" && (
                  <p className="rounded-(--ds-radius-control) border px-3 py-2 text-red-600">
                    admin は会議開始・Bot参加・会議終了などの操作ができます。本当に admin
                    として招待しますか？
                  </p>
                )}
                <p>この内容で招待メールを送信しますか？</p>
              </div>
            }
          />
        )}

        {confirmState?.type === "revoke" && (
          <ConfirmDialog
            title="招待の取り消し"
            confirmLabel="取り消す"
            onCancel={() => setConfirmState(null)}
            onConfirm={() => revokeInvitation(confirmState.invitation)}
            description={
              <p>
                {confirmState.invitation.email} への招待を取り消しますか？
                この招待リンクは使用できなくなります。
              </p>
            }
          />
        )}

        {confirmState?.type === "remove" && (
          <ConfirmDialog
            title="メンバーの削除"
            confirmLabel="削除する"
            onCancel={() => setConfirmState(null)}
            onConfirm={() => removeMember(confirmState.member)}
            description={
              <p>
                {confirmState.member.display_name || confirmState.member.email} をワークスペース「
                {workspace.name}
                」から削除しますか？削除後、このユーザーは会議・文字起こし・AI分析へアクセスできなくなります。
              </p>
            }
          />
        )}
      </div>
    </div>
  );
}

function SectionTitle({ subtitle, title }: { subtitle?: string; title: string }) {
  return (
    <div>
      <h2 className="font-bold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-(--text-muted)">{subtitle}</p>}
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-(--ds-radius-control) border px-4 py-2 text-center">
      <p className="text-[11px] text-(--text-muted)">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "";
}
