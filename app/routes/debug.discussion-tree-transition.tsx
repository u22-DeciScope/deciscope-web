import { useEffect, useState } from "react";

import type { TreeEdgePayload } from "~/api/meetings/meetingRuntimeTypes";
import {
  DiscussionTree,
  type DiscussionTreeFocusRequest,
} from "~/components/meeting/parts/discussionTree/DiscussionTree";
import {
  SESSION_28F3_ID,
  session28f3AnalysisItems,
  session28f3Snapshots,
} from "~/components/meeting/parts/discussionTree/__fixtures__/session28f3TreeSnapshots";
import { isMeetingStartDebugEnabled } from "~/utils/meetingStartDebug";

type Version = 12 | 13 | 14;
type HarnessMetrics = {
  version: Version;
  nodeCount: number;
  rootVisible: boolean;
  containerWidth: number;
  containerHeight: number;
  viewportTransform: string;
  viewportFinite: boolean;
  flowInstanceId: string;
  lkgRetained: boolean;
};

declare global {
  interface Window {
    __DECISCOPE_TREE_HARNESS__?: HarnessMetrics;
  }
}

export default function DebugDiscussionTreeTransition() {
  const [version, setVersion] = useState<Version>(12);
  const [containerMode, setContainerMode] = useState<"normal" | "narrow" | "zero">("normal");
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [focusItemRequest, setFocusItemRequest] = useState<DiscussionTreeFocusRequest | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [includeStaleEdge, setIncludeStaleEdge] = useState(false);
  const [metrics, setMetrics] = useState<HarnessMetrics | null>(null);
  const snapshot = session28f3Snapshots[version];
  const edges: TreeEdgePayload[] =
    version === 14 && includeStaleEdge
      ? [
          ...snapshot.edges,
          {
            id: "stale-v13-group-parent",
            source: "group-dd10e2044647",
            target: "item-issue-discussion-a742c0ebe0fe",
          },
        ]
      : snapshot.edges;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const flowRoot = document.querySelector<HTMLElement>("[data-discussion-flow-instance-id]");
      const canvas = document.querySelector<HTMLElement>('[data-testid="discussion-tree-canvas"]');
      const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
      const transform = viewport?.style.transform ?? "";
      const numericParts = transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const next: HarnessMetrics = {
        version,
        nodeCount: document.querySelectorAll(".react-flow__node").length,
        rootVisible: Boolean(document.querySelector('.react-flow__node[data-id="root"]')),
        containerWidth: canvas?.getBoundingClientRect().width ?? 0,
        containerHeight: canvas?.getBoundingClientRect().height ?? 0,
        viewportTransform: transform,
        viewportFinite: numericParts.length >= 3 && numericParts.every(Number.isFinite),
        flowInstanceId: flowRoot?.dataset.discussionFlowInstanceId ?? "",
        lkgRetained: flowRoot?.dataset.discussionLkgRetained === "true",
      };
      window.__DECISCOPE_TREE_HARNESS__ = next;
      setMetrics(next);
    }, 100);
    return () => window.clearInterval(timer);
  }, [version]);

  if (!isMeetingStartDebugEnabled()) {
    return (
      <main className="p-8">
        This debug route is disabled. Set VITE_DECISCOPE_DEBUG_MEETING_START=1.
      </main>
    );
  }

  const requestFocus = () => {
    const nextToken = focusToken + 1;
    setFocusToken(nextToken);
    setFocusItemRequest({
      itemId: "item-issue-discussion-a742c0ebe0fe",
      token: nextToken,
    });
  };
  const size =
    containerMode === "zero"
      ? { width: 0, height: 0 }
      : containerMode === "narrow"
        ? { width: 520, height: 380 }
        : { width: 920, height: 620 };

  return (
    <main className="min-h-screen bg-(--ds-bg) p-4" data-testid="discussion-tree-debug-route">
      <h1 className="mb-3 text-lg font-bold">session_28f3 tree transition harness</h1>
      <div className="mb-3 flex flex-wrap gap-2">
        {([12, 13, 14] as const).map((targetVersion) => (
          <button
            key={targetVersion}
            type="button"
            data-testid={`apply-v${targetVersion}`}
            className="rounded border px-3 py-1"
            onClick={() => setVersion(targetVersion)}
          >
            v{targetVersion}
          </button>
        ))}
        <button
          type="button"
          data-testid="container-zero"
          className="rounded border px-3 py-1"
          onClick={() => setContainerMode("zero")}
        >
          container 0×0
        </button>
        <button
          type="button"
          data-testid="container-narrow"
          className="rounded border px-3 py-1"
          onClick={() => setContainerMode("narrow")}
        >
          narrow
        </button>
        <button
          type="button"
          data-testid="container-restore"
          className="rounded border px-3 py-1"
          onClick={() => setContainerMode("normal")}
        >
          restore
        </button>
        <button
          type="button"
          data-testid="toggle-agenda"
          className="rounded border px-3 py-1"
          onClick={() => setAgendaExpanded((current) => !current)}
        >
          Agenda Progress
        </button>
        <button
          type="button"
          data-testid="request-focus"
          className="rounded border px-3 py-1"
          onClick={requestFocus}
        >
          focus request
        </button>
        <button
          type="button"
          data-testid="toggle-stale-edge"
          className="rounded border px-3 py-1"
          onClick={() => setIncludeStaleEdge((current) => !current)}
        >
          stale edge
        </button>
      </div>
      <section
        data-testid="agenda-progress-surrounding-layout"
        className="mb-2 overflow-hidden rounded bg-(--ds-surface-muted) transition-[height]"
        style={{ height: agendaExpanded ? 160 : 48 }}
      >
        Agenda Progress surrounding layout
      </section>
      <pre
        data-testid="harness-metrics"
        className="mb-2 max-w-[920px] overflow-auto rounded bg-black p-2 text-xs text-white"
      >
        {JSON.stringify(metrics, null, 2)}
      </pre>
      <div
        data-testid="tree-size-container"
        className="[&>*]:h-full"
        style={{ width: size.width, height: size.height }}
      >
        <DiscussionTree
          sessionId={SESSION_28F3_ID}
          nodes={snapshot.nodes}
          edges={edges}
          analysisItems={session28f3AnalysisItems}
          treeChanges={snapshot.treeChanges}
          analysisVersion={version}
          treeVersion={version}
          treeHash={snapshot.treeHash}
          layoutSignal={agendaExpanded}
          focusItemRequest={focusItemRequest}
        />
      </div>
    </main>
  );
}
