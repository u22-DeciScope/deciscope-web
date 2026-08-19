import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureClientDiagnosticsForTest,
  diagnosticsTabId,
  flushDiagnostics,
  frontendBuildFingerprint,
  pendingDiagnosticEventsForTest,
  recentDiagnosticEvents,
  recordDiagnosticEvent,
  resetClientDiagnosticsForTest,
  truncateStack,
} from "./clientDiagnostics";
import {
  DIAGNOSTIC_MAX_STACK_CHARS,
  DIAGNOSTIC_RING_BUFFER_SIZE,
  type DiagnosticBatch,
} from "./diagnosticsTypes";

function scope(index = 0) {
  return {
    sessionId: "session_abc",
    workspaceId: "w_test",
    nodeCount: index,
    treeVersion: index,
  };
}

describe("client diagnostics ring buffer", () => {
  beforeEach(() => resetClientDiagnosticsForTest());

  it("keeps at most the configured number of events and drops the oldest first", () => {
    for (let index = 0; index < DIAGNOSTIC_RING_BUFFER_SIZE + 25; index += 1) {
      recordDiagnosticEvent("tree_state_changed", scope(index));
    }
    const events = recentDiagnosticEvents(DIAGNOSTIC_RING_BUFFER_SIZE + 100);
    expect(events).toHaveLength(DIAGNOSTIC_RING_BUFFER_SIZE);
    // 最初の25件が押し出され、最後のイベントが残っている。
    expect(events[0].nodeCount).toBe(25);
    expect(events[events.length - 1].nodeCount).toBe(DIAGNOSTIC_RING_BUFFER_SIZE + 24);
  });

  it("returns only the requested number of recent events", () => {
    for (let index = 0; index < 10; index += 1) {
      recordDiagnosticEvent("tree_state_changed", scope(index));
    }
    expect(recentDiagnosticEvents(3).map((event) => event.nodeCount)).toEqual([7, 8, 9]);
  });

  it("suppresses identical high frequency events but never anomalies", () => {
    recordDiagnosticEvent("tree_state_changed", scope(4));
    recordDiagnosticEvent("tree_state_changed", scope(4));
    recordDiagnosticEvent("tree_state_changed", scope(4));
    expect(recentDiagnosticEvents(50)).toHaveLength(1);

    recordDiagnosticEvent("tree_became_empty", { ...scope(0) });
    recordDiagnosticEvent("tree_became_empty", { ...scope(0) });
    const anomalies = recentDiagnosticEvents(50).filter(
      (event) => event.event === "tree_became_empty",
    );
    expect(anomalies).toHaveLength(2);
  });

  it("stamps every event with the tab id, build version and an increasing sequence", () => {
    const first = recordDiagnosticEvent("ws_connected", scope(1));
    const second = recordDiagnosticEvent("ws_disconnected", scope(2));
    expect(first?.tabId).toBe(diagnosticsTabId());
    expect(second?.tabId).toBe(first?.tabId);
    expect(first?.frontendBuildVersion).toBeTruthy();
    expect(second?.sequence).toBeGreaterThan(first?.sequence ?? 0);
  });

  it("exposes a complete safe frontend build fingerprint", () => {
    expect(frontendBuildFingerprint()).toMatchObject({
      repositoryName: "deciscope-web",
      frontendBuildVersion: expect.any(String),
      gitCommitSha: expect.any(String),
      buildTimestamp: expect.any(String),
      dirtyBuild: expect.any(String),
      runtimeEnvironment: "test",
    });
  });
});

describe("client diagnostics sending", () => {
  beforeEach(() => resetClientDiagnosticsForTest());

  it("batches events per workspace and session", async () => {
    const sent: DiagnosticBatch[] = [];
    configureClientDiagnosticsForTest({
      networkEnabled: true,
      transport: {
        send: async (batch) => {
          sent.push(batch);
          return true;
        },
        sendSync: () => true,
      },
    });

    recordDiagnosticEvent("ws_connected", scope(1));
    recordDiagnosticEvent("ws_disconnected", scope(2));
    await flushDiagnostics();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ workspaceId: "w_test", sessionId: "session_abc" });
    expect(sent[0].events.map((event) => event.event)).toEqual(["ws_connected", "ws_disconnected"]);
    expect(pendingDiagnosticEventsForTest()).toHaveLength(0);
  });

  it("keeps events in the browser buffer when sending fails", async () => {
    configureClientDiagnosticsForTest({
      networkEnabled: true,
      transport: { send: async () => false, sendSync: () => false },
    });

    recordDiagnosticEvent("ws_connected", scope(1));
    await flushDiagnostics();

    expect(pendingDiagnosticEventsForTest().map((event) => event.event)).toEqual(["ws_connected"]);
    // 失敗しても記録自体は残る。
    expect(recentDiagnosticEvents(10)).toHaveLength(1);
  });

  it("does not send events that have no session or workspace scope", async () => {
    const sent: DiagnosticBatch[] = [];
    configureClientDiagnosticsForTest({
      networkEnabled: true,
      transport: {
        send: async (batch) => {
          sent.push(batch);
          return true;
        },
        sendSync: () => true,
      },
    });

    recordDiagnosticEvent("route_changed", { sessionId: "", workspaceId: "" });
    await flushDiagnostics();

    expect(sent).toHaveLength(0);
    // 送れなくてもブラウザ内バッファには残る。
    expect(recentDiagnosticEvents(10)).toHaveLength(1);
  });

  it("never throws when the transport itself explodes", async () => {
    configureClientDiagnosticsForTest({
      networkEnabled: true,
      transport: {
        send: async () => {
          throw new Error("network down");
        },
        sendSync: () => {
          throw new Error("beacon down");
        },
      },
    });

    recordDiagnosticEvent("ws_connected", scope(1));
    await expect(flushDiagnostics()).resolves.toBeUndefined();
    expect(pendingDiagnosticEventsForTest()).toHaveLength(1);
  });
});

describe("truncateStack", () => {
  it("clamps long stacks and leaves short ones untouched", () => {
    expect(truncateStack("short")).toBe("short");
    expect(truncateStack(null)).toBe("");
    const truncated = truncateStack("x".repeat(DIAGNOSTIC_MAX_STACK_CHARS + 500));
    expect(truncated.length).toBeLessThan(DIAGNOSTIC_MAX_STACK_CHARS + 100);
    expect(truncated.endsWith("[truncated]")).toBe(true);
  });
});

describe("diagnostics failure isolation", () => {
  beforeEach(() => resetClientDiagnosticsForTest());

  it("returns null instead of throwing when an event cannot be built", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const spy = vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
      throw new Error("clock unavailable");
    });
    expect(() => recordDiagnosticEvent("tree_state_changed", scope(1))).not.toThrow();
    spy.mockRestore();
  });
});
