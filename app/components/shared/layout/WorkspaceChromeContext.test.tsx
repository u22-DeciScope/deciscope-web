import { memo, StrictMode, useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useWorkspaceChrome,
  useWorkspaceChromeContext,
  WorkspaceChromeProvider,
  type WorkspaceChromeConfig,
} from "./WorkspaceChromeContext";

let displayRenderCount = 0;
let registrarRenderCount = 0;

// memo化して親の再レンダー巻き込みを除外し、「chrome contextが変化したとき
// だけ再レンダーされる」ことをdisplayRenderCountで観測できるようにする。
const ChromeTitle = memo(function ChromeTitle() {
  displayRenderCount++;
  const { chrome } = useWorkspaceChromeContext();
  return (
    <div data-testid="chrome-title">
      {chrome.header.title}
      {chrome.header.subtitle ? ` / ${chrome.header.subtitle}` : ""}
    </div>
  );
});

// MeetingPageと同様に「毎レンダー新しいconfigオブジェクト」を渡す登録者。
// 修正前の実装では、このパターンが登録effectの再実行→setState→再レンダーの
// 自励ループ(Maximum update depth exceeded)を起こしていた。
function UnstableRegistrar({ title, subtitle }: { title: string; subtitle?: string }) {
  registrarRenderCount++;
  useWorkspaceChrome({ header: { title, ...(subtitle ? { subtitle } : {}) } });
  return null;
}

function StableRegistrar({ config }: { config: WorkspaceChromeConfig }) {
  registrarRenderCount++;
  useWorkspaceChrome(config);
  return null;
}

