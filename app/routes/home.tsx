import type { Route } from "./+types/home";
import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  createMeeting,
  fetchMe,
  realtimeUrl,
  startReplay,
  syncFirebaseLogin,
  type BackendLoginResult,
  type Meeting,
  type RealtimeEvent,
} from "../lib/api";
import {
  firebaseConfigStatus,
  getCurrentIdToken,
  onFirebaseUserChanged,
  signInWithGoogle,
  signOutOfFirebase,
} from "../lib/firebase";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "DeciScope" },
    { name: "description", content: "DeciScope local MVP" },
  ];
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [backendUser, setBackendUser] = useState<BackendLoginResult | null>(
    null,
  );
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);

  const config = useMemo(() => firebaseConfigStatus(), []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    if (!config.configured) {
      return;
    }

    onFirebaseUserChanged((nextUser) => {
      if (mounted) {
        setUser(nextUser);
      }
    })
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      mounted = false;
      unsubscribe?.();
      socketRef.current?.close();
    };
  }, [config.configured]);

  async function handleGoogleLogin() {
    setError(null);
    setStatus("Opening Google sign-in...");
    try {
      const signedInUser = await signInWithGoogle();
      setUser(signedInUser);
      const idToken = await signedInUser.getIdToken();
      setStatus("Verifying Firebase ID token with backend...");
      const result = await syncFirebaseLogin(idToken);
      setBackendUser(result);
      setStatus("Signed in");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Sign-in failed");
    }
  }

  async function handleLogout() {
    socketRef.current?.close();
    socketRef.current = null;
    setEvents([]);
    setMeeting(null);
    setBackendUser(null);
    await signOutOfFirebase();
    setStatus("Signed out");
  }

  async function handleCheckBackendAuth() {
    setError(null);
    try {
      const me = await fetchMe();
      setStatus(`Backend auth ok: ${String(me.uid ?? "unknown")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleStartDemo() {
    setError(null);
    setStatus("Creating meeting...");
    try {
      const created = await createMeeting();
      setMeeting(created);
      setEvents([]);
      lastSeqRef.current = 0;

      socketRef.current?.close();
      const ws = new WebSocket(realtimeUrl(created.id, lastSeqRef.current));
      socketRef.current = ws;

      ws.onopen = async () => {
        const idToken = await getCurrentIdToken();
        ws.send(
          JSON.stringify({
            type: "client.hello",
            meeting_id: created.id,
            last_seq: lastSeqRef.current,
            auth_token_present: Boolean(idToken),
          }),
        );
        setStatus("Starting fixture replay...");
        await startReplay(created.id);
      };

      ws.onmessage = (message) => {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.seq) {
          lastSeqRef.current = Math.max(lastSeqRef.current, event.seq);
        }
        setEvents((current) => [...current.slice(-24), event]);
      };

      ws.onerror = () => {
        setError("WebSocket connection failed.");
      };

      ws.onclose = () => {
        setStatus("Realtime connection closed");
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Demo failed");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">
              DeciScope local MVP
            </p>
            <h1 className="text-3xl font-semibold tracking-normal">
              Googleログイン接続確認
            </h1>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
            {status}
          </div>
        </header>

        {!config.configured && (
          <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Firebase Web設定が未設定です。</p>
            <p className="mt-1">
              `deciscope-web/.env.local` に不足している値を追加してください:
              {` ${config.missing.join(", ")}`}
            </p>
          </section>
        )}

        {error && (
          <section className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-950">
            {error}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-[360px_1fr]">
          <aside className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Authentication</h2>
            <div className="mt-4 flex flex-col gap-3">
              {user ? (
                <>
                  <div className="flex items-center gap-3 rounded-md bg-zinc-50 p-3">
                    {user.photoURL && (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="h-10 w-10 rounded-full"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {user.displayName ?? "Google user"}
                      </p>
                      <p className="truncate text-sm text-zinc-600">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckBackendAuth}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Backend認証を確認
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium"
                  >
                    ログアウト
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={!config.configured}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  Googleでログイン
                </button>
              )}
            </div>

            {backendUser && (
              <dl className="mt-5 space-y-2 text-sm">
                <div>
                  <dt className="font-medium text-zinc-600">Backend status</dt>
                  <dd>{backendUser.status}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-600">UID</dt>
                  <dd className="break-all">{backendUser.uid}</dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-600">User store</dt>
                  <dd>{backendUser.user_store ?? "sqlite"}</dd>
                </div>
              </dl>
            )}
          </aside>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Realtime demo</h2>
                <p className="text-sm text-zinc-600">
                  ログイン後、fixture会議を作成してWebSocketイベントを表示します。
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartDemo}
                disabled={!user}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                デモ会議を開始
              </button>
            </div>

            {meeting && (
              <div className="mt-4 rounded-md bg-zinc-50 p-3 text-sm">
                <span className="font-medium">{meeting.title}</span>
                <span className="ml-2 text-zinc-600">{meeting.id}</span>
              </div>
            )}

            <div className="mt-4 h-[420px] overflow-auto rounded-md border border-zinc-200 bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
              {events.length === 0 ? (
                <p className="text-zinc-500">No realtime events yet.</p>
              ) : (
                events.map((event, index) => (
                  <pre
                    key={`${event.type}-${event.seq ?? "partial"}-${index}`}
                    className="mb-3 whitespace-pre-wrap rounded bg-zinc-900 p-3"
                  >
                    {JSON.stringify(event, null, 2)}
                  </pre>
                ))
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
