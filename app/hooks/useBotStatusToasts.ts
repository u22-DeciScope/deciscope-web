import { useEffect, useMemo, useRef, useState } from "react";

import {
  isTerminalMeetingSessionStatus,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";

export type BotStatusToastTone = "error" | "warning" | "success";

export type BotStatusToast = {
  id: string;
  tone: BotStatusToastTone;
  message: string;
};

const recoveredToastDurationMs = 5000;

// Botの会議参加状態(sessionStatus)の変化を検知して、会議画面上部に出す
// トースト内容を組み立てるフック。文字起こしWebSocketの接続状態(connectionStatus)
// とは独立して、Bot自体が停止・退出したことを知らせるためのものなので、
// 既存の pageNotice(接続状態バー)とは別のトースト表示として扱う。
//
// - speech_error / speech_throttled は継続中の間ずっと表示する(persistent)。
// - speech_error / speech_throttled から recording に復帰したら、復旧トーストを
//   数秒間だけ表示して自動的に消す(transient)。
// - sessionStatus が ended になったとき、このブラウザで終了ボタンを押していない
//   (isLocalEnd が false の)場合だけ「Botが退出しました」トーストを出す。
//   endReason が取れていれば、手動終了/Bot停止/Teams側終了の区別を文言に反映する。
export function useBotStatusToasts(
  sessionKey: string,
  sessionStatus: MeetingSessionStatus | null,
  options: { endReason?: string; isLocalEnd: boolean; botConnectionLost: boolean },
) {
  const { endReason, isLocalEnd, botConnectionLost } = options;
  const [toasts, setToasts] = useState<BotStatusToast[]>([]);
  const previousStatusRef = useRef<MeetingSessionStatus | null>(null);
  const recoveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botConnectionRecoveredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousBotConnectionLostRef = useRef(false);

  // 別の会議セッションに切り替わったら、前のセッションのトーストを引きずらない。
  useEffect(() => {
    previousStatusRef.current = null;
    previousBotConnectionLostRef.current = false;
    setToasts([]);
    if (recoveredTimerRef.current) {
      clearTimeout(recoveredTimerRef.current);
      recoveredTimerRef.current = null;
    }
    if (botConnectionRecoveredTimerRef.current) {
      clearTimeout(botConnectionRecoveredTimerRef.current);
      botConnectionRecoveredTimerRef.current = null;
    }
  }, [sessionKey]);

  // Go API側watchdogがBotのハートビート途絶(60秒以上)を検知した通知。
  // 復帰(healthy=true)した場合は、既に会議が終了していない限り復旧トーストへ切り替える。
  useEffect(() => {
    const previousBotConnectionLost = previousBotConnectionLostRef.current;
    previousBotConnectionLostRef.current = botConnectionLost;
    if (botConnectionLost === previousBotConnectionLost) {
      return;
    }

    if (botConnectionLost) {
      setToasts((current) =>
        upsertToast(current, {
          id: "bot-connection",
          tone: "warning",
          message:
            "Botとの接続が確認できません。VM上のBotが停止した可能性があります。復旧しない場合は「会議終了」で会議を終了してください。",
        }),
      );
      return;
    }

    setToasts((current) => removeToast(current, "bot-connection"));
    // failed/stale/timeout(webの型上のみ)で終了した場合もended同様、偽の復旧
    // トーストを出さない。sessionStatus === null はまだ状態未取得のケース。
    if (sessionStatus === null || !isTerminalMeetingSessionStatus(sessionStatus)) {
      setToasts((current) =>
        upsertToast(current, {
          id: "bot-connection-recovered",
          tone: "success",
          message: "Botとの接続が復旧しました。",
        }),
      );
      if (botConnectionRecoveredTimerRef.current) {
        clearTimeout(botConnectionRecoveredTimerRef.current);
      }
      botConnectionRecoveredTimerRef.current = setTimeout(() => {
        setToasts((current) => removeToast(current, "bot-connection-recovered"));
      }, recoveredToastDurationMs);
    }
  }, [botConnectionLost, sessionStatus]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = sessionStatus;
    if (sessionStatus === previousStatus) {
      return;
    }

    if (sessionStatus === "speech_error") {
      setToasts((current) =>
        upsertToast(current, {
          id: "speech-status",
          tone: "error",
          message: "音声認識パイプラインが停止しています。Botの状態を確認してください。",
        }),
      );
      return;
    }

    if (sessionStatus === "speech_throttled") {
      setToasts((current) =>
        upsertToast(current, {
          id: "speech-status",
          tone: "warning",
          message: "文字起こしが一時停止中です(再接続中)。AI分析の更新が遅れる可能性があります。",
        }),
      );
      return;
    }

    if (sessionStatus === "recording") {
      const recoveredFromSpeechIssue =
        previousStatus === "speech_error" || previousStatus === "speech_throttled";
      setToasts((current) => removeToast(current, "speech-status"));
      if (recoveredFromSpeechIssue) {
        setToasts((current) =>
          upsertToast(current, {
            id: "speech-recovered",
            tone: "success",
            message: "文字起こしが復旧しました。",
          }),
        );
        if (recoveredTimerRef.current) {
          clearTimeout(recoveredTimerRef.current);
        }
        recoveredTimerRef.current = setTimeout(() => {
          setToasts((current) => removeToast(current, "speech-recovered"));
        }, recoveredToastDurationMs);
      }
      return;
    }

    if (sessionStatus === "ended") {
      setToasts((current) => removeToast(current, "speech-status"));
      setToasts((current) => removeToast(current, "bot-connection"));
      // previousStatus === null は「終了済みセッションを後から開いた」初回ロードなので、
      // 会議中にライブで ended への遷移を目撃した場合だけ退出トーストを出す
      // (終了済みページでは既存の endedNotice バナーが案内を担う)。
      if (!isLocalEnd && previousStatus !== null) {
        setToasts((current) =>
          upsertToast(current, {
            id: "bot-left",
            tone: "warning",
            message: describeBotLeftMessage(endReason),
          }),
        );
      }
    }
  }, [endReason, isLocalEnd, sessionStatus]);

  useEffect(() => {
    return () => {
      if (recoveredTimerRef.current) {
        clearTimeout(recoveredTimerRef.current);
      }
      if (botConnectionRecoveredTimerRef.current) {
        clearTimeout(botConnectionRecoveredTimerRef.current);
      }
    };
  }, []);

  const dismissToast = (id: string) => {
    setToasts((current) => removeToast(current, id));
  };

  return useMemo(() => ({ toasts, dismissToast }), [toasts]);
}

