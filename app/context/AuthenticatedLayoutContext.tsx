import { createContext, useContext, type ReactNode } from "react";
import type { BackendUser, WorkspaceDto } from "~/api/auth/authApi";

type AuthenticatedLayoutContextValue = {
  logout: () => void | Promise<void>;
  today: string;
  user: BackendUser;
  workspace: WorkspaceDto;
  workspaces: WorkspaceDto[];
  workspaceId: string;
};

const AuthenticatedLayoutContext = createContext<AuthenticatedLayoutContextValue | null>(null);

type AuthenticatedLayoutProviderProps = AuthenticatedLayoutContextValue & {
  children: ReactNode;
};

export function AuthenticatedLayoutProvider({
  children,
  logout,
  today,
  user,
  workspaceId,
  workspace,
  workspaces,
}: AuthenticatedLayoutProviderProps) {
  return (
    <AuthenticatedLayoutContext.Provider
      value={{ logout, today, user, workspace, workspaces, workspaceId }}
    >
      {children}
    </AuthenticatedLayoutContext.Provider>
  );
}

export function useAuthenticatedLayout() {
  const context = useContext(AuthenticatedLayoutContext);
  if (!context) {
    throw new Error("useAuthenticatedLayout must be used within AuthenticatedLayoutProvider");
  }
  return context;
}
