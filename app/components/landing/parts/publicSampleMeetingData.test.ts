import { describe, expect, it } from "vitest";

import {
  publicSampleAnalysisItems,
  publicSampleLiveAnalysis,
  publicSampleLiveHistory,
  publicSampleSession,
  publicSampleTranscriptSegments,
  publicSampleTreeEdges,
  publicSampleTreeNodes,
} from "~/components/landing/parts/publicSampleMeetingData";

describe("public sample meeting data", () => {
  it("represents a complete current-format meeting without authenticated data", () => {
    expect(publicSampleSession.status).toBe("ended");
    expect(publicSampleSession.workspaceId).toBeUndefined();
    expect(publicSampleTranscriptSegments).toHaveLength(8);
    expect(publicSampleTranscriptSegments.every((segment) => segment.isFinal)).toBe(true);

    const nodes = new Map(publicSampleTreeNodes.map((node) => [node.id, node]));
    expect(nodes.get("root")?.kind).toBe("topic");
    expect(nodes.get("root")?.parentId).toBeUndefined();
    expect(publicSampleTreeEdges).toHaveLength(publicSampleTreeNodes.length - 1);

    for (const item of publicSampleAnalysisItems) {
      expect(nodes.get(item.id)).toMatchObject({
        kind: item.kind,
        relatedItemIds: [item.id],
      });
      expect(item.evidenceSequenceNos?.length).toBeGreaterThan(0);
    }

    const payload = publicSampleLiveAnalysis.payload;
    expect(
      payload && "agendaProgress" in payload ? payload.agendaProgress?.entries : [],
    ).toHaveLength(3);
    expect(payload && "payloadKind" in payload ? payload.payloadKind : undefined).toBe(
      "full_snapshot",
    );

    const progressEntries =
      payload && "agendaProgress" in payload ? payload.agendaProgress?.entries : [];
    expect(progressEntries?.every((entry) => entry.discussionWeight !== undefined)).toBe(true);
    expect(progressEntries?.every((entry) => entry.relatedItemCounts !== undefined)).toBe(true);

    expect(publicSampleLiveHistory.map((analysis) => analysis.version)).toEqual([3, 5, 8]);
    expect(publicSampleLiveHistory.at(-1)).toBe(publicSampleLiveAnalysis);
    expect(
      publicSampleLiveHistory.every(
        (analysis) => analysis.sessionId === publicSampleSession.sessionId,
      ),
    ).toBe(true);
  });
});
