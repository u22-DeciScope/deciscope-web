import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { fetchMe, logoutSession, type BackendSession } from "~/api/auth/authApi";
import { signOutOfFirebase } from "~/api/firebase/firebaseAuthClient";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

type AuthenticationStatus = "loading" | "authenticated" | "unauthenticated" | "error";

let cachedBackendSession: BackendSession | null = null;

type AuthenticatedSessionContextValue = {
  error: Error | null;
  handleLogout: () => Promise<void>;
  session: BackendSession | null;
  status: AuthenticationStatus;
  today: string;
  user: BackendSession["user"] | null;
};

const AuthenticatedSessionContext = createContext<AuthenticatedSessionContextValue | null>(null);
const authenticatedSessionChangedEvent = "deciscope:authenticated-session-changed";

export function notifyAuthenticatedSessionChanged(session: BackendSession) {
  cachedBackendSession = session;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(authenticatedSessionChangedEvent, {
        detail: session,
      }),
    );
  }
}

export function AuthenticatedSessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<BackendSession | null>(cachedBackendSession);
  const [status, setStatus] = useState<AuthenticationStatus>(
    cachedBackendSession ? "authenticated" : "loading",
  );
  const [error, setError] = useState<Error | null>(null);
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  useEffect(() => {
    let active = true;
    meetingStartDebug("auth-guard", "fetchMe started", {
      route: location.pathname,
      hadCachedSession: Boolean(cachedBackendSession),
    });
    fetchMe()
      .then((value) => {
        if (active) {
          cachedBackendSession = value;
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
        if (nextStatus === "unauthenticated" && cachedBackendSession) {
          setSession(cachedBackendSession);
          setStatus("authenticated");
          meetingStartDebug("auth-guard", "stale unauthenticated fetch ignored", {
            route: location.pathname,
          });
          return;
        }
        if (nextStatus === "unauthenticated") {
          cachedBackendSession = null;
          setSession(null);
        }
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
      cachedBackendSession = null;
      setSession(null);
      setStatus("unauthenticated");
      meetingStartDebug("auth-guard", "unauthorized event received", { route: location.pathname });
      await signOutOfFirebase().catch(() => undefined);
    }
    window.addEventListener("deciscope:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("deciscope:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    function handleAuthenticatedSessionChanged(event: Event) {
      const nextSession = (event as CustomEvent<BackendSession>).detail;
      if (!nextSession) {
        return;
      }
      cachedBackendSession = nextSession;
      setSession(nextSession);
      setStatus("authenticated");
      setError(null);
      meetingStartDebug("auth-guard", "authenticated session changed", {
        route: location.pathname,
        workspaceCount: nextSession.workspaces.length,
      });
    }
    window.addEventListener(authenticatedSessionChangedEvent, handleAuthenticatedSessionChanged);
    return () =>
      window.removeEventListener(
        authenticatedSessionChangedEvent,
        handleAuthenticatedSessionChanged,
      );
  }, [location.pathname]);

  async function handleLogout() {
    try {
      await logoutSession();
    } finally {
      cachedBackendSession = null;
      await signOutOfFirebase().catch(() => undefined);
      navigate("/");
    }
  }

  const value = useMemo(
    () => ({ error, handleLogout, session, status, today, user: session?.user ?? null }),
    [error, session, status, today],
  );

  return createElement(AuthenticatedSessionContext.Provider, { value }, children);
}

export function useAuthenticatedSession() {
  const context = useContext(AuthenticatedSessionContext);
  if (!context) {
    throw new Error("useAuthenticatedSession must be used within AuthenticatedSessionProvider");
  }
  return context;
}
