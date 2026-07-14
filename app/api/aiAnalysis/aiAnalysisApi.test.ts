import { describe, expect, it } from "vitest";

import { normalizeAIAnalysis, type LiveAnalysisPayload } from "./aiAnalysisApi";

describe("normalizeAIAnalysis live tree changes", () => {
  it("preserves open issues and the server structural diff", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 8,
      payload: {
        summary: "更新",
        items: [
          {
            id: "open-wind",
            kind: "open_issue",
            severity: "high",
            title: "風速基準が未確定",
            body: "基準を決める必要がある",
            status: "open",
          },
        ],
        treeVersion: 8,
        treeChanges: {
          treeVersion: 8,
          newNodeIds: ["group-wind", "group-wind"],
          reparentedNodeIds: ["open-wind", "missing"],
        },
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            { id: "group-wind", kind: "group", parentId: "root", label: "風速" },
            {
              id: "open-wind",
              kind: "open_issue",
              parentId: "group-wind",
              label: "風速基準が未確定",
            },
          ],
          edges: [],
        },
      },
    });

    const payload = analysis?.payload as LiveAnalysisPayload;
    expect(payload.items[0].kind).toBe("open_issue");
    expect(payload.treeVersion).toBe(8);
    expect(payload.treeChanges).toEqual({
      treeVersion: 8,
      newNodeIds: ["group-wind"],
      reparentedNodeIds: ["open-wind", "missing"],
    });
  });

  it("ignores a malformed structural diff", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 1,
      payload: { items: [], treeChanges: { newNodeIds: ["x"] } },
    });
    expect((analysis?.payload as LiveAnalysisPayload).treeChanges).toBeUndefined();
  });
});
