const TEAMS_JOIN_URL_HOSTS = ["teams.microsoft.com", "teams.live.com"];

export function validateTeamsJoinUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "会議リンクを入力してください。";
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
