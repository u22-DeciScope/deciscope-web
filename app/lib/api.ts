import { getCurrentIdToken } from "./firebase";

export type BackendLoginResult = {
  status: string;
  uid?: string;
  id?: number;
  email?: string;
  name?: string;
  auth_provider?: string;
  user_store?: string;
};

export type Meeting = {
  id: string;
  title: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  ended_at?: string;
};

export type RealtimeEvent = {
  type: string;
  meeting_id: string;
  seq?: number;
  ts_ms: number;
  payload: Record<string, unknown>;
};

export function apiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080");
}

export function wsBaseUrl() {
  return String(import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8080");
}

export async function syncFirebaseLogin(idToken: string) {
  return request<BackendLoginResult>("/login", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

export async function fetchMe() {
  return request<Record<string, unknown>>("/api/me", {
    auth: true,
  });
}

export async function createMeeting(title = "Microsoft login demo meeting") {
  return request<Meeting>("/v1/meetings", {
    method: "POST",
    body: JSON.stringify({ title, source: "fixture_replay" }),
  });
}

export async function startReplay(meetingId: string, fixture = "demo.jsonl") {
  return request<Record<string, unknown>>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/start`,
    {
      method: "POST",
      body: JSON.stringify({ fixture }),
    },
  );
}

export function realtimeUrl(meetingId: string, lastSeq = 0) {
  const url = new URL(`${wsBaseUrl()}/v1/realtime`);
  url.searchParams.set("meeting_id", meetingId);
  url.searchParams.set("last_seq", String(lastSeq));
  return url.toString();
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth) {
    const token = await getCurrentIdToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      payload?.error?.message ?? payload?.message ?? response.statusText;
    throw new Error(message);
  }
  return payload as T;
}
