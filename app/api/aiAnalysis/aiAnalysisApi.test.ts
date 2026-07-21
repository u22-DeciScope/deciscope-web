import { describe, expect, it } from "vitest";

import { normalizeAIAnalysis, type LiveAnalysisPayload } from "./aiAnalysisApi";

describe("normalizeAIAnalysis live tree changes", () => {
  it("migrates open issues to canonical issue subtypes and preserves the structural diff", () => {
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
            linked_segment_ids: ["segment-4"],
            evidenceSequenceNos: [4],
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
            {
              id: "group-wind",
              kind: "group",
              parentId: "root",
              label: "風速",
              agendaRefs: ["agenda-1"],
              agendaSplitGroupId: "agenda-1",
              materialized: true,
              speaker_label: "佐藤",
              segment_id: "segment-4",
              evidenceSequenceNos: [4],
            },
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
    expect(payload.items[0].kind).toBe("issue");
    expect(payload.items[0]).toMatchObject({
      subtype: "discussion",
      classificationStatus: "tentative",
      candidateTopicId: "topic-wind",
      candidateInactive: true,
      linked_segment_ids: ["segment-4"],
      evidenceSequenceNos: [4],
    });
    expect(payload.treeVersion).toBe(8);
    expect(payload.treeChanges).toEqual({
      treeVersion: 8,
      newNodeIds: ["group-wind"],
      reparentedNodeIds: ["open-wind", "missing"],
    });
    expect(payload.tree?.nodes?.find((node) => node.id === "open-wind")).toMatchObject({
      kind: "issue",
      subtype: "discussion",
    });
    expect(payload.tree?.nodes?.find((node) => node.id === "group-wind")).toMatchObject({
      agendaRefs: ["agenda-1"],
      agendaSplitGroupId: "agenda-1",
      materialized: true,
      speaker_label: "佐藤",
      segment_id: "segment-4",
      evidenceSequenceNos: [4],
    });
  });

  it("normalizes legacy semantic kinds without mixing subtype and status", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 3,
      payload: {
        items: [
          {
            id: "q",
            kind: "question",
            severity: "medium",
            title: "質問",
            body: "",
            status: "open",
          },
          {
            id: "c",
            kind: "confirmation",
            severity: "medium",
            title: "確認",
            body: "",
            status: "open",
          },
          {
            id: "r",
            kind: "resolved",
            severity: "medium",
            title: "解決",
            body: "",
            status: "open",
          },
        ],
      },
    });

    expect((analysis?.payload as LiveAnalysisPayload).items).toMatchObject([
      { id: "q", kind: "issue", subtype: "question", status: "open" },
      { id: "c", kind: "issue", subtype: "confirmation", status: "open" },
      { id: "r", kind: "issue", subtype: "discussion", status: "resolved" },
    ]);
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

  it("recognizes an agenda-linked topic by explicit references instead of its node id", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 13,
      payload: {
        items: [],
        treeIntegrity: {
          valid: true,
          agendaReferenceIntegrityValid: true,
          agendaNodeIdNamespaceValid: true,
          agendaTopicIdCollisions: [],
          orphanMaterializedTopicIds: [],
        },
        tree: {
          nodes: [
            { id: "root", kind: "topic", label: "会議" },
            {
              id: "topic-a1b2c3d4",
              kind: "decision",
              parentId: "root",
              label: "重複detail",
            },
            {
              id: "topic-a1b2c3d4",
              kind: "topic",
              parentId: "root",
              label: "渡り鳥の調査計画",
              agendaRefs: ["agenda-1"],
              materialized: true,
            },
          ],
          edges: [],
        },
      },
    });

    const payload = analysis?.payload as LiveAnalysisPayload;
    expect(payload.tree?.nodes?.filter((node) => node.id === "topic-a1b2c3d4")).toEqual([
      expect.objectContaining({
        kind: "topic",
        agendaRefs: ["agenda-1"],
        materialized: true,
      }),
    ]);
    expect(payload.treeIntegrity).toMatchObject({
      agendaReferenceIntegrityValid: true,
      agendaNodeIdNamespaceValid: true,
    });
  });
});
