import { useState } from "react";
import { useNavigate } from "react-router";
import { syncAuthLogin } from "~/service/backendClient";
import { signInWithMicrosoft } from "~/lib/firebase";

interface UseMicrosoftAuthFlowOptions {
  redirectTo: string;
  fallbackMessage: string;
}

export function useMicrosoftAuthFlow({
  redirectTo,
  fallbackMessage,
}: UseMicrosoftAuthFlowOptions) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function signIn() {
    setError(null);
    setIsPending(true);
    try {
      const user = await signInWithMicrosoft();
      const idToken = await user.getIdToken();
      await syncAuthLogin(idToken);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
    } finally {
      setIsPending(false);
    }
  }

  return { error, isPending, signIn };
}
