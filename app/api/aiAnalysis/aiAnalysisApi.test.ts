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
            classificationStatus: "tentative",
            candidateTopicId: "topic-wind",
            candidateInactive: true,
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
    expect(payload.items[0]).toMatchObject({
      classificationStatus: "tentative",
      candidateTopicId: "topic-wind",
      candidateInactive: true,
    });
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

  it("keeps the fixed agenda topic when a duplicate detail id reaches the client", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 12,
      payload: {
        items: [
          {
            id: "agenda-1",
            kind: "decision",
            severity: "high",
            title: "三地点で調査する",
            body: "",
            status: "open",
          },
        ],
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            {
              id: "agenda-1",
              kind: "decision",
              parentId: "agenda-1",
              label: "三地点で調査する",
            },
            {
              id: "agenda-1",
              kind: "topic",
              parentId: "root",
              label: "渡り鳥の調査計画",
              origin: "agenda",
              agendaRole: "primary",
            },
          ],
          edges: [],
        },
      },
    });

    const payload = analysis?.payload as LiveAnalysisPayload;
    expect(payload.tree?.nodes?.filter((node) => node.id === "agenda-1")).toEqual([
      expect.objectContaining({ kind: "topic", parentId: "root", origin: "agenda" }),
    ]);
    expect(payload.degraded).toBe(true);
    expect(payload.degradedReason).toBe("duplicate_node_id_filtered");
    expect(payload.treeIntegrity?.clientDuplicateNodeIds).toEqual(["agenda-1"]);
    expect(payload.treeIntegrity?.clientCrossKindIdCollisions).toEqual(["agenda-1"]);
  });
});
