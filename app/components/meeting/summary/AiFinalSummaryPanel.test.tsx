import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FinalSummaryPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import { AiFinalSummaryPanel } from "~/components/meeting/summary/AiFinalSummaryPanel";

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
    render(<AiFinalSummaryPanel final={finalWith()} />);

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
    render(<AiFinalSummaryPanel final={finalWith()} />);

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
    const both = render(<AiFinalSummaryPanel final={finalWith()} />);
    expect(both.container.querySelector(".md\\:grid-cols-2")).not.toBeNull();
    both.unmount();

    const actionsOnly = render(<AiFinalSummaryPanel final={finalWith({ nextMeetingTopics: [] })} />);
    expect(actionsOnly.container.querySelector(".md\\:grid-cols-2")).toBeNull();
    expect(screen.getByText("アクションアイテム")).toBeTruthy();
  });

  it("会議前コンテキストは既定で閉じており、トグルで開閉できる", () => {
    render(
      <AiFinalSummaryPanel
        final={finalWith()}
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
    render(<AiFinalSummaryPanel final={finalWith()} />);

    expect(screen.queryByRole("button", { name: "会議前コンテキスト" })).toBeNull();
  });
});
