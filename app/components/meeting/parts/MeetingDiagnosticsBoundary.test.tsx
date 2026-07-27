import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MeetingDiagnosticsBoundary } from "~/components/meeting/parts/MeetingDiagnosticsBoundary";
import { DiscussionTreeErrorBoundary } from "~/components/meeting/parts/discussionTree/DiscussionTreeErrorBoundary";
import {
  recentDiagnosticEvents,
  resetClientDiagnosticsForTest,
} from "~/utils/clientDiagnostics/clientDiagnostics";
import { DIAGNOSTIC_MAX_STACK_CHARS } from "~/utils/clientDiagnostics/diagnosticsTypes";

function Exploding({ message }: { message: string }): never {
  throw new Error(message);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetClientDiagnosticsForTest();
  // React は境界で捕捉した例外も console.error へ出すため、出力を抑える。
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("MeetingDiagnosticsBoundary", () => {
  it("turns a render exception into a react_error_captured diagnostic event", () => {
    render(
      <MeetingDiagnosticsBoundary
        sessionId="session_abc"
        workspaceId="w_test"
        treeVersion={12}
        nodeCount={7}
        resetKey="session_abc:12:7"
      >
        <Exploding message="grid render failed" />
      </MeetingDiagnosticsBoundary>,
    );

    expect(screen.getByTestId("meeting-render-fallback")).toBeTruthy();
    const captured = recentDiagnosticEvents(50).find(
      (event) => event.event === "react_error_captured",
    );
    expect(captured).toBeDefined();
    expect(captured?.sessionId).toBe("session_abc");
    expect(captured?.workspaceId).toBe("w_test");
    expect(captured?.treeVersion).toBe(12);
    expect(captured?.nodeCount).toBe(7);
    expect(captured?.route).toBeDefined();
    const details = captured?.details as Record<string, unknown>;
    expect(details.boundary).toBe("meeting_page");
    expect(details.errorName).toBe("Error");
    expect(details.errorMessage).toBe("grid render failed");
    expect(typeof details.componentStack).toBe("string");
  });

  it("limits the recorded component stack size", () => {
    render(
      <MeetingDiagnosticsBoundary
        sessionId="session_abc"
        workspaceId="w_test"
        treeVersion={null}
        nodeCount={0}
        resetKey="session_abc:none:0"
      >
        <Exploding message={"y".repeat(DIAGNOSTIC_MAX_STACK_CHARS + 800)} />
      </MeetingDiagnosticsBoundary>,
    );

    const details = recentDiagnosticEvents(50).find(
      (event) => event.event === "react_error_captured",
    )?.details as Record<string, unknown>;
    expect((details.errorMessage as string).length).toBeLessThan(DIAGNOSTIC_MAX_STACK_CHARS + 100);
    expect((details.errorMessage as string).endsWith("[truncated]")).toBe(true);
  });
});

describe("DiscussionTreeErrorBoundary", () => {
  it("records the discussion tree render exception as a diagnostic event", () => {
    render(
      <DiscussionTreeErrorBoundary
        nodes={[{ id: "root" }, { id: "issue-1", parentId: "root" }]}
        sessionId="session_abc"
        workspaceId="w_test"
        treeVersion={9}
        resetKey="9:2:0"
      >
        <Exploding message="layout failed" />
      </DiscussionTreeErrorBoundary>,
    );

    expect(screen.getByTestId("discussion-tree-render-fallback")).toBeTruthy();
    const captured = recentDiagnosticEvents(50).find(
      (event) => event.event === "react_error_captured",
    );
    expect(captured).toBeDefined();
    expect(captured?.nodeCount).toBe(2);
    expect(captured?.treeVersion).toBe(9);
    const details = captured?.details as Record<string, unknown>;
    expect(details.boundary).toBe("discussion_tree");
    expect(details.errorMessage).toBe("layout failed");
  });
});
