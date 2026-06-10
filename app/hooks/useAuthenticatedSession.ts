import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { User } from "firebase/auth";
import { onFirebaseUserChanged, signOutOfFirebase } from "~/api/firebase/firebaseAuthClient";

type AuthenticationStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export function useAuthenticatedSession() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthenticationStatus>("loading");
  const [error, setError] = useState<Error | null>(null);

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    onFirebaseUserChanged((currentUser) => {
      if (!active) {
        return;
      }
      setUser(currentUser);
      setStatus(currentUser ? "authenticated" : "unauthenticated");
    })
      .then((cleanup) => {
        if (active) {
          unsubscribe = cleanup;
        } else {
          cleanup();
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setError(cause instanceof Error ? cause : new Error("認証状態を確認できませんでした。"));
        setStatus("error");
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function handleLogout() {
    await signOutOfFirebase();
    navigate("/login");
  }

  return { error, handleLogout, status, today, user };
}
