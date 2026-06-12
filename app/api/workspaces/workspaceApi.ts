import type { WorkspaceDto } from "~/api/auth/authApi";
import { requestJson } from "~/api/core/apiClient";

export type WorkspaceMemberDto = {
  workspace_id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: "owner" | "member";
  joined_at: string;
};

export type WorkspaceInvitationDto = {
  id: string;
  workspace_id: string;
  email: string;
  role: "member";
  status: "pending";
  created_at: string;
};

const workspaceBase = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}`;

export function updateWorkspaceName(workspaceId: string, name: string) {
  return requestJson<WorkspaceDto>(`${workspaceBase(workspaceId)}/`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function listWorkspaceMembers(workspaceId: string) {
  return requestJson<{ members: WorkspaceMemberDto[] }>(`${workspaceBase(workspaceId)}/members`);
}

export function listWorkspaceInvitations(workspaceId: string) {
  return requestJson<{ invitations: WorkspaceInvitationDto[] }>(
    `${workspaceBase(workspaceId)}/invitations`,
  );
}

export function inviteWorkspaceMember(workspaceId: string, email: string) {
  return requestJson<WorkspaceInvitationDto>(`${workspaceBase(workspaceId)}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function revokeWorkspaceInvitation(workspaceId: string, invitationId: string) {
  return requestJson<null>(
    `${workspaceBase(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export function removeWorkspaceMember(workspaceId: string, memberId: string) {
  return requestJson<null>(
    `${workspaceBase(workspaceId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
    },
  );
}
