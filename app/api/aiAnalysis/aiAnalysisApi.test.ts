import { describe, expect, it } from "vitest";

import {
  normalizeAIAnalysis,
  normalizeAgendaProgress,
  normalizeFinalizationAnalysis,
  type LiveAnalysisPayload,
} from "./aiAnalysisApi";

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

describe("normalizeAIAnalysis tree payload contract", () => {
  const normalizedPayload = (payload: Record<string, unknown>) =>
    normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 2,
      payload,
    })?.payload as LiveAnalysisPayload;

  it("distinguishes omitted, null, empty, snapshot, and explicit reset trees", () => {
    expect(normalizedPayload({ items: [] }).treePayloadState).toBe("omitted");
    expect(normalizedPayload({ items: [], tree: null }).treePayloadState).toBe("null");
    expect(normalizedPayload({ items: [], tree: { nodes: [], edges: [] } }).treePayloadState).toBe(
      "empty",
    );
    expect(
      normalizedPayload({
        items: [],
        tree: { nodes: [{ id: "root", kind: "topic", label: "会議" }], edges: [] },
      }).treePayloadState,
    ).toBe("snapshot");
    expect(normalizedPayload({ items: [], tree: null, treeReset: true })).toMatchObject({
      treePayloadState: "null",
      treeReset: true,
    });
  });

  it("marks a synthesized legacy tree as omitted instead of a full snapshot", () => {
    const payload = normalizedPayload({
      items: [
        {
          id: "risk-1",
          kind: "risk",
          severity: "high",
          title: "懸念",
          body: "確認が必要",
          status: "open",
        },
      ],
    });
    expect(payload.tree?.nodes).toHaveLength(2);
    expect(payload.treePayloadState).toBe("omitted");
  });
});

describe("agendaProgress normalization", () => {
  it("normalizes a fully-stamped payload and drops server-internal tracking fields", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 5,
      payload: {
        items: [],
        agendaProgress: {
          computedCurrentTopicId: "agenda-2",
          manualCurrentTopicId: "agenda-3",
          effectiveCurrentTopicId: "agenda-3",
          updatedAtVersion: 17,
          entries: [
            {
              id: "agenda-2",
              sourceType: "fixed_agenda",
              title: "原因調査と復旧対応",
              order: 2,
              computedStatus: "discussing",
              manualStatus: "discussed",
              effectiveStatus: "discussed",
              outcomeStatus: "concluded",
              discussionWeight: 0.62,
              relatedItemCounts: { issue: 2, risk: 1, todo: 1, decision: 1 },
              materializedTopicIds: ["topic-agenda-ab12cd34ef56"],
              primaryNodeId: "topic-agenda-ab12cd34ef56",
              lastProgressAtVersion: 16,
              activeRounds: 3,
              substantiveSegments: 7,
              weightRaw: 7.0,
              firstActiveVersion: 12,
              inactiveRounds: 0,
              outcomeExpectation: "decision",
            },
          ],
        },
      },
    });

    const payload = (analysis?.payload as LiveAnalysisPayload).agendaProgress;
    expect(payload).toEqual({
      computedCurrentTopicId: "agenda-2",
      manualCurrentTopicId: "agenda-3",
      effectiveCurrentTopicId: "agenda-3",
      entries: [
        {
          id: "agenda-2",
          sourceType: "fixed_agenda",
          title: "原因調査と復旧対応",
          order: 2,
          computedStatus: "discussing",
          manualStatus: "discussed",
          effectiveStatus: "discussed",
          outcomeStatus: "concluded",
          discussionWeight: 0.62,
          relatedItemCounts: { issue: 2, risk: 1, todo: 1, decision: 1 },
          materializedTopicId: "topic-agenda-ab12cd34ef56",
          materializedTopicIds: ["topic-agenda-ab12cd34ef56"],
          focusNodeIds: ["topic-agenda-ab12cd34ef56"],
          linkState: "materialized-topic",
          primaryNodeId: "topic-agenda-ab12cd34ef56",
        },
      ],
    });
  });

  it("fills effectiveStatus and effectiveCurrentTopicId from manual/computed when the server omits them", () => {
    const progress = normalizeAgendaProgress({
      computedCurrentTopicId: "agenda-1",
      entries: [
        {
          id: "agenda-1",
          sourceType: "fixed_agenda",
          title: "予算計画",
          computedStatus: "discussing",
        },
        {
          id: "agenda-2",
          sourceType: "fixed_agenda",
          title: "採用計画",
          computedStatus: "not_started",
          manualStatus: "discussed",
        },
      ],
    });

    expect(progress?.effectiveCurrentTopicId).toBe("agenda-1");
    expect(progress?.entries[0]).toMatchObject({ effectiveStatus: "discussing" });
    expect(progress?.entries[1]).toMatchObject({
      manualStatus: "discussed",
      effectiveStatus: "discussed",
    });
  });

  it("clamps discussionWeight to 0..1 and drops zero-count relatedItemCounts kinds", () => {
    const progress = normalizeAgendaProgress({
      entries: [
        {
          id: "agenda-1",
          sourceType: "fixed_agenda",
          title: "予算計画",
          computedStatus: "discussing",
          discussionWeight: 1.4,
          relatedItemCounts: { issue: 2, risk: 0 },
        },
      ],
    });

    expect(progress?.entries[0].discussionWeight).toBe(1);
    expect(progress?.entries[0].relatedItemCounts).toEqual({ issue: 2 });
  });

  it("excludes entries with an invalid status/sourceType or a missing title", () => {
    const progress = normalizeAgendaProgress({
      entries: [
        { id: "ok", sourceType: "fixed_agenda", title: "有効な項目", computedStatus: "discussing" },
        {
          id: "bad-status",
          sourceType: "fixed_agenda",
          title: "不正status",
          computedStatus: "bogus",
        },
        {
          id: "bad-source",
          sourceType: "bogus",
          title: "不正sourceType",
          computedStatus: "discussing",
        },
        { id: "no-title", sourceType: "fixed_agenda", title: "", computedStatus: "discussing" },
      ],
    });

    expect(progress?.entries).toHaveLength(1);
    expect(progress?.entries[0].id).toBe("ok");
  });

  it("leaves LiveAnalysisPayload.agendaProgress undefined for legacy payloads that omit the field", () => {
    const analysis = normalizeAIAnalysis({
      analysisType: "live",
      status: "completed",
      version: 1,
      payload: { items: [] },
    });

    expect((analysis?.payload as LiveAnalysisPayload).agendaProgress).toBeUndefined();
  });
});

describe("finalization progress normalization", () => {
  it("keeps the durable backend stage used by the ending dialog", () => {
    expect(
      normalizeFinalizationAnalysis({
        analysisType: "finalization",
        status: "running",
        version: 2,
        updatedAtUtc: "2026-07-23T10:00:00Z",
        payload: {
          finalizationId: "finalization-1",
          stage: "tree_saved",
          pendingSegmentCount: 0,
          finalizationIncomplete: false,
        },
      }),
    ).toEqual({
      analysisType: "finalization",
      status: "running",
      version: 2,
      updatedAtUtc: "2026-07-23T10:00:00Z",
      payload: {
        finalizationId: "finalization-1",
        stage: "tree_saved",
        pendingSegmentCount: 0,
        finalizationIncomplete: false,
      },
    });
  });

  it("rejects a missing stage instead of inventing progress", () => {
    expect(
      normalizeFinalizationAnalysis({
        analysisType: "finalization",
        status: "running",
        version: 1,
        payload: {},
      }),
    ).toBeNull();
  });
});