function upsertToast(current: BotStatusToast[], toast: BotStatusToast): BotStatusToast[] {
  return [...current.filter((item) => item.id !== toast.id), toast];
}

function removeToast(current: BotStatusToast[], id: string): BotStatusToast[] {
  if (!current.some((item) => item.id === id)) {
    return current;
  }
  return current.filter((item) => item.id !== id);
}

// endReason はBot(EchoBot)/Go APIが自由記述で送る文字列("manual_end_requested",
// "shutdown", Teamsの通話終了メッセージなど)なので、既知のパターンだけを
// ゆるく判定し、それ以外は「Teams側で終了した可能性がある」扱いにする。
function describeBotLeftMessage(endReason?: string) {
  const base = "Botが会議から退出しました。";
  const reason = (endReason ?? "").trim().toLowerCase();
  if (!reason) {
    return base;
  }
  if (reason.includes("manual")) {
    return `${base}(別の参加者が終了操作を行いました)`;
  }
  if (reason.includes("unresponsive") || reason.includes("heartbeat")) {
    return `${base}(Botが応答しなくなったため自動終了しました。VM上のBotが停止した可能性があります)`;
  }
  if (reason.includes("shutdown")) {
    return `${base}(Bot側の停止によるものです)`;
  }
  return `${base}(Teams側で会議が終了した可能性があります)`;
}
