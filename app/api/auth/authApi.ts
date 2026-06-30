import { requestJson } from "~/api/core/apiClient";

export type BackendUser = {
  id: string;
  display_name: string;
  email: string;
  photoURL?: string | null;
  displayName?: string;
};

export type WorkspaceDto = {
  id: string;
  name: string;
  role: WorkspaceRole;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRole = "owner" | "admin" | "viewer" | "member";

export function normalizeWorkspaceRole(role: WorkspaceRole | string | undefined) {
  switch (role) {
    case "owner":
      return "owner";
    case "admin":
    case "member":
      return "admin";
    case "viewer":
      return "viewer";
    default:
      return "viewer";
  }
}

export function canManageMeetingSessions(role: WorkspaceRole | string | undefined) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function canManageWorkspace(role: WorkspaceRole | string | undefined) {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "owner" || normalized === "admin";
}

export type BackendSession = {
  user: BackendUser;
  workspaces: WorkspaceDto[];
  current_workspace_id: string;
  expires_at: string;
};

function normalizeSession(session: BackendSession): BackendSession {
  const workspaces = Array.isArray(session.workspaces)
    ? session.workspaces.map(normalizeWorkspaceDto)
    : [];
  return {
    ...session,
    workspaces,
    current_workspace_id: session.current_workspace_id || workspaces[0]?.id || "",
    user: {
      ...session.user,
      displayName: session.user.display_name,
      photoURL: null,
    },
  };
}

function normalizeWorkspaceDto(workspace: WorkspaceDto): WorkspaceDto {
  return {
    ...workspace,
    role: normalizeWorkspaceRole(workspace.role),
  };
}

export async function syncAuthLogin(idToken: string) {
  return normalizeSession(
    await requestJson<BackendSession>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    }),
  );
}

export async function fetchMe() {
  return normalizeSession(await requestJson<BackendSession>("/v1/auth/me"));
}

export async function logoutSession() {
  await requestJson<null>("/v1/auth/logout", { method: "POST" });
}

export async function setCurrentWorkspace(workspaceId: string) {
  await requestJson<null>("/v1/session/current-workspace", {
    method: "PUT",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}
