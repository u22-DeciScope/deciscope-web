import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import { isTerminalMeetingSessionStatus } from "~/api/meetingSessions/meetingSessionRegistry";
import { workspaceMeetingPath, workspaceMeetingSummaryPath } from "~/routing/workspacePaths";
import { getMeetingDisplayTitle } from "~/utils/meetingDisplayTitle";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

// ホーム(ダッシュボード)と会議履歴ページで共有する、会議セッションの
// 一覧表示用変換・判定ロジック。進行中/終了の判定を両画面で一致させるため、
// ここに集約する。

export const staleActiveSessionMs = 2 * 60 * 60 * 1000;

export type MeetingListItem = {
  id: string;
  title: string;
  // Teams側の会議名(graphTitle)。表示タイトルと異なる場合のみ、会議名の横に
  // 薄い文字で補助表示する。
  teamsTitle?: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  ended_at?: string;
  joined_at?: string;
  organizerName?: string;
  detailId: string;
  to: string;
  recentTo: string;
  actionLabel: string;
  isTeamsSession: boolean;
};

export function buildMeetingItems(sessions: MeetingSessionDto[], workspaceId: string) {
  const items = sessions.map((session) => sessionToListItem(session, workspaceId));
  return items.sort((a, b) => dateValue(b.updated_at) - dateValue(a.updated_at));
}

function sessionToListItem(session: MeetingSessionDto, workspaceId: string): MeetingListItem {
  const meetingPath = workspaceMeetingPath(workspaceId, session.sessionId);
  const status = displaySessionStatus(session);
  const createdAt = session.createdAt ?? session.requestedAt ?? session.updatedAt ?? "";
  const updatedAt = session.updatedAt ?? session.lastBotStatusAt ?? createdAt;
  const endedAt =
    session.endedAt ?? (isTerminalMeetingSessionStatus(session.status) ? updatedAt : undefined);
  const displayTitle = getMeetingDisplayTitle(session, { component: "dashboard-session-card" });
  const graphTitle = session.graphTitle?.trim();
  return {
    id: session.sessionId,
    title: displayTitle,
    ...(graphTitle && graphTitle !== displayTitle ? { teamsTitle: graphTitle } : {}),
    status,
    source: "teams_bot",
    created_at: createdAt,
    updated_at: updatedAt,
    ended_at: endedAt,
    ...(session.joinedAt ? { joined_at: session.joinedAt } : {}),
    ...(session.organizerName ? { organizerName: session.organizerName } : {}),
    detailId: session.sessionId,
    to: meetingPath,
    recentTo: isTerminalMeetingSessionStatus(status)
      ? workspaceMeetingSummaryPath(workspaceId, session.sessionId)
      : meetingPath,
    actionLabel: isActiveMeetingStatus(status, true) ? "開く" : "記録を見る",
    isTeamsSession: true,
  };
}

export function isActiveMeetingItem(item: MeetingListItem) {
  if (!isActiveMeetingStatus(item.status, item.isTeamsSession)) {
    return false;
  }
  if (!item.isTeamsSession) {
    return true;
  }
  const activeAgeMs = Date.now() - Date.parse(item.updated_at);
  const isFresh = activeAgeMs <= staleActiveSessionMs;
  if (!isFresh) {
    meetingStartDebug("dashboard", "active session excluded as stale on dashboard", {
      sessionId: item.detailId,
      title: item.title,
      status: item.status,
      updatedAt: item.updated_at,
      activeAgeMs,
      staleActiveSessionMs,
    });
  }
  return isFresh;
}

export function isActiveMeetingStatus(status: string, isTeamsSession: boolean) {
  if (isTeamsSession) {
    return (
      status === "requested" ||
      status === "pending_join" ||
      status === "command_sent" ||
      status === "joining" ||
      status === "joined" ||
      status === "active" ||
      status === "recording" ||
      status === "speech_error" ||
      status === "speech_throttled"
    );
  }
  return status === "started";
}

export function sortByCreatedAtDesc(items: MeetingListItem[]) {
  return [...items].sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at));
}

export function dateValue(value?: string) {
  if (!value) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function formatShortDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Bot参加〜終了までの所要時間。どちらかが欠けている場合は表示しない。
export function formatDuration(joinedAt?: string, endedAt?: string) {
  if (!joinedAt || !endedAt) {
    return null;
  }
  const ms = Date.parse(endedAt) - Date.parse(joinedAt);
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return "1分未満";
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0) {
    return rest > 0 ? `${hours}時間${rest}分` : `${hours}時間`;
  }
  return `${minutes}分`;
}

function displaySessionStatus(session: MeetingSessionDto) {
  const updatedAt = session.updatedAt ?? session.lastBotStatusAt ?? session.createdAt ?? "";
  if (
    isActiveMeetingStatus(session.status, true) &&
    updatedAt &&
    Date.now() - Date.parse(updatedAt) > staleActiveSessionMs
  ) {
    meetingStartDebug("dashboard", "session card status overridden", {
      reason: "stale_active_session",
      sessionId: session.sessionId,
      title: session.title,
      titleSource: session.titleSource ?? null,
      originalStatus: session.status,
      updatedAt,
    });
    return "stale";
  }
  meetingStartDebug("dashboard", "session card title source", {
    sessionId: session.sessionId,
    title: session.title,
    titleSource: session.titleSource ?? null,
    status: session.status,
  });
  return session.status;
}

export function formatSource(source: string) {
  switch (source) {
    case "fixture_replay":
      return "テストデータ";
    case "teams_bot":
      return "Teams";
    case "upload":
      return "ファイル";
    default:
      return source;
  }
}
