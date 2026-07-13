import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  endWorkspaceMeetingSession,
  getWorkspaceMeetingSession,
  isTerminalMeetingSessionStatus,
  type MeetingSessionStatus,
} from "~/api/meetingSessions/meetingSessionsApi";

// ending中にWSが切断された場合のREST pollingの間隔。
const defaultEndingPollIntervalMs = 2000;

export type MeetingEndFlowOptions = {
  workspaceId: string;
  sessionId: string;
  // WS(status_changed)または初期RESTから観測された現在のsessionStatus。
  observedStatus: MeetingSessionStatus | null;
  // WS/RESTから観測されたendedAt(あれば)。
  observedEndedAt: string;
  // transcript WSが接続中か。ending中にfalseになるとREST pollingへfallbackする。
  wsConnected: boolean;
  pollIntervalMs?: number;
};

export type MeetingEndFlow = {
  // terminal WS通知を最優先し、次に終了API/pollingのレスポンスを反映した現在status。
  effectiveStatus: MeetingSessionStatus | null;
  // finalization待機中(endingオーバーレイを表示すべき状態)。
  isFinalizing: boolean;
  // 終了APIリクエスト送信中。
  isRequestingEnd: boolean;
  // 正式なended/terminal確認後の終了完了モーダル表示。
  showEndedModal: boolean;
  endedAt: string;
  endError: string | null;
  // 終了ボタン押下。二重押下・StrictMode再実行では2回目以降は同じ処理を待つ。
  requestEnd: () => Promise<void>;
};

// 会議終了フローの状態機械。
//  - 終了APIのレスポンスstatusをそのまま反映する(endingをendedへ変換しない)。
//  - ending中はWS/pollingで正式なended(またはterminal failure)を待ち、
//    確認できたときにのみ終了完了モーダルへ進む。
//  - ページ再読み込みでending中のセッションを開いた場合も、observedStatusが
//    endingであればfinalization待機へ復帰する。
export function useMeetingEndFlow({
  workspaceId,
  sessionId,
  observedStatus,
  observedEndedAt,
  wsConnected,
  pollIntervalMs = defaultEndingPollIntervalMs,
}: MeetingEndFlowOptions): MeetingEndFlow {
  const [statusOverride, setStatusOverride] = useState<MeetingSessionStatus | null>(null);
  const [isRequestingEnd, setIsRequestingEnd] = useState(false);
  const [showEndedModal, setShowEndedModal] = useState(false);
  const [endedAtOverride, setEndedAtOverride] = useState("");
  const [endError, setEndError] = useState<string | null>(null);
  // 同期的な二重送信ガード(disabledやstateの反映より速いクリック連打対策)。
  const endRequestedRef = useRef(false);
  // 一度でもending(finalization中)を観測したか。再読み込み復帰時、
  // 終了ボタンを押していなくてもended到達時にモーダルを出すために使う。
  const sawEndingRef = useRef(false);

  // セッション切替時に全状態をリセットする。
  useEffect(() => {
    setStatusOverride(null);
    setIsRequestingEnd(false);
    setShowEndedModal(false);
    setEndedAtOverride("");
    setEndError(null);
    endRequestedRef.current = false;
    sawEndingRef.current = false;
  }, [workspaceId, sessionId]);

  // terminalなWS通知は常に最優先。それ以外は終了API/pollingのレスポンス
  // (statusOverride)を優先し、無ければ観測値をそのまま使う。
  const effectiveStatus = useMemo<MeetingSessionStatus | null>(() => {
    if (observedStatus && isTerminalMeetingSessionStatus(observedStatus)) {
      return observedStatus;
    }
    return statusOverride ?? observedStatus;
  }, [observedStatus, statusOverride]);

  const isEndingStatus = effectiveStatus === "ending";

  // ending観測の記録と、正式なterminal確認によるモーダル遷移。
  useEffect(() => {
    if (isEndingStatus) {
      sawEndingRef.current = true;
    }
    if (
      effectiveStatus &&
      isTerminalMeetingSessionStatus(effectiveStatus) &&
      (endRequestedRef.current || sawEndingRef.current) &&
      !showEndedModal
    ) {
      setShowEndedModal(true);
      setEndedAtOverride((current) => current || observedEndedAt || new Date().toISOString());
    }
  }, [effectiveStatus, isEndingStatus, observedEndedAt, showEndedModal]);

  // ending中にWSが使えない場合のREST polling fallback。endedを確認したら
  // effectiveStatusの変化を通じて自動停止する。
  useEffect(() => {
    if (!sessionId || !isEndingStatus || showEndedModal || wsConnected) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const session = await getWorkspaceMeetingSession(workspaceId, sessionId);
        if (!active) {
          return;
        }
        setStatusOverride(session.status);
        if (session.endedAt) {
          setEndedAtOverride((current) => current || session.endedAt || "");
        }
        if (isTerminalMeetingSessionStatus(session.status)) {
          return;
        }
      } catch {
        // 一時的な取得失敗は次のpollに任せる(endingはAPI側のfallbackで必ず終わる)。
      }
      if (active) {
        timer = setTimeout(() => void poll(), pollIntervalMs);
      }
    };

    timer = setTimeout(() => void poll(), pollIntervalMs);
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [sessionId, workspaceId, isEndingStatus, showEndedModal, wsConnected, pollIntervalMs]);

  const requestEnd = useCallback(async () => {
    if (!sessionId || endRequestedRef.current || showEndedModal) {
      return;
    }
    if (effectiveStatus && isTerminalMeetingSessionStatus(effectiveStatus)) {
      return;
    }
    endRequestedRef.current = true;
    setEndError(null);
    setIsRequestingEnd(true);
    try {
      const session = await endWorkspaceMeetingSession(workspaceId, sessionId);
      // APIレスポンスのstatusをそのまま反映する。endingならfinalization待機、
      // 既にterminal(終了済み会議・二重終了・finalization完了済み)なら
      // ending画面へ留まらず終了完了モーダルへ進む。
      setStatusOverride(session.status);
      if (session.endedAt) {
        setEndedAtOverride((current) => current || session.endedAt || "");
      }
      if (isTerminalMeetingSessionStatus(session.status)) {
        setShowEndedModal(true);
        setEndedAtOverride((current) => current || session.endedAt || new Date().toISOString());
      }
    } catch (cause) {
      // request自体の失敗: 再試行できるようにガードを解除する。
      endRequestedRef.current = false;
      const message = cause instanceof Error ? cause.message : "";
      setEndError(
        `会議の終了に失敗しました。時間をおいて再度お試しください。${message ? ` (${message})` : ""}`,
      );
    } finally {
      setIsRequestingEnd(false);
    }
  }, [effectiveStatus, sessionId, showEndedModal, workspaceId]);

  return {
    effectiveStatus,
    isFinalizing: !showEndedModal && (isRequestingEnd || isEndingStatus),
    isRequestingEnd,
    showEndedModal,
    endedAt: endedAtOverride || observedEndedAt,
    endError,
    requestEnd,
  };
}
