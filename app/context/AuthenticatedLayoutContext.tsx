import { createContext, useContext, type ReactNode } from "react";
import type { User } from "firebase/auth";

type AuthenticatedLayoutContextValue = {
  today: string;
  user: User;
  workspaceId: string;
};

const AuthenticatedLayoutContext = createContext<AuthenticatedLayoutContextValue | null>(null);

type AuthenticatedLayoutProviderProps = AuthenticatedLayoutContextValue & {
  children: ReactNode;
};

export function AuthenticatedLayoutProvider({
  children,
  today,
  user,
  workspaceId,
}: AuthenticatedLayoutProviderProps) {
  return (
    <AuthenticatedLayoutContext.Provider value={{ today, user, workspaceId }}>
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
