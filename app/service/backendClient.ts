import { getCurrentIdToken } from "~/lib/firebase";

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

export type Segment = {
  meeting_id: string;
  seq: number;
  segment_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
  created_at: string;
};

export type RealtimeEvent = {
  type: string;
  meeting_id: string;
  seq?: number;
  ts_ms: number;
  payload: Record<string, unknown>;
};

export type Job = {
  id: string;
  type: string;
  status: string;
  meeting_id?: string;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  updated_at: string;
};

export type Report = {
  artifact_id: string;
  meeting_id: string;
  format: string;
  content: string;
  created_at: string;
};

export type Upload = {
  id: string;
  filename: string;
  media_type: string;
  path: string;
  job_id: string;
  created_at: string;
};

export type FixtureInfo = {
  name: string;
  path: string;
};

export type ReplayStatus = {
  meeting_id: string;
  fixture: string;
  status: string;
  started_at?: string;
};

export type JoinToken = {
  token: string;
  token_type: string;
  expires_at: string;
};

export type HealthResult = {
  status: string;
  time?: string;
};

export function apiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:9090");
}

export function wsBaseUrl() {
  return String(import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:9090");
}

export async function syncAuthLogin(idToken: string) {
  return requestJson<BackendLoginResult>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

export async function fetchMe() {
  return requestJson<Record<string, unknown>>("/v1/auth/me", {
    auth: true,
  });
}

export async function fetchV1Health() {
  return requestJson<HealthResult>("/v1/health");
}

export async function fetchAuthHealth() {
  return requestJson<Record<string, unknown>>("/v1/auth/health", {
    auth: true,
  });
}

export async function listMeetings() {
  return requestJson<{ meetings: Meeting[] }>("/v1/meetings");
}

export async function createMeeting(
  title = "Microsoft login demo meeting",
  source = "fixture_replay",
) {
  return requestJson<Meeting>("/v1/meetings", {
    method: "POST",
    body: JSON.stringify({ title, source }),
  });
}

export async function getMeeting(meetingId: string) {
  return requestJson<Meeting>(`/v1/meetings/${encodeURIComponent(meetingId)}`);
}

export async function createJoinToken(meetingId: string) {
  return requestJson<JoinToken>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/join-token`,
    { method: "POST" },
  );
}

export async function endMeeting(meetingId: string) {
  return requestJson<{ report: Report; events: RealtimeEvent[] }>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/end`,
    { method: "POST" },
  );
}

export async function listEvents(meetingId: string, afterSeq = 0) {
  const path = `/v1/meetings/${encodeURIComponent(meetingId)}/events?after_seq=${encodeURIComponent(String(afterSeq))}`;
  return requestJson<{ events: RealtimeEvent[] }>(path);
}

export async function listSegments(meetingId: string, afterSeq = 0) {
  const path = `/v1/meetings/${encodeURIComponent(meetingId)}/segments?after_seq=${encodeURIComponent(String(afterSeq))}`;
  return requestJson<{ segments: Segment[] }>(path);
}

export async function getReport(meetingId: string) {
  return requestJson<Report>(`/v1/meetings/${encodeURIComponent(meetingId)}/report`);
}

export async function getReportMarkdown(meetingId: string) {
  return requestText(`/v1/meetings/${encodeURIComponent(meetingId)}/report`, {
    headers: { Accept: "text/markdown" },
  });
}

export async function listFixtures() {
  return requestJson<{ fixture_dir: string; fixtures: FixtureInfo[] }>("/v1/fixtures");
}

export async function startReplay(meetingId: string, fixture = "demo.jsonl") {
  return requestJson<ReplayStatus>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/start`,
    {
      method: "POST",
      body: JSON.stringify({ fixture }),
    },
  );
}

export async function pauseReplay(meetingId: string) {
  return requestJson<ReplayStatus>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/pause`,
    { method: "POST" },
  );
}

export async function resumeReplay(meetingId: string) {
  return requestJson<ReplayStatus>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/resume`,
    { method: "POST" },
  );
}

export async function resetReplay(meetingId: string) {
  return requestJson<{ status: string }>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/reset`,
    { method: "POST" },
  );
}

export async function uploadFile(file: File) {
  const form = new FormData();
  form.set("file", file);
  return requestJson<{ upload: Upload; job: Job }>("/v1/uploads", {
    method: "POST",
    body: form,
  });
}

export async function getJob(jobId: string) {
  return requestJson<Job>(`/v1/jobs/${encodeURIComponent(jobId)}`);
}

export function realtimeUrl(meetingId: string, lastSeq = 0) {
  const url = new URL(`${wsBaseUrl()}/v1/realtime`);
  url.searchParams.set("meeting_id", meetingId);
  url.searchParams.set("last_seq", String(lastSeq));
  return url.toString();
}

export function connectRealtime(meetingId: string, lastSeq = 0) {
  return new WebSocket(realtimeUrl(meetingId, lastSeq));
}

async function requestJson<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const response = await requestRaw(path, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      payload?.error?.message ?? payload?.message ?? response.statusText;
    throw new Error(message);
  }
  return payload as T;
}

async function requestText(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<string> {
  const response = await requestRaw(path, options);
  const text = await response.text();
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = text ? JSON.parse(text) : null;
      message = payload?.error?.message ?? payload?.message ?? message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }
  return text;
}

async function requestRaw(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
) {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth) {
    const token = await getCurrentIdToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(`${apiBaseUrl()}${path}`, {
    ...options,
    headers,
  });
}

