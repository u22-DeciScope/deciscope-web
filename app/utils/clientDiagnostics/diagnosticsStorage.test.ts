import { beforeEach, describe, expect, it } from "vitest";

import {
  dropDiagnosticRecords,
  loadPersistedDiagnosticRecords,
  markDiagnosticRecordsSent,
  persistDiagnosticRecord,
  resetDiagnosticsStorageForTest,
} from "./diagnosticsStorage";
import {
  hydrateDiagnosticsFromStorage,
  recentDiagnosticEvents,
  recordDiagnosticEvent,
  resetClientDiagnosticsForTest,
} from "./clientDiagnostics";
import type { DiagnosticEvent } from "./diagnosticsTypes";

function record(sequence: number) {
  const event: DiagnosticEvent = {
    timestamp: new Date(Date.UTC(2026, 6, 25, 9, 0, sequence)).toISOString(),
    event: "tree_state_changed",
    sessionId: "session_abc",
    workspaceId: "w_test",
    tabId: "tab_1",
    route: "/w/w_test/meetings/session_abc",
    frontendBuildVersion: "dev",
    treeVersion: sequence,
    analysisVersion: sequence,
    updatedAt: "",
    nodeCount: sequence,
    rootNodeId: "root",
    sessionStatus: "recording",
    snapshotSource: "live",
    sequence,
  };
  return { recordKey: `load_x:${sequence}`, sequence, sent: false, event };
}

// jsdom は IndexedDB を実装していないため、ここで確認するのは
// 「IndexedDBが使えない環境でも診断機能が壊れないこと」。
describe("diagnostics storage without IndexedDB", () => {
  beforeEach(() => {
    resetDiagnosticsStorageForTest();
    resetClientDiagnosticsForTest();
  });

  it("degrades to a no-op instead of throwing", () => {
    expect(() => persistDiagnosticRecord(record(1))).not.toThrow();
    expect(() => markDiagnosticRecordsSent(["load_x:1"])).not.toThrow();
    expect(() => dropDiagnosticRecords(["load_x:1"])).not.toThrow();
  });

  it("resolves to an empty list when nothing can be read", async () => {
    await expect(loadPersistedDiagnosticRecords()).resolves.toEqual([]);
  });

  it("keeps recording events in memory when persistence is unavailable", async () => {
    recordDiagnosticEvent("tree_state_changed", {
      sessionId: "session_abc",
      workspaceId: "w_test",
      nodeCount: 4,
    });
    await expect(hydrateDiagnosticsFromStorage()).resolves.toBeUndefined();
    expect(recentDiagnosticEvents(10)).toHaveLength(1);
  });
});
