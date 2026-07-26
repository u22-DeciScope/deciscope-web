import { beforeEach, describe, expect, it } from "vitest";

import {
  classifyTreeEmptiness,
  clearIntentionalTreeTeardown,
  currentIntentionalTreeTeardown,
  markIntentionalTreeTeardown,
  type TreeObservation,
} from "./treeEmptiness";

function observation(nodeCount: number, overrides: Partial<TreeObservation> = {}): TreeObservation {
  return {
    nodeCount,
    treeVersion: nodeCount > 0 ? 7 : null,
    analysisVersion: 12,
    rootNodeId: nodeCount > 0 ? "root" : "",
    sessionStatus: "recording",
    snapshotSource: nodeCount > 0 ? "live" : "",
    ...overrides,
  };
}

describe("classifyTreeEmptiness", () => {
  beforeEach(() => clearIntentionalTreeTeardown());

  it("does not flag a normal tree update", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(5),
      next: observation(7),
      cause: "analysis_event",
    });
    expect(verdict).toEqual({ anomaly: false, reason: "tree_not_empty" });
  });

  it("flags a 5 node tree that becomes empty without an explanation", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(5),
      next: observation(0),
      cause: "analysis_event",
    });
    expect(verdict).toEqual({ anomaly: true, reason: "unexpected_tree_clear" });
  });

  it("flags an empty REST snapshot the same way", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(5),
      next: observation(0),
      cause: "rest_snapshot",
    });
    expect(verdict.anomaly).toBe(true);
  });

  it("does not flag an explicit reset", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(5),
      next: observation(0),
      cause: "explicit_reset",
    });
    expect(verdict).toEqual({ anomaly: false, reason: "explicit_reset" });
  });

  it("does not flag moving to another session", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(5),
      next: observation(0),
      cause: "session_changed",
    });
    expect(verdict).toEqual({ anomaly: false, reason: "session_changed" });
  });

  it("does not flag a server requested tree reset", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(5),
      next: observation(0),
      cause: "analysis_event",
      explicitTreeReset: true,
    });
    expect(verdict).toEqual({ anomaly: false, reason: "explicit_tree_reset" });
  });

  it("does not flag logout or session deletion", () => {
    for (const reason of ["logout", "session_deleted"] as const) {
      const verdict = classifyTreeEmptiness({
        previous: observation(5),
        next: observation(0),
        cause: "analysis_event",
        intentionalTeardown: reason,
      });
      expect(verdict).toEqual({ anomaly: false, reason });
    }
  });

  it("does not flag a meeting that never had a tree", () => {
    const verdict = classifyTreeEmptiness({
      previous: observation(0, { sessionStatus: "created" }),
      next: observation(0, { sessionStatus: "created" }),
      cause: "rest_snapshot",
    });
    expect(verdict.anomaly).toBe(false);
  });
});

describe("intentional tree teardown marker", () => {
  beforeEach(() => clearIntentionalTreeTeardown());

  it("reports the reason until it expires", () => {
    markIntentionalTreeTeardown("logout", 1000);
    expect(currentIntentionalTreeTeardown(1500)).toBe("logout");
    expect(currentIntentionalTreeTeardown(6500)).toBeNull();
  });

  it("reports nothing when nothing was marked", () => {
    expect(currentIntentionalTreeTeardown()).toBeNull();
  });
});
