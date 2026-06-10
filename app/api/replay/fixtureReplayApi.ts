import { requestJson } from "~/api/core/apiClient";

export type FixtureInfoDto = {
  name: string;
  path: string;
};

export type FixtureReplayStatusDto = {
  meeting_id: string;
  fixture: string;
  status: string;
  started_at?: string;
};

export async function listReplayFixtures() {
  return requestJson<{ fixture_dir: string; fixtures: FixtureInfoDto[] }>("/v1/fixtures");
}

export async function startFixtureReplay(meetingId: string, fixture: string) {
  return requestJson<FixtureReplayStatusDto>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/start`,
    {
      method: "POST",
      body: JSON.stringify({ fixture }),
    },
  );
}

export async function pauseFixtureReplay(meetingId: string) {
  return requestJson<FixtureReplayStatusDto>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/pause`,
    { method: "POST" },
  );
}

export async function resumeFixtureReplay(meetingId: string) {
  return requestJson<FixtureReplayStatusDto>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/resume`,
    { method: "POST" },
  );
}

export async function resetFixtureReplay(meetingId: string) {
  return requestJson<{ status: string }>(
    `/v1/meetings/${encodeURIComponent(meetingId)}/replay/reset`,
    { method: "POST" },
  );
}
