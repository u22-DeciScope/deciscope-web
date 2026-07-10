import { useState } from "react";
import { useNavigate } from "react-router";
import { syncAuthLogin } from "~/api/auth/authApi";
import {
  signInWithGoogle,
  signInWithMicrosoft,
  signOutOfFirebase,
} from "~/api/firebase/firebaseAuthClient";
import { notifyAuthenticatedSessionChanged } from "~/hooks/useAuthenticatedSession";

export type AuthProviderKind = "microsoft" | "google";

interface UseFirebaseAuthFlowOptions {
  redirectTo: string;
  fallbackMessage: string;
}

// Microsoft / Google 共通の Firebase ログインフロー。
// ログイン成功後の backend 同期・セッション更新・リダイレクトはプロバイダに依存しない。
export function useFirebaseAuthFlow({ redirectTo, fallbackMessage }: UseFirebaseAuthFlowOptions) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<AuthProviderKind | null>(null);

  async function signIn(provider: AuthProviderKind) {
    setError(null);
    setPendingProvider(provider);
    try {
      const user = provider === "google" ? await signInWithGoogle() : await signInWithMicrosoft();
      const idToken = await user.getIdToken();
      const session = await syncAuthLogin(idToken);
      notifyAuthenticatedSessionChanged(session);
      navigate(redirectTo);
    } catch (err) {
      await signOutOfFirebase().catch(() => undefined);
      setError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setPendingProvider(null);
    }
  }

  return {
    error,
    isPending: pendingProvider !== null,
    pendingProvider,
    signInMicrosoft: () => signIn("microsoft"),
    signInGoogle: () => signIn("google"),
  };
}
