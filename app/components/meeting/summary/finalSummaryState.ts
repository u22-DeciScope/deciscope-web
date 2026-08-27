import type {
  MeetingAIAnalysis,
  MeetingFinalizationAnalysis,
  MeetingFinalizationStatus,
} from "~/api/aiAnalysis/aiAnalysisApi";

/**
 * /summary の「AI最終要約」欄が取りうる状態。
 *
 * バックエンドの finalization 状態を唯一の判断材料にする。「会議が終わっていて
 * final summary が無い」ことだけを理由に「生成中」と表示してはいけない
 * (終了処理が途中で失敗したセッションが永久にスピナーになるため)。
 */
export type FinalSummaryViewState =
  | { kind: "hidden" }
  | { kind: "generating"; stage?: MeetingFinalizationStatus; retryable: false }
  | { kind: "completed"; final: MeetingAIAnalysis }
  | { kind: "failed"; retryable: boolean; message?: string }
  | { kind: "incomplete"; retryable: boolean; message?: string };

export type FinalSummaryStateInput = {
  /** 会議セッションの状態。まだ読めていない場合は undefined。 */
  sessionStatus?: string;
  finalization: MeetingFinalizationAnalysis | null;
  final: MeetingAIAnalysis | null;
  /** REST の初回応答すら受け取れていない間だけ true。 */
  loading: boolean;
};

const generatingStatuses: MeetingFinalizationStatus[] = [
  "waiting_for_transcript_drain",
  "waiting_for_live_analysis",
  "building_final_tree",
  "generating_summary",
  "not_started",
];

const terminalSessionStatuses = ["ended", "failed", "stale"];

function hasSummaryPayload(final: MeetingAIAnalysis | null): boolean {
  return final !== null && final.status === "completed" && final.payload !== null;
}

/**
 * 表示状態を決める。判定順は「完了 > 失敗 > 生成中 > 不完全終了」。
 * finalization 行が無い古いセッションでも、final summary があれば完了として扱う。
 */
export function deriveFinalSummaryState(input: FinalSummaryStateInput): FinalSummaryViewState {
  const { sessionStatus, finalization, final, loading } = input;

  if (hasSummaryPayload(final)) {
    return { kind: "completed", final: final as MeetingAIAnalysis };
  }

  const status = finalization?.payload.finalizationStatus;
  // retryable を持たない旧payloadでも、完了していない終了処理は再実行できる
  // (バックエンドは「completedでなければ再実行可」で判定する)。
  const retryable = finalization ? finalization.payload.retryable !== false : true;
  const message = finalization?.payload.finalizationErrorCode;

  if (finalization) {
    if (status === "completed") {
      // finalization は完了しているのに要約本文が無い。生成中ではないので、
      // 不完全終了として扱い再実行の導線を出す。
      return { kind: "incomplete", retryable, ...(message ? { message } : {}) };
    }
    if (status === "failed" || finalization.status === "failed") {
      return { kind: "failed", retryable, ...(message ? { message } : {}) };
    }
    if (status && generatingStatuses.includes(status)) {
      return { kind: "generating", stage: status, retryable: false };
    }
    if (finalization.status === "running") {
      return { kind: "generating", retryable: false };
    }
  }

  // final 行だけが running のケース(finalization 行が無い古いセッション)。
  if (final?.status === "running") {
    return { kind: "generating", retryable: false };
  }
  if (final?.status === "failed") {
    return { kind: "failed", retryable: true };
  }

  if (loading) {
    return { kind: "generating", retryable: false };
  }
  if (sessionStatus && terminalSessionStatuses.includes(sessionStatus)) {
    // 終了済みなのに finalization も final も無い。生成が始まっていないので
    // 「生成中」ではなく不完全終了として見せる。
    return { kind: "incomplete", retryable: true };
  }
  return { kind: "hidden" };
}

/**
 * REST と WebSocket が前後して届いても古い running 状態へ戻らないように、
 * 新しい finalization だけを採用する。version 優先、同値なら updatedAtUtc。
 */
export function mergeFinalizationAnalysis(
  current: MeetingFinalizationAnalysis | null,
  incoming: MeetingFinalizationAnalysis | null,
): MeetingFinalizationAnalysis | null {
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }
  if (incoming.version !== current.version) {
    return incoming.version > current.version ? incoming : current;
  }
  const currentAt = Date.parse(current.updatedAtUtc ?? "");
  const incomingAt = Date.parse(incoming.updatedAtUtc ?? "");
  if (Number.isFinite(currentAt) && Number.isFinite(incomingAt) && incomingAt !== currentAt) {
    return incomingAt > currentAt ? incoming : current;
  }
  // 同一versionで時刻差も無い場合、terminal な状態を running へ巻き戻さない。
  const currentTerminal = current.status !== "running";
  const incomingTerminal = incoming.status !== "running";
  if (currentTerminal && !incomingTerminal) {
    return current;
  }
  return incoming;
}

const stageLabels: Partial<Record<MeetingFinalizationStatus, string>> = {
  waiting_for_transcript_drain: "文字起こしの確定を待っています",
  waiting_for_live_analysis: "進行中の分析の完了を待っています",
  building_final_tree: "議論ツリーを最終整理しています",
  generating_summary: "最終要約を生成しています",
};

export function finalizationStageLabel(status?: MeetingFinalizationStatus): string | undefined {
  return status ? stageLabels[status] : undefined;
}
