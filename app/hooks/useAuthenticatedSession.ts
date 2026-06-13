import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { fetchMe, logoutSession, type BackendSession } from "~/api/auth/authApi";
import { signOutOfFirebase } from "~/api/firebase/firebaseAuthClient";

type AuthenticationStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export function useAuthenticatedSession() {
  const navigate = useNavigate();
  const [session, setSession] = useState<BackendSession | null>(null);
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
    fetchMe()
      .then((value) => {
        if (active) {
          setSession(value);
          setStatus("authenticated");
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const resolved = cause instanceof Error ? cause : new Error("Authentication failed");
        setError(resolved);
        setStatus(
          resolved.message.toLowerCase().includes("unauthorized") ? "unauthenticated" : "error",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function handleUnauthorized() {
      setSession(null);
      setStatus("unauthenticated");
      await signOutOfFirebase().catch(() => undefined);
    }
    window.addEventListener("deciscope:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("deciscope:unauthorized", handleUnauthorized);
  }, []);

  async function handleLogout() {
    try {
      await logoutSession();
    } finally {
      await signOutOfFirebase().catch(() => undefined);
      navigate("/");
    }
  }

  return { error, handleLogout, session, status, today, user: session?.user ?? null };
}