beforeEach(() => {
  displayRenderCount = 0;
  registrarRenderCount = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorkspaceChromeContext", () => {
  it("毎レンダー新しいconfigを渡しても無限更新ループにならない", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <WorkspaceChromeProvider>
        <UnstableRegistrar title="会議" />
        <ChromeTitle />
      </WorkspaceChromeProvider>,
    );

    expect(screen.getByTestId("chrome-title").textContent).toBe("会議");
    // 自励ループが起きていれば例外か大量レンダーになる。
    expect(registrarRenderCount).toBeLessThanOrEqual(5);
    const maxDepthErrors = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth"),
    );
    expect(maxDepthErrors).toHaveLength(0);
  });

  it("StrictMode配下(二重setup/cleanup)でも設定が反映されループしない", () => {
    render(
      <StrictMode>
        <WorkspaceChromeProvider>
          <UnstableRegistrar title="会議" subtitle="経過 00:01" />
          <ChromeTitle />
        </WorkspaceChromeProvider>
      </StrictMode>,
    );

    expect(screen.getByTestId("chrome-title").textContent).toBe("会議 / 経過 00:01");
    // StrictModeはsetup→cleanup→setupを実行する。cleanupの所有権チェックが
    // なければ最終状態がdefaultへ巻き戻る。
  });

  it("recording→ending→endedのstatus変化で登録がループせず追従する", () => {
    function MeetingLikePage({ status, wsConnected }: { status: string; wsConnected: boolean }) {
      // MeetingPage相当: statusとWS状態から毎レンダーconfigを組み立てる。
      useWorkspaceChrome({
        header: { title: `会議 (${status})`, subtitle: wsConnected ? "WS接続" : "polling" },
      });
      return null;
    }

    const { rerender } = render(
      <WorkspaceChromeProvider>
        <MeetingLikePage status="recording" wsConnected={true} />
        <ChromeTitle />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByTestId("chrome-title").textContent).toBe("会議 (recording) / WS接続");

    rerender(
      <WorkspaceChromeProvider>
        <MeetingLikePage status="ending" wsConnected={true} />
        <ChromeTitle />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByTestId("chrome-title").textContent).toBe("会議 (ending) / WS接続");

    // ending中のWS切断→polling→endedの遷移。
    rerender(
      <WorkspaceChromeProvider>
        <MeetingLikePage status="ending" wsConnected={false} />
        <ChromeTitle />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByTestId("chrome-title").textContent).toBe("会議 (ending) / polling");

    rerender(
      <WorkspaceChromeProvider>
        <MeetingLikePage status="ended" wsConnected={true} />
        <ChromeTitle />
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByTestId("chrome-title").textContent).toBe("会議 (ended) / WS接続");
    expect(displayRenderCount).toBeLessThanOrEqual(12);
  });

  it("登録コンポーネントのunmountでdefaultへ戻り、警告なくcleanupされる", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    function Harness() {
      const [showMeeting, setShowMeeting] = useState(true);
      return (
        <WorkspaceChromeProvider>
          {showMeeting && <UnstableRegistrar title="会議" />}
          <ChromeTitle />
          <button type="button" onClick={() => setShowMeeting(false)}>
            leave
          </button>
        </WorkspaceChromeProvider>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("chrome-title").textContent).toBe("会議");

    act(() => {
      screen.getByText("leave").click();
    });

    expect(screen.getByTestId("chrome-title").textContent).toBe("Deciscope");
    const updateWarnings = consoleError.mock.calls.filter(
      (call) =>
        String(call[0]).includes("Maximum update depth") ||
        String(call[0]).includes("Can't perform a React state update"),
    );
    expect(updateWarnings).toHaveLength(0);
  });

  it("ページ遷移(登録者の切替)で新しいページの設定へ切り替わる", () => {
    function Harness() {
      const [page, setPage] = useState<"meeting" | "summary">("meeting");
      return (
        <WorkspaceChromeProvider>
          {page === "meeting" ? (
            <UnstableRegistrar title="会議" />
          ) : (
            <UnstableRegistrar title="会議サマリー" />
          )}
          <ChromeTitle />
          <button type="button" onClick={() => setPage("summary")}>
            go-summary
          </button>
        </WorkspaceChromeProvider>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("chrome-title").textContent).toBe("会議");

    act(() => {
      screen.getByText("go-summary").click();
    });

    expect(screen.getByTestId("chrome-title").textContent).toBe("会議サマリー");
  });

  it("古い登録者のcleanupが、後から登録された設定を上書きしない(所有権)", () => {
    // AとBが同時にmountしている状態(後勝ちでBが有効)からAだけをunmountする。
    // 所有権チェックがない実装では、Aのcleanupが無条件にdefaultへ戻して
    // Bの設定を消してしまう。
    function Harness() {
      const [showA, setShowA] = useState(true);
      return (
        <WorkspaceChromeProvider>
          {showA && <UnstableRegistrar title="ページA" />}
          <UnstableRegistrar title="ページB" />
          <ChromeTitle />
          <button type="button" onClick={() => setShowA(false)}>
            remove-a
          </button>
        </WorkspaceChromeProvider>
      );
    }

    render(<Harness />);
    // mount順でBが後に登録されるため、Bが有効。
    expect(screen.getByTestId("chrome-title").textContent).toBe("ページB");

    act(() => {
      screen.getByText("remove-a").click();
    });

    // Aのcleanupが走ってもBの設定が維持される。
    expect(screen.getByTestId("chrome-title").textContent).toBe("ページB");
  });

  it("同一参照のconfigを再登録しても表示側は再レンダーされない(同値bailout)", () => {
    const config: WorkspaceChromeConfig = { header: { title: "固定タイトル" } };

    function Harness() {
      const [, setTick] = useState(0);
      return (
        <WorkspaceChromeProvider>
          <StableRegistrar config={config} />
          <ChromeTitle />
          <button type="button" onClick={() => setTick((current) => current + 1)}>
            tick
          </button>
        </WorkspaceChromeProvider>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId("chrome-title").textContent).toBe("固定タイトル");
    const displayRendersAfterMount = displayRenderCount;

    act(() => {
      screen.getByText("tick").click();
    });
    act(() => {
      screen.getByText("tick").click();
    });

    // Harness再レンダーでStableRegistrarは再実行されるが、同一参照configの
    // 再適用はstateをbailoutさせるため、chrome購読側は再レンダーされない。
    expect(screen.getByTestId("chrome-title").textContent).toBe("固定タイトル");
    expect(displayRenderCount).toBe(displayRendersAfterMount);
  });
});
