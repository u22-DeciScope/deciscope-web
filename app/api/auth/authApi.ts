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
  role: "owner" | "member";
  created_at: string;
  updated_at: string;
};

export type BackendSession = {
  user: BackendUser;
  workspaces: WorkspaceDto[];
  current_workspace_id: string;
  expires_at: string;
};

function normalizeSession(session: BackendSession): BackendSession {
  return {
    ...session,
    user: {
      ...session.user,
      displayName: session.user.display_name,
      photoURL: null,
    },
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
