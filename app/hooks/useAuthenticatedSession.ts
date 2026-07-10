import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { ApiError } from "~/api/core/apiClient";
import { fetchMe, logoutSession, type BackendSession } from "~/api/auth/authApi";
import { signOutOfFirebase } from "~/api/firebase/firebaseAuthClient";
import { meetingStartDebug } from "~/utils/meetingStartDebug";
import { performSecureLogout } from "~/utils/secureLogout";

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
const authenticationClearedStorageKey = "deciscope.authentication-cleared";

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
  const authenticationGenerationRef = useRef(0);
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const clearLocalAuthentication = useCallback(() => {
    authenticationGenerationRef.current += 1;
    cachedBackendSession = null;
    setSession(null);
    setStatus("unauthenticated");
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    const generation = authenticationGenerationRef.current;
    meetingStartDebug("auth-guard", "fetchMe started", {
      route: location.pathname,
      hadCachedSession: Boolean(cachedBackendSession),
    });
    fetchMe()
      .then((value) => {
        if (active && authenticationGenerationRef.current === generation) {
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
        if (!active || authenticationGenerationRef.current !== generation) return;
        const resolved = cause instanceof Error ? cause : new Error("Authentication failed");
        setError(resolved);
        const nextStatus =
          (resolved instanceof ApiError && resolved.status === 401) ||
          resolved.message.toLowerCase().includes("unauthorized")
            ? "unauthenticated"
            : "error";
        if (nextStatus === "unauthenticated") {
          clearLocalAuthentication();
        } else {
          setStatus(nextStatus);
        }
        meetingStartDebug("auth-guard", "fetchMe failed", {
          route: location.pathname,
          status: nextStatus,
          message: resolved.message,
        });
      });
    return () => {
      active = false;
    };
  }, [clearLocalAuthentication]);

  useEffect(() => {
    async function handleUnauthorized() {
      clearLocalAuthentication();
      notifyAuthenticationCleared();
      meetingStartDebug("auth-guard", "unauthorized event received", { route: location.pathname });
      await signOutOfFirebase().catch(() => undefined);
    }
    window.addEventListener("deciscope:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("deciscope:unauthorized", handleUnauthorized);
  }, [clearLocalAuthentication, location.pathname]);

  useEffect(() => {
    function handleAuthenticationCleared(event: StorageEvent) {
      if (event.key === authenticationClearedStorageKey) {
        clearLocalAuthentication();
        void signOutOfFirebase().catch(() => undefined);
      }
    }
    window.addEventListener("storage", handleAuthenticationCleared);
    return () => window.removeEventListener("storage", handleAuthenticationCleared);
  }, [clearLocalAuthentication]);

  useEffect(() => {
    function handleAuthenticatedSessionChanged(event: Event) {
      const nextSession = (event as CustomEvent<BackendSession>).detail;
      if (!nextSession) {
        return;
      }
      cachedBackendSession = nextSession;
      authenticationGenerationRef.current += 1;
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

  useEffect(() => {
    if (status !== "authenticated" || !session?.expires_at) {
      return;
    }
    const expiresAtMs = Date.parse(session.expires_at);
    if (Number.isNaN(expiresAtMs)) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const scheduleExpiration = () => {
      const remainingMs = expiresAtMs - Date.now() + 1000;
      if (remainingMs <= 0) {
        clearLocalAuthentication();
        notifyAuthenticationCleared();
        void signOutOfFirebase().catch(() => undefined);
        return;
      }
      timer = setTimeout(scheduleExpiration, Math.min(remainingMs, 2_147_000_000));
    };
    scheduleExpiration();
    return () => clearTimeout(timer);
  }, [clearLocalAuthentication, session?.expires_at, status]);

  async function handleLogout() {
    await performSecureLogout({
      clearLocalAuthentication,
      notifyOtherTabs: notifyAuthenticationCleared,
      navigateAway: () => navigate("/", { replace: true }),
      logoutBackend: logoutSession,
      signOutIdentityProvider: signOutOfFirebase,
    });
  }

  const value = useMemo(
    () => ({ error, handleLogout, session, status, today, user: session?.user ?? null }),
    [error, session, status, today],
  );

  return createElement(AuthenticatedSessionContext.Provider, { value }, children);
}

function notifyAuthenticationCleared() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(authenticationClearedStorageKey, `${Date.now()}-${Math.random()}`);
  } catch {
    // localStorageが利用できない場合も、このタブのstate破棄は完了している。
  }
}

export function useAuthenticatedSession() {
  const context = useContext(AuthenticatedSessionContext);
  if (!context) {
    throw new Error("useAuthenticatedSession must be used within AuthenticatedSessionProvider");
  }
  return context;
}
