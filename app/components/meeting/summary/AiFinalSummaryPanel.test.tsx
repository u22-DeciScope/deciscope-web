import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FinalSummaryPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import { AiFinalSummaryPanel } from "~/components/meeting/summary/AiFinalSummaryPanel";
import type { FinalSummaryViewState } from "~/components/meeting/summary/finalSummaryState";

function completedState(final: MeetingAIAnalysis): FinalSummaryViewState {
  return { kind: "completed", final };
}

const payload: FinalSummaryPayload = {
  suggestedTitle: "価格改定方針レビュー",
  overview: "値上げ対象と時期を確認した。",
  decisions: [{ text: "大口顧客のみ5%値上げする" }],
  actionItems: [{ text: "対象顧客リストを作成する", owner: "山田", due: "8/10" }],
  openIssues: ["中小顧客の解約リスク"],
  keyPoints: ["原価上昇による利益率悪化"],
  nextMeetingTopics: ["適用タイミングの最終決定"],
};

function finalWith(overrides: Partial<FinalSummaryPayload> = {}): MeetingAIAnalysis {
  return {
    analysisType: "final",
    status: "completed",
    version: 1,
    payload: { ...payload, ...overrides },
  };
}

describe("AiFinalSummaryPanel", () => {
  it("payloadに入っていても表示対象外の4フィールドは描画しない", () => {
    render(<AiFinalSummaryPanel state={completedState(finalWith())} />);

    // 決定事項・重要な論点・未解決事項は下段のAIアシスタント列と重複するため出さない。
    expect(screen.queryByText("決定事項")).toBeNull();
    expect(screen.queryByText("重要な論点")).toBeNull();
    expect(screen.queryByText("未解決事項")).toBeNull();
    expect(screen.queryByText("大口顧客のみ5%値上げする")).toBeNull();
    expect(screen.queryByText("原価上昇による利益率悪化")).toBeNull();
    expect(screen.queryByText("中小顧客の解約リスク")).toBeNull();
    // タイトル案は反映する導線が無いため出さない。
    expect(screen.queryByText(/価格改定方針レビュー/)).toBeNull();
  });

  it("要約・担当者付きアクションアイテム・次回トピックを表示する", () => {
    render(<AiFinalSummaryPanel state={completedState(finalWith())} />);

    expect(screen.getByText("AI最終要約")).toBeTruthy();
    expect(screen.getByText("値上げ対象と時期を確認した。")).toBeTruthy();
    expect(screen.getByText("アクションアイテム")).toBeTruthy();
    expect(screen.getByText("対象顧客リストを作成する")).toBeTruthy();
    expect(screen.getByText("山田")).toBeTruthy();
    expect(screen.getByText("期限: 8/10")).toBeTruthy();
    expect(screen.getByText("次回トピック")).toBeTruthy();
    expect(screen.getByText("適用タイミングの最終決定")).toBeTruthy();
  });

  it("アクションアイテムと次回トピックが揃うときだけ2カラムで横並びにする", () => {
    const both = render(<AiFinalSummaryPanel state={completedState(finalWith())} />);
    expect(both.container.querySelector(".md\\:grid-cols-2")).not.toBeNull();
    both.unmount();

    const actionsOnly = render(
      <AiFinalSummaryPanel state={completedState(finalWith({ nextMeetingTopics: [] }))} />,
    );
    expect(actionsOnly.container.querySelector(".md\\:grid-cols-2")).toBeNull();
    expect(screen.getByText("アクションアイテム")).toBeTruthy();
  });

  it("会議前コンテキストは既定で閉じており、トグルで開閉できる", () => {
    render(
      <AiFinalSummaryPanel
        state={completedState(finalWith())}
        contextPanel={<div>会議前コンテキスト(実データ)</div>}
      />,
    );

    const toggle = screen.getByRole("button", { name: "会議前コンテキスト" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("会議前コンテキスト(実データ)")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("会議前コンテキスト(実データ)")).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText("会議前コンテキスト(実データ)")).toBeNull();
  });

  it("会議前コンテキストが渡されない会議ではトグル自体を出さない", () => {
    render(<AiFinalSummaryPanel state={completedState(finalWith())} />);

    expect(screen.queryByRole("button", { name: "会議前コンテキスト" })).toBeNull();
  });

  it("生成中は進捗段階を添えてスピナーを出す", () => {
    render(
      <AiFinalSummaryPanel
        state={{ kind: "generating", stage: "waiting_for_live_analysis", retryable: false }}
      />,
    );

    expect(screen.getByText("AI最終要約を生成しています…")).toBeTruthy();
    expect(screen.getByText("進行中の分析の完了を待っています")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /再生成/ })).toBeNull();
  });

  it("失敗状態では内部エラーではなく失敗表示と再生成ボタンを出す", () => {
    const onRetry = vi.fn();
    render(
      <AiFinalSummaryPanel
        state={{ kind: "failed", retryable: true, message: "live_wait_timeout" }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("AI最終要約の生成に失敗しました。")).toBeTruthy();
    expect(screen.queryByText(/live_wait_timeout/)).toBeNull();
    const retry = screen.getByRole("button", { name: "最終要約を再生成" });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("不完全終了は生成中ではなく専用の文言で表示する", () => {
    render(
      <AiFinalSummaryPanel state={{ kind: "incomplete", retryable: true }} onRetry={() => {}} />,
    );

    expect(screen.getByText("会議の最終処理が完了しませんでした。")).toBeTruthy();
    expect(screen.queryByText("AI最終要約を生成しています…")).toBeNull();
    expect(screen.getByRole("button", { name: "最終要約を再生成" })).toBeTruthy();
  });

  it("retryable でなければ再生成ボタンを出さない", () => {
    render(<AiFinalSummaryPanel state={{ kind: "failed", retryable: false }} onRetry={() => {}} />);

    expect(screen.queryByRole("button", { name: /再生成/ })).toBeNull();
  });

  it("再生成の実行中はボタンを無効化し、失敗理由を表示する", () => {
    render(
      <AiFinalSummaryPanel
        state={{ kind: "failed", retryable: true }}
        onRetry={() => {}}
        retryInProgress
        retryError="再生成を開始できませんでした。"
      />,
    );

    const retry = screen.getByRole("button", { name: "再生成しています…" });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("再生成を開始できませんでした。")).toBeTruthy();
  });

  it("hidden では何も描画しない", () => {
    const { container } = render(<AiFinalSummaryPanel state={{ kind: "hidden" }} />);
    expect(container.firstChild).toBeNull();
  });
});
