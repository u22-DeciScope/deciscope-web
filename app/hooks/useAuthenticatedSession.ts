import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { fetchMe, logoutSession, type BackendSession } from "~/api/auth/authApi";
import { signOutOfFirebase } from "~/api/firebase/firebaseAuthClient";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

type AuthenticationStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export function useAuthenticatedSession() {
  const navigate = useNavigate();
  const location = useLocation();
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
    meetingStartDebug("auth-guard", "fetchMe started", { route: location.pathname });
    fetchMe()
      .then((value) => {
        if (active) {
          setSession(value);
          setStatus("authenticated");
          meetingStartDebug("auth-guard", "fetchMe succeeded", {
            route: location.pathname,
            workspaceCount: value.workspaces.length,
          });
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const resolved = cause instanceof Error ? cause : new Error("Authentication failed");
        setError(resolved);
        const nextStatus = resolved.message.toLowerCase().includes("unauthorized")
          ? "unauthenticated"
          : "error";
        setStatus(nextStatus);
        meetingStartDebug("auth-guard", "fetchMe failed", {
          route: location.pathname,
          status: nextStatus,
          message: resolved.message,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function handleUnauthorized() {
      setSession(null);
      setStatus("unauthenticated");
      meetingStartDebug("auth-guard", "unauthorized event received", { route: location.pathname });
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
