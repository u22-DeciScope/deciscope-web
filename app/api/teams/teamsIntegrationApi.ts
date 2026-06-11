// Teams 連携のフロントエンド用モックAPI。
// 実際の Microsoft Graph / Bot 連携は Phase3 で別サービス(Media Adapter)経由になる想定。
// それまでは localStorage に状態を持ち、バックエンドと同じ非同期インターフェースで振る舞う。

export type TeamsAdminConsentStatus = "not_requested" | "pending" | "granted";

export type TeamsIntegrationStatusDto = {
  connected: boolean;
  account_name?: string;
  account_email?: string;
  tenant_name?: string;
  tenant_id?: string;
  admin_consent: TeamsAdminConsentStatus;
  connected_at?: string;
};

export type TeamsBotStatus = "none" | "scheduled" | "joining" | "in_meeting" | "left";

export type TeamsUpcomingMeetingDto = {
  id: string;
  subject: string;
  organizer: string;
  start_at: string;
  end_at: string;
  participant_count: number;
  join_url: string;
  bot_status: TeamsBotStatus;
};

type TeamsMockState = {
  status: TeamsIntegrationStatusDto;
  scheduledMeetingIds: string[];
};

const STORAGE_KEY = "deciscope.teamsIntegration.mock.v1";
const MOCK_LATENCY_MS = 350;

const disconnectedStatus: TeamsIntegrationStatusDto = {
  connected: false,
  admin_consent: "not_requested",
};

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function loadState(): TeamsMockState {
  if (typeof window === "undefined") {
    return { status: disconnectedStatus, scheduledMeetingIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { status: disconnectedStatus, scheduledMeetingIds: [] };
    }
    const parsed = JSON.parse(raw) as Partial<TeamsMockState>;
    return {
      status: parsed.status ?? disconnectedStatus,
      scheduledMeetingIds: parsed.scheduledMeetingIds ?? [],
    };
  } catch {
    return { status: disconnectedStatus, scheduledMeetingIds: [] };
  }
}

function saveState(state: TeamsMockState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function getTeamsIntegrationStatus(): Promise<TeamsIntegrationStatusDto> {
  await delay(MOCK_LATENCY_MS);
  return loadState().status;
}

export async function connectTeamsIntegration(): Promise<TeamsIntegrationStatusDto> {
  await delay(MOCK_LATENCY_MS * 2);
  const state = loadState();
  state.status = {
    connected: true,
    account_name: "デモ ユーザー",
    account_email: "demo.user@contoso.example",
    tenant_name: "Contoso (デモテナント)",
    tenant_id: "00000000-0000-0000-0000-0000demo0000",
    admin_consent: state.status.admin_consent === "granted" ? "granted" : "not_requested",
    connected_at: new Date().toISOString(),
  };
  saveState(state);
  return state.status;
}

export async function disconnectTeamsIntegration(): Promise<TeamsIntegrationStatusDto> {
  await delay(MOCK_LATENCY_MS);
  const state: TeamsMockState = { status: disconnectedStatus, scheduledMeetingIds: [] };
  saveState(state);
  return state.status;
}

export async function requestTeamsAdminConsent(): Promise<TeamsIntegrationStatusDto> {
  await delay(MOCK_LATENCY_MS * 2);
  const state = loadState();
  if (!state.status.connected) {
    throw new Error("先に Microsoft アカウントを接続してください。");
  }
  // モックでは即時に同意済みへ遷移させる。実装時は同意URLへのリダイレクト+コールバック待ちになる。
  state.status = { ...state.status, admin_consent: "granted" };
  saveState(state);
  return state.status;
}

export async function listUpcomingTeamsMeetings(): Promise<{
  meetings: TeamsUpcomingMeetingDto[];
}> {
  await delay(MOCK_LATENCY_MS);
  const state = loadState();
  if (!state.status.connected) {
    throw new Error("Teams 連携が未接続です。");
  }
  const meetings = buildMockUpcomingMeetings().map((meeting) => ({
    ...meeting,
    bot_status: state.scheduledMeetingIds.includes(meeting.id)
      ? ("scheduled" as const)
      : ("none" as const),
  }));
  return { meetings };
}

export async function scheduleBotForMeeting(meetingId: string): Promise<void> {
  await delay(MOCK_LATENCY_MS);
  const state = loadState();
  if (!state.scheduledMeetingIds.includes(meetingId)) {
    state.scheduledMeetingIds.push(meetingId);
  }
  saveState(state);
}

export async function cancelBotForMeeting(meetingId: string): Promise<void> {
  await delay(MOCK_LATENCY_MS);
  const state = loadState();
  state.scheduledMeetingIds = state.scheduledMeetingIds.filter((id) => id !== meetingId);
  saveState(state);
}

const TEAMS_JOIN_URL_HOSTS = ["teams.microsoft.com", "teams.live.com"];

export function validateTeamsJoinUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Teams 会議リンクを入力してください。";
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "URL の形式が正しくありません。";
  }
  const hostMatches = TEAMS_JOIN_URL_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
  if (!hostMatches) {
    return "Teams の会議リンク(teams.microsoft.com)を入力してください。";
  }
  return null;
}

// 現在時刻を基準に当日〜数日先のデモ会議を生成する。
function buildMockUpcomingMeetings(): Omit<TeamsUpcomingMeetingDto, "bot_status">[] {
  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date;
  };
  const meeting = (
    id: string,
    subject: string,
    organizer: string,
    start: Date,
    durationMinutes: number,
    participantCount: number,
  ) => ({
    id,
    subject,
    organizer,
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
    participant_count: participantCount,
    join_url: `https://teams.microsoft.com/l/meetup-join/19%3ademo_${id}%40thread.v2/0`,
  });

  return [
    meeting("tm_daily_standup", "デイリースタンドアップ", "佐藤 健", at(0, 17, 30), 15, 6),
    meeting("tm_sprint_review", "スプリントレビュー", "鈴木 美咲", at(1, 10, 0), 60, 12),
    meeting("tm_arch_review", "アーキテクチャレビュー", "高橋 大輔", at(1, 15, 0), 45, 5),
    meeting("tm_one_on_one", "1on1 (高橋さん)", "高橋 大輔", at(2, 13, 0), 30, 2),
    meeting("tm_planning", "次期スプリント計画", "鈴木 美咲", at(4, 11, 0), 90, 10),
  ];
}
