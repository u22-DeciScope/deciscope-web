import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceName,
  type WorkspaceInvitationDto,
  type WorkspaceMemberDto,
} from "~/api/workspaces/workspaceApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";

export default function WorkspaceSettingsPage() {
  const { user, workspace, workspaces, workspaceId } = useAuthenticatedLayout();
  const [name, setName] = useState(workspace.name);
  const [email, setEmail] = useState("");
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationDto[]>([]);
  const [message, setMessage] = useState("");
  const owner = workspace.role === "owner";

  useEffect(() => {
    listWorkspaceMembers(workspaceId).then((result) => setMembers(result.members));
    if (owner) {
      listWorkspaceInvitations(workspaceId).then((result) => setInvitations(result.invitations));
    }
  }, [owner, workspaceId]);

  async function saveName() {
    await updateWorkspaceName(workspaceId, name);
    setMessage("Workspace名を更新しました。");
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const invitation = await inviteWorkspaceMember(workspaceId, email);
    setInvitations((current) => [...current, invitation]);
    setEmail("");
    setMessage("招待を登録しました。対象メールアドレスでの次回ログイン時に参加します。");
  }

  async function revokeInvitation(invitationId: string) {
    await revokeWorkspaceInvitation(workspaceId, invitationId);
    setInvitations((current) => current.filter((item) => item.id !== invitationId));
  }

  async function removeMember(memberId: string) {
    await removeWorkspaceMember(workspaceId, memberId);
    setMembers((current) => current.filter((item) => item.user_id !== memberId));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="ds-surface rounded-(--ds-radius-panel) p-5">
        <h1 className="mb-4 text-lg font-bold">Workspace設定</h1>
        <div className="flex gap-2">
          <div className="flex-1">
            <DsInput
              label="Workspace名"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </div>
          {owner && <DsButton onClick={saveName}>変更</DsButton>}
        </div>
        <p className="mt-2 text-xs text-(--text-muted)">Workspaceコード: {workspaceId}</p>
        {workspaces.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {workspaces.map((item) => (
              <Link
                className="rounded-(--ds-radius-control) border px-3 py-2 text-sm"
                key={item.id}
                to={`/w/${encodeURIComponent(item.id)}/meetings`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {owner && (
        <form className="ds-surface rounded-(--ds-radius-panel) p-5" onSubmit={invite}>
          <h2 className="mb-4 font-bold">メールアドレスで招待</h2>
          <div className="flex gap-2">
            <div className="flex-1">
              <DsInput
                label="メールアドレス"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
            </div>
            <DsButton type="submit">招待</DsButton>
          </div>
          {invitations.map((item) => (
            <div className="mt-2 flex items-center justify-between text-sm" key={item.id}>
              <span>{item.email} (招待中)</span>
              <DsButton type="button" variant="secondary" onClick={() => revokeInvitation(item.id)}>
                取消
              </DsButton>
            </div>
          ))}
        </form>
      )}

      <section className="ds-surface rounded-(--ds-radius-panel) p-5">
        <h2 className="mb-4 font-bold">メンバー</h2>
        {members.map((member) => (
          <div className="flex justify-between border-b py-3 last:border-0" key={member.user_id}>
            <span>
              {member.display_name}{" "}
              <span className="text-xs text-(--text-muted)">{member.email}</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm">{member.role}</span>
              {owner && member.role !== "owner" && member.user_id !== user.id && (
                <DsButton
                  type="button"
                  variant="secondary"
                  onClick={() => removeMember(member.user_id)}
                >
                  削除
                </DsButton>
              )}
            </div>
          </div>
        ))}
      </section>
      {message && <p className="text-sm text-(--brand)">{message}</p>}
    </div>
  );
}
