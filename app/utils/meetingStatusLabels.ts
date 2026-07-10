export function isElapsedMeetingStatus(status: string) {
  return (
    status === "joined" ||
    status === "active" ||
    status === "recording" ||
    status === "speech_error" ||
    status === "speech_throttled"
  );
}

export function isCompletedMeetingStatus(status: string) {
  return (
    status === "ended" || status === "completed" || status === "closed" || status === "finished"
  );
}

export function formatStatus(status: string) {
  switch (status) {
    case "idle":
      return "待機中";
    case "loading":
      return "読み込み中";
    case "connecting":
      return "接続中";
    case "connected":
      return "接続済み";
    case "reconnecting":
      return "再接続中";
    case "closed":
      return "切断";
    case "error":
      return "エラー";
    case "created":
      return "作成済み";
    case "started":
      return "進行中";
    case "ended":
    case "completed":
    case "finished":
      return "終了";
    case "requested":
      return "参加要求済み";
    case "pending_join":
      return "参加待機";
    case "command_sent":
      return "Bot参加命令済み";
    case "joining":
      return "Bot参加中";
    case "joined":
      return "Bot参加済み";
    case "active":
      return "進行中";
    case "recording":
      return "録音中";
    case "speech_error":
      return "文字起こし停止中";
    case "speech_throttled":
      return "文字起こし再接続中";
    case "transcribing":
      return "文字起こし中";
    case "failed":
      return "失敗";
    case "stale":
      return "停止扱い";
    case "timeout":
      return "タイムアウト";
    default:
      return status;
  }
}

export function formatTranscriptConnectionStatus(status: string) {
  switch (status) {
    case "loading":
      return "履歴取得中";
    case "connecting":
      return "接続中";
    case "reconnecting":
      return "再接続中";
    case "closed":
      return "切断";
    case "error":
      return "エラー";
    default:
      return status;
  }
}
