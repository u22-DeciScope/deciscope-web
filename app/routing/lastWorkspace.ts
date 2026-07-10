const STORAGE_KEY = "deciscope:lastWorkspaceId";

// 最後に開いたワークスペースID。ログイン後の遷移先の優先判定に使う。
// 最終的な正は URL と backend API 側にあり、これはヒントとして扱う
// (必ず所属チェックを通してから使うこと)。
export function loadLastWorkspaceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLastWorkspaceId(workspaceId: string) {
  if (typeof window === "undefined" || !workspaceId) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, workspaceId);
  } catch {
    // localStorage が使えない環境では単に保存しない。
  }
}
