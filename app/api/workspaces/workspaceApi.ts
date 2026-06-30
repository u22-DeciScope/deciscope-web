import { normalizeWorkspaceRole, type WorkspaceDto, type WorkspaceRole } from "~/api/auth/authApi";
import { requestJson } from "~/api/core/apiClient";

export type WorkspaceMemberDto = {
  workspace_id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: WorkspaceRole;
  joined_at: string;
};

export type WorkspaceInvitationDto = {
  id: string;
  workspace_id: string;
  email: string;
  role: Extract<WorkspaceRole, "admin" | "viewer">;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
};

const workspaceBase = (workspaceId: string) => `/v1/workspaces/${encodeURIComponent(workspaceId)}`;

export async function updateWorkspaceName(workspaceId: string, name: string) {
  const payload = await requestJson<unknown>(`${workspaceBase(workspaceId)}/`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return normalizeWorkspace(payload);
}

export async function listWorkspaceMembers(workspaceId: string) {
  const payload = await requestJson<unknown>(`${workspaceBase(workspaceId)}/members`);
  return {
    members: extractArray(payload, "members").map(normalizeMember).filter(isWorkspaceMember),
  };
}

export async function listWorkspaceInvitations(workspaceId: string) {
  const payload = await requestJson<unknown>(`${workspaceBase(workspaceId)}/invitations`);
  return {
    invitations: extractArray(payload, "invitations").map(normalizeInvitation).filter(Boolean),
  };
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role: Extract<WorkspaceRole, "admin" | "viewer"> = "viewer",
) {
  const payload = await requestJson<unknown>(`${workspaceBase(workspaceId)}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return normalizeInvitation(payload);
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  memberId: string,
  role: Extract<WorkspaceRole, "admin" | "viewer">,
) {
  const payload = await requestJson<unknown>(
    `${workspaceBase(workspaceId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );
  const member = normalizeMember(payload);
  if (!member) {
    throw new Error("Workspaceメンバーレスポンスを解析できませんでした。");
  }
  return member;
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

function normalizeWorkspace(payload: unknown): WorkspaceDto {
  if (!payload || typeof payload !== "object") {
    throw new Error("Workspaceレスポンスを解析できませんでした。");
  }
  const source = payload as Record<string, unknown>;
  const id = optionalString(source.id);
  const name = optionalString(source.name);
  if (!id || !name) {
    throw new Error("Workspaceレスポンスを解析できませんでした。");
  }
  return {
    id,
    name,
    role: normalizeWorkspaceRole(optionalString(source.role)),
    created_at: optionalString(source.created_at) ?? optionalString(source.createdAt) ?? "",
    updated_at: optionalString(source.updated_at) ?? optionalString(source.updatedAt) ?? "",
  };
}

function normalizeMember(payload: unknown): WorkspaceMemberDto | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const source = payload as Record<string, unknown>;
  const workspaceId = optionalString(source.workspace_id) ?? optionalString(source.workspaceId);
  const userId = optionalString(source.user_id) ?? optionalString(source.userId);
  if (!workspaceId || !userId) {
    return null;
  }
  return {
    workspace_id: workspaceId,
    user_id: userId,
    display_name: optionalString(source.display_name) ?? optionalString(source.displayName) ?? "",
    email: optionalString(source.email) ?? "",
    role: normalizeWorkspaceRole(optionalString(source.role)),
    joined_at: optionalString(source.joined_at) ?? optionalString(source.joinedAt) ?? "",
  };
}

function isWorkspaceMember(value: WorkspaceMemberDto | null): value is WorkspaceMemberDto {
  return Boolean(value);
}

function normalizeInvitation(payload: unknown): WorkspaceInvitationDto {
  if (!payload || typeof payload !== "object") {
    throw new Error("Workspace招待レスポンスを解析できませんでした。");
  }
  const source = payload as Record<string, unknown>;
  const id = optionalString(source.id);
  const workspaceId = optionalString(source.workspace_id) ?? optionalString(source.workspaceId);
  const email = optionalString(source.email);
  if (!id || !workspaceId || !email) {
    throw new Error("Workspace招待レスポンスを解析できませんでした。");
  }
  return {
    id,
    workspace_id: workspaceId,
    email,
    role: invitationRole(optionalString(source.role)),
    status: invitationStatus(optionalString(source.status)),
    created_at: optionalString(source.created_at) ?? optionalString(source.createdAt) ?? "",
  };
}

function extractArray(payload: unknown, key: string) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const source = payload as Record<string, unknown>;
  const value = source[key];
  return Array.isArray(value) ? value : [];
}

function invitationRole(role: string | undefined): Extract<WorkspaceRole, "admin" | "viewer"> {
  return normalizeWorkspaceRole(role) === "admin" ? "admin" : "viewer";
}

function invitationStatus(value: string | undefined): WorkspaceInvitationDto["status"] {
  return value === "accepted" || value === "revoked" ? value : "pending";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
