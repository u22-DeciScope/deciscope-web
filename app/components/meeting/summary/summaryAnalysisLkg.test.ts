import { beforeEach, describe, expect, it } from "vitest";

import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import {
  getMeetingAnalysisSessionStore,
  resetMeetingAnalysisSessionStoresForTest,
} from "~/hooks/meetingAnalysisSessionStore";

import { summaryAnalysisLastKnownGood } from "./summaryAnalysisLkg";

describe("summary route analysis LKG", () => {
  beforeEach(() => resetMeetingAnalysisSessionStoresForTest());

  it("seeds the summary route synchronously from the live route's 22-node store", () => {
    const sessionId = "session_8d9146da5fa85093";
    const workspaceId = "workspace-test";
    const nodes = Array.from({ length: 22 }, (_, index) => ({
      id: index === 0 ? "root" : `node-${index}`,
      kind: index === 0 ? "topic" : "fact",
      parentId: index === 0 ? undefined : "root",
      label: `node ${index}`,
    }));
    const payload: LiveAnalysisPayload = {
      tree: {
        nodes,
        edges: nodes.slice(1).map((node) => ({
          id: `root-${node.id}`,
          source: "root",
          target: node.id,
        })),
      },
      items: [
        {
          id: "todo-1",
          kind: "todo",
          severity: "medium",
          title: "確認する",
          body: "",
          status: "open",
        },
      ],
      treeVersion: 16,
      treePayloadState: "snapshot",
      payloadKind: "full_snapshot",
    };
    const analysis: MeetingAIAnalysis = {
      sessionId,
      analysisType: "live",
      status: "completed",
      version: 16,
      payload,
    };
    getMeetingAnalysisSessionStore(sessionId, workspaceId).dispatch({
      type: "analysis_event",
      analysis,
    });

    const seeded = summaryAnalysisLastKnownGood(sessionId, workspaceId);
    expect(seeded.tree?.nodes).toHaveLength(22);
    expect(seeded.treeVersion).toBe(16);
    expect(seeded.source).toBe("live");
    expect(seeded.liveAnalysis).toBe(analysis);
    expect(seeded.analysisItems).toHaveLength(1);

    // A second read represents a remount/StrictMode cycle and must not consume
    // or clear the shared LKG.
    expect(summaryAnalysisLastKnownGood(sessionId, workspaceId).tree?.nodes).toHaveLength(22);
  });
});
