import { describe, expect, it } from "vitest";

import type {
  MeetingAIAnalysis,
  MeetingFinalizationAnalysis,
  MeetingFinalizationStatus,
} from "~/api/aiAnalysis/aiAnalysisApi";
import {
  deriveFinalSummaryState,
  mergeFinalizationAnalysis,
} from "~/components/meeting/summary/finalSummaryState";

function finalization(
  status: MeetingFinalizationStatus,
  overrides: Partial<MeetingFinalizationAnalysis> = {},
  payloadOverrides: Partial<MeetingFinalizationAnalysis["payload"]> = {},
): MeetingFinalizationAnalysis {
  const runtimeStatus =
    status === "completed" ? "completed" : status === "failed" ? "failed" : "running";
  return {
    analysisType: "finalization",
    status: runtimeStatus,
    version: 1,
    payload: { stage: status, finalizationStatus: status, ...payloadOverrides },
    updatedAtUtc: "2026-08-03T04:02:19.000Z",
    ...overrides,
  };
}

const completedFinal: MeetingAIAnalysis = {
  analysisType: "final",
  status: "completed",
  version: 1,
  payload: {
    overview: "最終要約",
    decisions: [],
    actionItems: [],
    openIssues: [],
    keyPoints: [],
    nextMeetingTopics: [],
  },
};

describe("deriveFinalSummaryState", () => {
  it("会議終了かつ要約なしだけを理由に生成中にしない", () => {
    // session_c01a27bf3197e2c1 の実状態: ended / incomplete / final summary なし。
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: finalization("failed", {}, { finalizationIncomplete: true, retryable: true }),
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("failed");
    expect(state.kind === "failed" && state.retryable).toBe(true);
  });

  it("finalization行が無い終了済みセッションも生成中にしない", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: null,
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("incomplete");
    expect(state.kind === "incomplete" && state.retryable).toBe(true);
  });

  it("generating_summary は生成中として表示する", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ending",
      finalization: finalization("generating_summary"),
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("generating");
    expect(state.kind === "generating" && state.stage).toBe("generating_summary");
  });

  it("live分析待ちも生成中として表示する", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ending",
      finalization: finalization("waiting_for_live_analysis"),
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("generating");
  });

  it("finalizationStatus=failed は失敗表示にする", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: finalization(
        "failed",
        {},
        { retryable: true, finalizationErrorCode: "live_wait_timeout" },
      ),
      final: null,
      loading: false,
    });
    expect(state).toEqual({ kind: "failed", retryable: true, message: "live_wait_timeout" });
  });

  it("finalization完了かつ要約ありは完了表示にする", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: finalization("completed"),
      final: completedFinal,
      loading: false,
    });
    expect(state.kind).toBe("completed");
  });

  it("finalization完了でも要約本文が無ければ不完全終了として扱う", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: finalization("completed", {}, { retryable: true }),
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("incomplete");
    expect(state.kind === "incomplete" && state.retryable).toBe(true);
  });

  it("最初のREST応答前だけ生成中にする", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: null,
      final: null,
      loading: true,
    });
    expect(state.kind).toBe("generating");
  });

  it("retryableを持たない旧payloadの失敗も再実行可能として扱う", () => {
    const legacy: MeetingFinalizationAnalysis = {
      analysisType: "finalization",
      status: "failed",
      version: 1,
      payload: { stage: "final_flush_failed" },
    };
    const state = deriveFinalSummaryState({
      sessionStatus: "ended",
      finalization: legacy,
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("failed");
    expect(state.kind === "failed" && state.retryable).toBe(true);
  });

  it("進行中の会議では何も表示しない", () => {
    const state = deriveFinalSummaryState({
      sessionStatus: "recording",
      finalization: null,
      final: null,
      loading: false,
    });
    expect(state.kind).toBe("hidden");
  });
});

describe("mergeFinalizationAnalysis", () => {
  it("古いversionのfinalizationで新しい状態を巻き戻さない", () => {
    const newer = finalization("completed", { version: 3 });
    const older = finalization("generating_summary", { version: 2 });
    expect(mergeFinalizationAnalysis(newer, older)).toBe(newer);
    expect(mergeFinalizationAnalysis(older, newer)).toBe(newer);
  });

  it("同一versionでは新しいupdatedAtUtcを採用する", () => {
    const first = finalization("generating_summary", {
      version: 4,
      updatedAtUtc: "2026-08-03T04:02:10.000Z",
    });
    const second = finalization("failed", {
      version: 4,
      updatedAtUtc: "2026-08-03T04:02:19.000Z",
    });
    expect(mergeFinalizationAnalysis(first, second)).toBe(second);
    expect(mergeFinalizationAnalysis(second, first)).toBe(second);
  });

  it("同一version・同時刻ならterminalな状態をrunningへ戻さない", () => {
    const terminal = finalization("failed", { version: 5 });
    const running = finalization("generating_summary", { version: 5 });
    expect(mergeFinalizationAnalysis(terminal, running)).toBe(terminal);
  });

  it("nullの受信で既存状態を消さない", () => {
    const current = finalization("generating_summary");
    expect(mergeFinalizationAnalysis(current, null)).toBe(current);
  });
});
