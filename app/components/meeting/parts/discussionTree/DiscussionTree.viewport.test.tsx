import { createElement, StrictMode, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import {
  configureClientDiagnosticsForTest,
  pendingDiagnosticEventsForTest,
  recentDiagnosticEvents,
  resetClientDiagnosticsForTest,
} from "~/utils/clientDiagnostics/clientDiagnostics";
import type { DiagnosticBatch } from "~/utils/clientDiagnostics/diagnosticsTypes";

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => Promise.resolve(true)),
  getNode: vi.fn(),
  getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  setCenter: vi.fn((_x: number, _y: number, _options?: { zoom?: number; duration?: number }) =>
    Promise.resolve(true),
  ),
  setViewport: vi.fn(
    (_viewport: { x: number; y: number; zoom: number }, _options?: { duration?: number }) =>
      Promise.resolve(true),
  ),
  updateNodeInternals: vi.fn(),
  pane: { width: 900, height: 600 },
  throwRender: false,
  renderedNodeIds: ["root", "agenda-1", "item-1"],
  renderedNodes: [] as Array<{
    id: string;
    position?: { x: number; y: number };
    data?: { label?: string; momentLabel?: string };
  }>,
  renderedEdgeCount: 2,
  nodeRectMode: "visible" as "visible" | "offscreen" | "zero",
  nodesInitialized: true,
  nodeLayerOpacity: 1,
  ancestorVisibility: "visible" as "visible" | "hidden",
  occluded: false,
  staleDomNodeIds: null as string[] | null,
  descendantTag: null as "span" | "svg" | "button" | "h3" | "li" | null,
  onMoveStart: undefined as ((event: MouseEvent | null) => void) | undefined,
  onMoveEnd: undefined as ((event: MouseEvent | null) => void) | undefined,
  providerViewports: new Map<string, { x: number; y: number; zoom: number }>(),
  providerNodesInitialized: new Map<string, boolean>(),
  providerNodeLayerOpacity: new Map<string, number>(),
  renderedNodesByProvider: new Map<
    string,
    Array<{
      id: string;
      position?: { x: number; y: number };
      data?: { label?: string; momentLabel?: string };
    }>
  >(),
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");

  type MockFlowNode = {
    id: string;
    data?: { label?: string; momentLabel?: string };
    measured?: { width?: number; height?: number };
  };
  type MockFlowEdge = { id: string };
  type ProviderStore = {
    providerId: string;
    nodeLookup: Map<string, unknown>;
    edgeLookup: Map<string, unknown>;
    updateGraph: (nodes: MockFlowNode[], edges: MockFlowEdge[]) => void;
  };

  let providerSequence = 0;
  const ProviderStoreContext = React.createContext<ProviderStore | null>(null);
  const ReactFlowProvider = ({ children }: { children: ReactNode }) => {
    const providerIdRef = React.useRef("");
    if (!providerIdRef.current) {
      providerSequence += 1;
      providerIdRef.current = `provider-${providerSequence}`;
    }
    const [graph, setGraph] = React.useState<{
      nodes: MockFlowNode[];
      edges: MockFlowEdge[];
    }>({ nodes: [], edges: [] });
    const updateGraph = React.useCallback((nodes: MockFlowNode[], edges: MockFlowEdge[]) => {
      setGraph((current) =>
        current.nodes === nodes && current.edges === edges ? current : { nodes, edges },
      );
    }, []);
    const store = React.useMemo<ProviderStore>(
      () => ({
        providerId: providerIdRef.current,
        nodeLookup: new Map(
          graph.nodes.map((node) => [node.id, { ...node, internals: { userNode: node } }]),
        ),
        edgeLookup: new Map(graph.edges.map((edge) => [edge.id, edge])),
        updateGraph,
      }),
      [graph, updateGraph],
    );
    return <ProviderStoreContext.Provider value={store}>{children}</ProviderStoreContext.Provider>;
  };
  const useProviderStore = () => {
    const store = React.useContext(ProviderStoreContext);
    if (!store) {
      throw new Error("React Flow mock hooks must be rendered inside ReactFlowProvider");
    }
    return store;
  };

  return {
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    Controls: () => null,
    Handle: () => null,
    Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Position: { Left: "left", Right: "right" },
    ReactFlowProvider,
    ReactFlow: ({
      children,
      nodes,
      edges,
      onNodeClick,
      onMoveStart,
      onMoveEnd,
      proOptions,
    }: {
      children: ReactNode;
      nodes: MockFlowNode[];
      edges: MockFlowEdge[];
      onNodeClick?: (event: MouseEvent, node: { id: string }) => void;
      onMoveStart?: (event: MouseEvent | null) => void;
      onMoveEnd?: (event: MouseEvent | null) => void;
      proOptions?: { hideAttribution?: boolean };
    }) => {
      const providerStore = useProviderStore();
      React.useLayoutEffect(() => {
        providerStore.updateGraph(nodes, edges);
      }, [edges, nodes, providerStore.updateGraph]);
      if (flow.throwRender) {
        throw new Error("react flow failed");
      }
      flow.renderedNodeIds = nodes.map((node) => node.id);
      flow.renderedNodes = nodes;
      flow.renderedNodesByProvider.set(providerStore.providerId, nodes);
      const domNodes = flow.staleDomNodeIds
        ? flow.staleDomNodeIds.map((id) => ({ id, data: undefined }))
        : nodes;
      flow.renderedEdgeCount = edges.length;
      flow.onMoveStart = onMoveStart;
      flow.onMoveEnd = onMoveEnd;
      return (
        <div
          className="react-flow"
          data-testid="react-flow"
          data-provider-id={providerStore.providerId}
          data-hide-attribution={proOptions?.hideAttribution}
          style={{ visibility: flow.ancestorVisibility }}
        >
          <div className="react-flow__renderer">
            <div className="react-flow__viewport">
              <div
                className="react-flow__nodes"
                style={{
                  opacity:
                    flow.providerNodeLayerOpacity.get(providerStore.providerId) ??
                    flow.nodeLayerOpacity,
                }}
              >
                {domNodes.map((node, index) => (
                  <button
                    key={node.id}
                    type="button"
                    className="react-flow__node"
                    data-id={node.id}
                    data-testid={`flow-node-${node.id}`}
                    ref={(element) => {
                      if (!element) return;
                      element.getBoundingClientRect = () => {
                        const zero = flow.nodeRectMode === "zero";
                        const left =
                          flow.nodeRectMode === "offscreen"
                            ? 5_000 + index * 280
                            : 40 + index * 280;
                        const top = flow.nodeRectMode === "offscreen" ? 5_000 : 80;
                        const width = zero ? 0 : 260;
                        const height = zero ? 0 : 84;
                        return {
                          x: left,
                          y: top,
                          left,
                          top,
                          right: left + width,
                          bottom: top + height,
                          width,
                          height,
                          toJSON: () => ({}),
                        } as DOMRect;
                      };
                    }}
                    onClick={(event) => onNodeClick?.(event.nativeEvent, node)}
                  >
                    {node.id}
                    {flow.descendantTag
                      ? createElement(flow.descendantTag, {
                          "data-testid": `node-descendant-${flow.descendantTag}`,
                        })
                      : null}
                    {node.data?.momentLabel && <span>{node.data.momentLabel}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {flow.occluded && <div data-testid="tree-occluder" className="tree-test-occluder" />}
          {children}
        </div>
      );
    },
    useReactFlow: () => {
      const providerStore = useProviderStore();
      return React.useMemo(
        () => ({
          fitView: flow.fitView,
          getNode: flow.getNode,
          getViewport: () =>
            flow.providerViewports.get(providerStore.providerId) ?? flow.getViewport(),
          setCenter: async (
            x: number,
            y: number,
            options?: { zoom?: number; duration?: number },
          ) => {
            const applied = await flow.setCenter(x, y, options);
            if (applied) {
              const current =
                flow.providerViewports.get(providerStore.providerId) ?? flow.getViewport();
              const zoom = options?.zoom ?? current.zoom;
              flow.providerViewports.set(providerStore.providerId, {
                x: flow.pane.width / 2 - x * zoom,
                y: flow.pane.height / 2 - y * zoom,
                zoom,
              });
            }
            return applied;
          },
          setViewport: async (
            viewport: { x: number; y: number; zoom: number },
            options?: { duration?: number },
          ) => {
            const applied = await flow.setViewport(viewport, options);
            if (applied) {
              flow.providerViewports.set(providerStore.providerId, viewport);
            }
            return applied;
          },
        }),
        [providerStore.providerId],
      );
    },
    useUpdateNodeInternals: () => flow.updateNodeInternals,
    useNodesInitialized: () => {
      const providerStore = useProviderStore();
      return flow.providerNodesInitialized.get(providerStore.providerId) ?? flow.nodesInitialized;
    },
    useStore: (
      selector: (state: {
        width: number;
        height: number;
        nodeLookup: Map<string, unknown>;
        edgeLookup: Map<string, unknown>;
      }) => unknown,
    ) => {
      const providerStore = useProviderStore();
      // React Flow は adoptUserNodes(= nodes プロップの取り込み)まで measured を
      // 持たない。「まだ計測されていない buffer」を集約フラグだけでなく
      // measured 未設定としても再現する。
      const defaultMeasured =
        (flow.providerNodesInitialized.get(providerStore.providerId) ?? flow.nodesInitialized)
          ? { width: 260, height: 90 }
          : { width: undefined, height: undefined };
      const nodeLookup = new Map(
        [...providerStore.nodeLookup].map(([id, node]) => {
          const typed = node as { measured?: { width?: number; height?: number } };
          return [id, { ...typed, measured: typed.measured ?? defaultMeasured }];
        }),
      );
      return selector({
        ...flow.pane,
        nodeLookup,
        edgeLookup: providerStore.edgeLookup,
      });
    },
  };
});

import { DiscussionTree } from "./DiscussionTree";

const initialNodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "会議" },
  { id: "agenda-1", kind: "topic", parentId: "root", label: "騒音" },
  { id: "item-1", kind: "todo", parentId: "agenda-1", label: "確認" },
];
const initialEdges: TreeEdgePayload[] = [
  { id: "root-agenda", source: "root", target: "agenda-1" },
  { id: "agenda-item", source: "agenda-1", target: "item-1" },
];
const updatedNodes: TreeNodePayload[] = [
  ...initialNodes,
  { id: "group-1", kind: "group", parentId: "agenda-1", label: "強風条件" },
];
const updatedEdges: TreeEdgePayload[] = [
  ...initialEdges,
  { id: "agenda-group", source: "agenda-1", target: "group-1" },
];
const newestNodes: TreeNodePayload[] = [
  ...initialNodes,
  { id: "group-2", kind: "group", parentId: "agenda-1", label: "最新の構造" },
];
const newestEdges: TreeEdgePayload[] = [
  ...initialEdges,
  { id: "agenda-group-2", source: "agenda-1", target: "group-2" },
];

function committedSnapshotElement() {
  const element = document.querySelector<HTMLElement>(
    '[data-testid="discussion-tree-canvas"] > [data-discussion-snapshot-role="committed"]',
  );
  if (!element) throw new Error("committed discussion tree snapshot was not rendered");
  return element;
}

function committedSnapshotView() {
  return within(committedSnapshotElement());
}

describe("DiscussionTree structural viewport focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClientDiagnosticsForTest();
    // clearAllMocks はモック実装までは戻さない。個々のテストが差し替えた
    // fitView/setCenter/setViewport の実装(nodeRectMode を書き換えるものを含む)
    // が次のテストへ漏れると、実行順によって結果が変わるため既定値へ戻す。
    flow.fitView.mockImplementation(() => Promise.resolve(true));
    flow.setCenter.mockImplementation(() => Promise.resolve(true));
    flow.setViewport.mockImplementation(() => Promise.resolve(true));
    flow.getViewport.mockReturnValue({ x: 0, y: 0, zoom: 1 });
    flow.pane.width = 900;
    flow.pane.height = 600;
    flow.throwRender = false;
    flow.renderedNodeIds = ["root", "agenda-1", "item-1"];
    flow.renderedNodes = [];
    flow.renderedEdgeCount = 2;
    flow.nodeRectMode = "visible";
    flow.nodesInitialized = true;
    flow.nodeLayerOpacity = 1;
    flow.ancestorVisibility = "visible";
    flow.occluded = false;
    flow.staleDomNodeIds = null;
    flow.descendantTag = null;
    flow.onMoveStart = undefined;
    flow.onMoveEnd = undefined;
    flow.providerViewports.clear();
    flow.providerNodesInitialized.clear();
    flow.providerNodeLayerOpacity.clear();
    flow.renderedNodesByProvider.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => {
        const node = document.querySelector<HTMLElement>(".react-flow__node[data-id]");
        const occluder = document.querySelector<HTMLElement>(".tree-test-occluder");
        if (flow.occluded && occluder && node) return [occluder, node];
        return node ? [node] : [];
      }),
    });
  });

  it("uses a branching icon and omits the old explanatory subtitle", () => {
    render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);

    const title = screen.getByText("議論ツリー");
    expect(title.closest("header")?.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("論点・リスク・決定事項の関係")).toBeNull();
  });

  it("opens the matching assistant card when a tree node is clicked", () => {
    const onSelectAnalysisItem = vi.fn();
    render(
      <DiscussionTree
        nodes={initialNodes.map((node) =>
          node.id === "agenda-1" ? { ...node, relatedItemIds: ["item-1"] } : node,
        )}
        edges={initialEdges}
        analysisItems={[
          {
            id: "item-1",
            kind: "todo",
            severity: "medium",
            title: "確認",
            body: "",
            status: "open",
          },
        ]}
        onSelectAnalysisItem={onSelectAnalysisItem}
      />,
    );

    fireEvent.click(committedSnapshotView().getByTestId("flow-node-agenda-1"));
    expect(onSelectAnalysisItem).toHaveBeenCalledWith("item-1");
  });

  it("shows meeting elapsed time on a node linked to a transcript segment", () => {
    render(
      <DiscussionTree
        nodes={initialNodes.map((node) =>
          node.id === "item-1" ? { ...node, segment_id: "segment-2" } : node,
        )}
        edges={initialEdges}
        segments={[
          {
            meeting_id: "meeting-1",
            seq: 2,
            segment_id: "segment-2",
            speaker_label: "佐藤",
            text: "確認します",
            start_ms: 125_000,
            end_ms: 130_000,
            created_at: "2026-07-21T10:01:00Z",
          },
        ]}
      />,
    );

    expect(committedSnapshotView().getByText("経過 02:05")).not.toBeNull();
  });

  it("moves once for one tree version even under StrictMode", async () => {
    const view = render(
      <StrictMode>
        <DiscussionTree nodes={initialNodes} edges={initialEdges} />
      </StrictMode>,
    );
    expect(flow.setCenter).not.toHaveBeenCalled();

    view.rerender(
      <StrictMode>
        <DiscussionTree
          nodes={updatedNodes}
          edges={updatedEdges}
          treeChanges={{ treeVersion: 2, newNodeIds: ["group-1"] }}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(1));
  });

  it("keeps the committed tree visible until the incoming structural snapshot is ready", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-atomic-swap"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    expect(committedSnapshotView().getByTestId("flow-node-item-1")).not.toBeNull();
    const warmStandby = document.querySelector<HTMLElement>(
      '[data-testid="discussion-tree-canvas"] > [data-discussion-snapshot-role="standby"]',
    );
    const warmStandbyFlow = within(warmStandby!).getByTestId("react-flow");
    const warmProviderId = warmStandbyFlow.dataset.providerId as string;
    const warmNodeIds = flow.renderedNodesByProvider
      .get(warmProviderId)
      ?.map((node) => node.id)
      .sort();

    flow.nodesInitialized = false;
    view.rerender(
      <DiscussionTree
        sessionId="session-atomic-swap"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );

    const committed = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="committed"]',
    );
    const pending = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="pending"]',
    );
    expect(committed).not.toBeNull();
    expect(pending).not.toBeNull();
    expect(committed!.hasAttribute("inert")).toBe(false);
    expect(pending!.hasAttribute("inert")).toBe(true);
    expect(within(committed!).getByTestId("flow-node-item-1")).not.toBeNull();
    expect(within(committed!).queryByTestId("flow-node-group-1")).toBeNull();
    const committedFlowBefore = within(committed!).getByTestId("react-flow");
    const pendingFlowBefore = within(pending!).getByTestId("react-flow");
    const pendingFlowInstanceId = pending!.querySelector<HTMLElement>(
      "[data-discussion-flow-instance-id]",
    )?.dataset.discussionFlowInstanceId;
    const committedProviderId = committedFlowBefore.dataset.providerId as string;
    const pendingProviderId = pendingFlowBefore.dataset.providerId as string;
    expect(pendingFlowBefore).toBe(warmStandbyFlow);
    expect(pendingProviderId).toBe(warmProviderId);
    expect(warmNodeIds).toEqual(initialNodes.map((node) => node.id).sort());
    expect(
      flow.renderedNodesByProvider
        .get(pendingProviderId)
        ?.map((node) => node.id)
        .filter((id) => warmNodeIds?.includes(id))
        .sort(),
    ).toEqual(warmNodeIds);
    expect(pendingProviderId).not.toBe(committedProviderId);
    flow.providerNodesInitialized.set(committedProviderId, true);
    flow.providerNodesInitialized.set(pendingProviderId, false);

    view.rerender(
      <DiscussionTree
        sessionId="session-atomic-swap"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    expect(
      document.querySelector<HTMLElement>('[data-discussion-snapshot-role="committed"]')?.dataset
        .discussionSnapshotVersion,
    ).toBe("1");

    flow.providerNodesInitialized.set(pendingProviderId, true);
    view.rerender(
      <DiscussionTree
        sessionId="session-atomic-swap"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    await waitFor(() => {
      const promoted = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(promoted?.dataset.discussionSnapshotVersion).toBe("2");
      expect(promoted?.hasAttribute("inert")).toBe(false);
      expect(within(promoted!).getByTestId("react-flow")).toBe(pendingFlowBefore);
      expect(
        promoted?.querySelector<HTMLElement>("[data-discussion-flow-instance-id]")?.dataset
          .discussionFlowInstanceId,
      ).toBe(pendingFlowInstanceId);
    });
  });

  it("resets every buffered tree when the meeting session changes", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-before"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={9}
      />,
    );
    expect(committedSnapshotView().getByTestId("flow-node-item-1")).not.toBeNull();

    view.rerender(
      <DiscussionTree
        sessionId="session-after"
        nodes={newestNodes}
        edges={newestEdges}
        treeVersion={1}
      />,
    );

    await waitFor(() => {
      const committed = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(committed?.dataset.discussionSnapshotVersion).toBe("1");
      expect(committed?.dataset.discussionSnapshotGeneration).toBe("1");
      expect(within(committed!).getByTestId("flow-node-group-2")).not.toBeNull();
      expect(within(committed!).queryByTestId("flow-node-group-1")).toBeNull();
    });
    expect(
      document.querySelectorAll(
        '[data-testid="discussion-tree-canvas"] > [data-discussion-snapshot-role="committed"]',
      ),
    ).toHaveLength(1);
  });

  it("updates metadata on the same pending provider without restarting its generation", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-pending-metadata"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    flow.nodesInitialized = false;
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-metadata"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    const metadataNodes = updatedNodes.map((node) =>
      node.id === "group-1" ? { ...node, label: "準備中に更新されたラベル" } : { ...node },
    );
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-metadata"
        nodes={metadataNodes}
        edges={[...updatedEdges]}
        treeVersion={3}
      />,
    );
    const pending = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="pending"]',
    );
    expect(pending?.dataset.discussionSnapshotGeneration).toBe("2");
    expect(pending?.dataset.discussionSnapshotVersion).toBe("3");
    expect(
      recentDiagnosticEvents(100).filter((event) => event.event === "tree_swap_started"),
    ).toHaveLength(1);

    flow.nodesInitialized = true;
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-metadata"
        nodes={metadataNodes}
        edges={[...updatedEdges]}
        treeVersion={3}
      />,
    );
    await waitFor(() => {
      const committed = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(committed?.dataset.discussionSnapshotVersion).toBe("3");
      expect(flow.renderedNodes.find((node) => node.id === "group-1")?.data?.label).toBe(
        "準備中に更新されたラベル",
      );
    });
  });

  it("commits the newest same-layout metadata after rejecting an older child callback", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-pending-metadata-order"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    flow.nodesInitialized = false;
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-metadata-order"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    const newestMetadata = updatedNodes.map((node) =>
      node.id === "group-1" ? { ...node, description: "newest metadata" } : node,
    );
    flow.nodesInitialized = true;
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-metadata-order"
        nodes={newestMetadata}
        edges={updatedEdges}
        treeVersion={3}
      />,
    );

    await waitFor(() =>
      expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("3"),
    );
    expect(
      recentDiagnosticEvents(100).filter(
        (event) => event.event === "tree_swap_committed" && event.treeVersion === 2,
      ),
    ).toHaveLength(0);
  });

  it("keeps meeting text out of atomic swap diagnostics", async () => {
    const sensitiveMarker = "PRIVATE-MEETING-TEXT-DO-NOT-LOG";
    const privateInitial = initialNodes.map((node) => ({
      ...node,
      label: `${node.label}-${sensitiveMarker}`,
    }));
    const privateUpdated = [
      ...privateInitial,
      {
        id: "private-group",
        kind: "group",
        parentId: "agenda-1",
        label: sensitiveMarker,
      } as TreeNodePayload,
    ];
    const view = render(
      <DiscussionTree
        sessionId="session-private-diagnostics"
        nodes={privateInitial}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    view.rerender(
      <DiscussionTree
        sessionId="session-private-diagnostics"
        nodes={privateUpdated}
        edges={[
          ...initialEdges,
          { id: "agenda-private", source: "agenda-1", target: "private-group" },
        ]}
        treeVersion={2}
      />,
    );
    await waitFor(() =>
      expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("2"),
    );
    expect(JSON.stringify(recentDiagnosticEvents(100))).not.toContain(sensitiveMarker);
    expect(JSON.stringify(pendingDiagnosticEventsForTest())).not.toContain(sensitiveMarker);
  });

  it("does not promote a pending tree until its DOM nodes have non-zero dimensions", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-pending-dom-size"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    flow.nodeRectMode = "zero";
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-dom-size"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(
      document.querySelector<HTMLElement>('[data-discussion-snapshot-role="committed"]')?.dataset
        .discussionSnapshotVersion,
    ).toBe("1");

    flow.nodeRectMode = "visible";
    // Real React Flow updates its measured store/ResizeObserver here. Change
    // the mocked layer style to trigger the component's DOM observer too.
    flow.nodeLayerOpacity = 0.99;
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-dom-size"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[data-discussion-snapshot-role="committed"]')?.dataset
          .discussionSnapshotVersion,
      ).toBe("2"),
    );
  });

  it("keeps the previous tree when the pending React Flow node layer cannot paint", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-pending-hidden-layer"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    const standby = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="standby"]',
    );
    const standbyProviderId = within(standby!).getByTestId("react-flow").dataset
      .providerId as string;
    flow.providerNodeLayerOpacity.set(standbyProviderId, 0);

    view.rerender(
      <DiscussionTree
        sessionId="session-pending-hidden-layer"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[data-discussion-snapshot-role="pending"]')?.dataset
          .discussionSnapshotVersion,
      ).toBe("2"),
    );
    expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("1");
    expect(
      recentDiagnosticEvents(100).some(
        (event) => event.event === "tree_swap_committed" && event.treeVersion === 2,
      ),
    ).toBe(false);

    flow.providerNodeLayerOpacity.set(standbyProviderId, 1);
    view.rerender(
      <DiscussionTree
        sessionId="session-pending-hidden-layer"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    await waitFor(() =>
      expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("2"),
    );
  });

  it("rejects a ready callback for an older pending tree after newer props render", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-effect-order"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    flow.nodesInitialized = false;
    view.rerender(
      <DiscussionTree
        sessionId="session-effect-order"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );

    // The old child becomes ready in the same commit where the parent first
    // sees v3. Child effects run before the parent's adoption effect.
    flow.nodesInitialized = true;
    view.rerender(
      <DiscussionTree
        sessionId="session-effect-order"
        nodes={newestNodes}
        edges={newestEdges}
        treeVersion={3}
      />,
    );

    await waitFor(() => {
      const committed = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(committed?.dataset.discussionSnapshotVersion).toBe("3");
      expect(within(committed!).getByTestId("flow-node-group-2")).not.toBeNull();
    });
    expect(
      recentDiagnosticEvents(100).filter(
        (event) => event.event === "tree_swap_committed" && event.treeVersion === 2,
      ),
    ).toHaveLength(0);
  });

  it("never commits a superseded pending snapshot after a newer version arrives", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-rapid-swap"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    flow.nodesInitialized = false;
    view.rerender(
      <DiscussionTree
        sessionId="session-rapid-swap"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );
    const pendingV2 = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="pending"]',
    );
    const pendingFlowV2 = within(pendingV2!).getByTestId("react-flow");
    const pendingProviderId = pendingFlowV2.dataset.providerId as string;
    await waitFor(() =>
      expect(
        flow.renderedNodesByProvider.get(pendingProviderId)?.some((node) => node.id === "group-1"),
      ).toBe(true),
    );
    const v2Nodes = new Map(
      flow.renderedNodesByProvider.get(pendingProviderId)?.map((node) => [node.id, node]),
    );
    view.rerender(
      <DiscussionTree
        sessionId="session-rapid-swap"
        nodes={newestNodes}
        edges={newestEdges}
        treeVersion={3}
      />,
    );
    const pendingV3 = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="pending"]',
    );
    expect(within(pendingV3!).getByTestId("react-flow")).toBe(pendingFlowV2);
    await waitFor(() =>
      expect(
        flow.renderedNodesByProvider.get(pendingProviderId)?.some((node) => node.id === "group-2"),
      ).toBe(true),
    );
    const v3Nodes = new Map(
      flow.renderedNodesByProvider.get(pendingProviderId)?.map((node) => [node.id, node]),
    );
    for (const id of ["root", "agenda-1", "item-1"]) {
      expect(v3Nodes.get(id)).toBe(v2Nodes.get(id));
    }
    const committedBeforeReady = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="committed"]',
    );
    expect(within(committedBeforeReady!).queryByTestId("flow-node-group-1")).toBeNull();
    expect(within(committedBeforeReady!).queryByTestId("flow-node-group-2")).toBeNull();

    flow.nodesInitialized = true;
    view.rerender(
      <DiscussionTree
        sessionId="session-rapid-swap"
        nodes={newestNodes}
        edges={newestEdges}
        treeVersion={3}
      />,
    );
    await waitFor(() => {
      const committed = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(committed?.dataset.discussionSnapshotVersion).toBe("3");
      expect(within(committed!).getByTestId("flow-node-group-2")).not.toBeNull();
      expect(within(committed!).queryByTestId("flow-node-group-1")).toBeNull();
    });
    expect(
      recentDiagnosticEvents(100).filter(
        (event) => event.event === "tree_swap_committed" && event.treeVersion === 2,
      ),
    ).toHaveLength(0);
  });

  it("keeps the previous committed tree when pending layout validation fails", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session-invalid-pending"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    const invalidNodes: TreeNodePayload[] = [
      ...initialNodes,
      { id: "orphan", kind: "issue", parentId: "missing-parent", label: "孤立" },
    ];
    view.rerender(
      <DiscussionTree
        sessionId="session-invalid-pending"
        nodes={invalidNodes}
        edges={initialEdges}
        treeVersion={2}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.event === "tree_swap_kept_previous" && event.treeVersion === 1,
        ),
      ).toBe(true),
    );
    const committed = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="committed"]',
    );
    expect(committed?.dataset.discussionSnapshotVersion).toBe("1");
    expect(within(committed!).queryByTestId("flow-node-orphan")).toBeNull();
    expect(document.querySelector('[data-discussion-snapshot-role="pending"]')).toBeNull();
  });

  it("reuses unchanged React Flow node objects for metadata-only updates", async () => {
    const view = render(
      <DiscussionTree nodes={initialNodes} edges={initialEdges} treeVersion={1} />,
    );
    const providerId = committedSnapshotView().getByTestId("react-flow").dataset
      .providerId as string;
    await waitFor(() =>
      expect(flow.renderedNodesByProvider.get(providerId)).toHaveLength(initialNodes.length),
    );
    const before = new Map(
      flow.renderedNodesByProvider.get(providerId)?.map((node) => [node.id, node]),
    );
    const metadataNodes = initialNodes.map((node) =>
      node.id === "item-1" ? { ...node, label: "確認済みの更新" } : { ...node },
    );
    view.rerender(
      <DiscussionTree nodes={metadataNodes} edges={[...initialEdges]} treeVersion={2} />,
    );
    await waitFor(() =>
      expect(
        flow.renderedNodesByProvider.get(providerId)?.find((node) => node.id === "item-1")?.data
          ?.label,
      ).toBe("確認済みの更新"),
    );
    const after = new Map(
      flow.renderedNodesByProvider.get(providerId)?.map((node) => [node.id, node]),
    );
    expect(after.get("root")).toBe(before.get("root"));
    expect(after.get("agenda-1")).toBe(before.get("agenda-1"));
    expect(after.get("item-1")).not.toBe(before.get("item-1"));
    expect(after.get("root")?.position).toBe(before.get("root")?.position);
  });

  it("preserves the selected user's viewport while a structural buffer is promoted", async () => {
    const view = render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);
    // ノードクリックは仕様上そのノードへのフォーカス要求でもあるため、この1回だけ
    // setCenterが呼ばれる。構造更新の昇格がそれ以上viewportへ触れないことを見る。
    fireEvent.click(committedSnapshotView().getByTestId("flow-node-item-1"));
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(1));
    flow.setCenter.mockClear();
    view.rerender(
      <DiscussionTree
        nodes={updatedNodes}
        edges={updatedEdges}
        treeChanges={{ treeVersion: 2, newNodeIds: ["group-1"] }}
      />,
    );
    expect(flow.setCenter).not.toHaveBeenCalled();
    await waitFor(() => {
      const committed = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(within(committed!).getByTestId("flow-node-group-1")).not.toBeNull();
    });
    expect(flow.setCenter).not.toHaveBeenCalled();
  });

  it("uses an immediate center only after reduced-motion atomic promotion", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    const view = render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);
    view.rerender(
      <DiscussionTree
        nodes={updatedNodes}
        edges={updatedEdges}
        treeChanges={{ treeVersion: 2, newNodeIds: ["group-1"] }}
      />,
    );
    await waitFor(() =>
      expect(
        document
          .querySelector('[data-discussion-snapshot-role="committed"]')
          ?.getAttribute("data-discussion-snapshot-generation"),
      ).toBe("2"),
    );
    expect(flow.setCenter).toHaveBeenCalledTimes(1);
    expect(flow.setCenter.mock.calls[0]?.[2]).toMatchObject({ duration: 0 });
  });

  it("waits for a programmatic focus to settle before promoting the next snapshot", async () => {
    let resolveCenter: ((applied: boolean) => void) | undefined;
    flow.setCenter.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCenter = resolve;
        }),
    );
    const view = render(
      <DiscussionTree
        sessionId="session-programmatic-focus"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    view.rerender(
      <DiscussionTree
        sessionId="session-programmatic-focus"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
        treeChanges={{ treeVersion: 2, newNodeIds: ["group-1"] }}
      />,
    );
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("2"),
    );
    const focusedProviderId = committedSnapshotView().getByTestId("react-flow").dataset
      .providerId as string;

    view.rerender(
      <DiscussionTree
        sessionId="session-programmatic-focus"
        nodes={newestNodes}
        edges={newestEdges}
        treeVersion={3}
        treeChanges={{ treeVersion: 3, newNodeIds: ["group-2"] }}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[data-discussion-snapshot-role="pending"]')?.dataset
          .discussionSnapshotVersion,
      ).toBe("3"),
    );
    expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("2");

    await act(async () => resolveCenter?.(true));
    const focusedViewport = flow.providerViewports.get(focusedProviderId);
    expect(focusedViewport).toBeDefined();
    await waitFor(() =>
      expect(committedSnapshotElement().dataset.discussionSnapshotVersion).toBe("3"),
    );
    expect(
      flow.setViewport.mock.calls.some(
        ([viewport]) => JSON.stringify(viewport) === JSON.stringify(focusedViewport),
      ),
    ).toBe(true);
  });

  it("renders no action projection or reference node under StrictMode", () => {
    const actionNodes: TreeNodePayload[] = [
      ...initialNodes,
      {
        id: "agenda-actions",
        kind: "topic",
        parentId: "root",
        label: "今後の対応事項",
        agendaRole: "action_summary",
      },
    ];
    const actionEdges: TreeEdgePayload[] = [
      ...initialEdges,
      { id: "root-actions", source: "root", target: "agenda-actions" },
    ];
    const items: AnalysisItem[] = [
      {
        id: "item-1",
        kind: "todo",
        severity: "medium",
        title: "気象データを確認する",
        body: "基準風速の判断材料",
        status: "open",
        relatedAgendaIds: ["agenda-actions", "agenda-actions"],
      },
    ];
    render(
      <StrictMode>
        <DiscussionTree nodes={actionNodes} edges={actionEdges} analysisItems={items} />
      </StrictMode>,
    );

    expect(committedSnapshotView().getAllByTestId("flow-node-item-1")).toHaveLength(1);
    expect(committedSnapshotView().queryByTestId(/flow-node-agenda-reference/)).toBeNull();
    expect(screen.queryByTestId("discussion-tree-projections")).toBeNull();
    expect(screen.queryByText("今後の対応事項")).toBeNull();
  });

  it("keeps nodes rendered and defers fitView while the container is 0x0", async () => {
    flow.pane.width = 0;
    flow.pane.height = 0;
    const view = render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);

    expect(committedSnapshotView().getAllByTestId(/flow-node-/)).toHaveLength(initialNodes.length);
    expect(flow.fitView).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_render_anomaly" &&
            String(event.details?.reason).startsWith("container_zero_"),
        ),
      ).toBe(true),
    );

    flow.pane.width = 900;
    flow.pane.height = 600;
    view.rerender(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_render_recovery" &&
            event.details?.reason === "container_size_recovered",
        ),
      ).toBe(true),
    );
  });

  it("sends an API diagnostic when canonical store nodes are filtered to zero", async () => {
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
    const canonicalNodes: TreeNodePayload[] = Array.from({ length: 10 }, (_, index) => ({
      id: index === 0 ? "root" : `node-${index}`,
      kind: index === 0 ? "topic" : "todo",
      parentId: index === 0 ? undefined : "root",
      label: `node ${index}`,
    }));
    const canonicalEdges: TreeEdgePayload[] = canonicalNodes.slice(1).map((node) => ({
      id: `root-${node.id}`,
      source: "root",
      target: node.id,
    }));
    const tentativeItems: AnalysisItem[] = canonicalNodes.map((node) => ({
      id: node.id,
      kind: "todo",
      severity: "medium",
      title: node.label ?? node.id,
      body: "",
      status: "open",
      classificationStatus: "tentative",
    }));

    render(
      <DiscussionTree
        sessionId="session_render_empty"
        workspaceId="workspace_render"
        nodes={canonicalNodes}
        edges={canonicalEdges}
        analysisItems={tentativeItems}
        treeVersion={10}
      />,
    );

    await waitFor(() => {
      const anomaly = recentDiagnosticEvents(100).find(
        (event) => event.event === "tree_render_anomaly",
      );
      expect(anomaly?.details).toMatchObject({
        storeNodeCount: 10,
        reactFlowNodeCount: 0,
        renderedDomNodeCount: 0,
        currentTreeVersion: 10,
        renderCommitted: false,
      });
    });
    await waitFor(() =>
      expect(
        sent
          .flatMap((batch) => batch.events)
          .some((event) => event.event === "tree_render_anomaly"),
        JSON.stringify({
          sent: sent.flatMap((batch) => batch.events).map((event) => event.event),
          pending: pendingDiagnosticEventsForTest().map((event) => ({
            event: event.event,
            sessionId: event.sessionId,
            workspaceId: event.workspaceId,
          })),
        }),
      ).toBe(true),
    );
  });

  it("keeps rendering when the diagnostics transport fails", async () => {
    configureClientDiagnosticsForTest({
      networkEnabled: true,
      transport: {
        send: async () => {
          throw new Error("diagnostics unavailable");
        },
        sendSync: () => {
          throw new Error("diagnostics beacon unavailable");
        },
      },
    });

    render(
      <DiscussionTree
        sessionId="session_render_transport_failure"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
      />,
    );

    expect(committedSnapshotView().getAllByTestId(/flow-node-/)).toHaveLength(initialNodes.length);
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some((event) => event.event.startsWith("tree_render_")),
      ).toBe(true),
    );
    expect(committedSnapshotView().getAllByTestId(/flow-node-/)).toHaveLength(initialNodes.length);
  });

  it("retries a layout fit requested while another fitView is still pending", async () => {
    let resolvePendingFit: ((applied: boolean) => void) | undefined;
    flow.fitView
      .mockImplementationOnce(() => Promise.resolve(true))
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolvePendingFit = resolve;
          }),
      )
      .mockImplementation(() => Promise.resolve(true));
    const view = render(
      <DiscussionTree nodes={initialNodes} edges={initialEdges} layoutSignal={false} />,
    );
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledTimes(1));

    view.rerender(<DiscussionTree nodes={initialNodes} edges={initialEdges} layoutSignal />);
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledTimes(2));
    view.rerender(
      <DiscussionTree nodes={initialNodes} edges={initialEdges} layoutSignal={false} />,
    );
    expect(flow.fitView).toHaveBeenCalledTimes(2);

    await act(async () => resolvePendingFit?.(true));
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledTimes(3));
    expect(committedSnapshotView().getAllByTestId(/flow-node-/)).toHaveLength(initialNodes.length);
  });

  it("shows the non-empty waiting state and skips fitView when there are no targets", () => {
    render(<DiscussionTree nodes={[]} edges={[]} />);

    expect(screen.getByText("議論構造を待っています")).toBeTruthy();
    expect(flow.fitView).not.toHaveBeenCalled();
  });

  it("does not call setCenter with an invalid viewport", async () => {
    flow.getViewport.mockReturnValue({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: 0 });
    const view = render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    flow.fitView.mockClear();

    view.rerender(
      <DiscussionTree
        nodes={updatedNodes}
        edges={updatedEdges}
        treeChanges={{ treeVersion: 2, newNodeIds: ["group-1"] }}
      />,
    );
    // 構造更新は準備用bufferの出現として観測する。以前はここで初回フィットが
    // 二度目に走るのを待っていたが、tree更新のたびに再フィットしてユーザーの
    // viewportを奪う挙動そのものを取り除いたため、同期点を差し替える。
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[data-discussion-snapshot-role="pending"]'),
      ).not.toBeNull(),
    );
    expect(flow.fitView).not.toHaveBeenCalled();
    expect(flow.setCenter).not.toHaveBeenCalled();
    const committed = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="committed"]',
    );
    expect(within(committed!).getAllByTestId(/flow-node-/)).toHaveLength(initialNodes.length);
    expect(
      recentDiagnosticEvents(100).some(
        (event) =>
          event.event === "tree_visibility_unhealthy" &&
          event.details?.reason === "invalid_transform",
      ),
    ).toBe(true);
  });

  it("detects committed offscreen nodes and recovers without remounting", async () => {
    flow.fitView.mockImplementation(() => {
      flow.nodeRectMode = "visible";
      return Promise.resolve(true);
    });
    const view = render(
      <DiscussionTree
        sessionId="session_offscreen"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_render_state" &&
            event.details?.visibilityHealth === "healthy_visible",
        ),
      ).toBe(true),
    );
    const instanceId = document
      .querySelector("[data-discussion-flow-instance-id]")
      ?.getAttribute("data-discussion-flow-instance-id");
    flow.fitView.mockClear();
    flow.nodeRectMode = "offscreen";

    view.rerender(
      <DiscussionTree
        sessionId="session_offscreen"
        workspaceId="workspace_render"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_exist_but_offscreen" &&
            event.details?.visibleNodeCount === 0 &&
            event.details?.recoveryMethod === "fit_view",
        ),
      ).toBe(true),
    );
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_recovered" &&
            Number(event.details?.visibleNodeCountAfter) > 0,
        ),
      ).toBe(true),
    );
    const promoted = document.querySelector<HTMLElement>(
      '[data-discussion-snapshot-role="committed"]',
    );
    expect(
      promoted
        ?.querySelector("[data-discussion-flow-instance-id]")
        ?.getAttribute("data-discussion-flow-instance-id"),
    ).not.toBe(instanceId);
    expect(within(promoted!).getAllByTestId(/flow-node-/)).toHaveLength(updatedNodes.length);
  });

  it("centers the root when automatic fitView leaves every node invisible", async () => {
    const view = render(
      <DiscussionTree
        sessionId="session_offscreen_center"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.details?.visibilityHealth === "healthy_visible",
        ),
      ).toBe(true),
    );
    flow.fitView.mockClear();
    flow.setCenter.mockClear();
    flow.nodeRectMode = "offscreen";
    flow.fitView.mockResolvedValue(true);

    view.rerender(
      <DiscussionTree
        sessionId="session_offscreen_center"
        workspaceId="workspace_render"
        nodes={updatedNodes}
        edges={updatedEdges}
        treeVersion={2}
      />,
    );

    await waitFor(() =>
      expect(
        flow.setCenter.mock.calls.some((call) => call[2]?.zoom === 1 && call[2]?.duration === 0),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_render_anomaly" &&
            event.details?.phase === "fit_view_completed" &&
            event.details?.recoveryMethod === "fit_view_then_center_root" &&
            event.details?.recoveryResult === "still_not_visible",
        ),
      ).toBe(true),
    );
  });

  it("does not report a transparent React Flow node layer as healthy", async () => {
    flow.nodeLayerOpacity = 0;
    render(
      <DiscussionTree
        sessionId="session_transparent"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "node_layer_transparent",
        ),
      ).toBe(true),
    );
    expect(
      recentDiagnosticEvents(100).some(
        (event) => event.details?.visibilityHealth === "healthy_visible",
      ),
    ).toBe(false);
  });

  it("detects a hidden ancestor instead of reporting intersecting nodes as healthy", async () => {
    flow.ancestorVisibility = "hidden";
    render(
      <DiscussionTree
        sessionId="session_hidden_ancestor"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "ancestor_hidden" &&
            event.details?.ancestorHidden === true,
        ),
      ).toBe(true),
    );
  });

  it("rechecks a committed ancestor that becomes hidden and visible again", async () => {
    render(
      <DiscussionTree
        sessionId="session_dynamic_ancestor"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.details?.visibilityHealth === "healthy_visible",
        ),
      ).toBe(true),
    );
    const wrapper = document.querySelector<HTMLElement>("[data-discussion-tree-panel]")
      ?.parentElement as HTMLElement;
    const unhealthyBefore = recentDiagnosticEvents(100).filter(
      (event) =>
        event.event === "tree_visibility_unhealthy" && event.details?.reason === "ancestor_hidden",
    ).length;
    wrapper.style.opacity = "0";
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).filter(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "ancestor_hidden",
        ).length,
      ).toBeGreaterThan(unhealthyBefore),
    );

    const recoveredBefore = recentDiagnosticEvents(100).filter(
      (event) => event.event === "tree_visibility_recovered",
    ).length;
    wrapper.style.opacity = "1";
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).filter((event) => event.event === "tree_visibility_recovered")
          .length,
      ).toBeGreaterThan(recoveredBefore),
    );
  });

  it("does not report geometrically intersecting but fully occluded nodes as healthy", async () => {
    flow.occluded = true;
    render(
      <DiscussionTree
        sessionId="session_occluded"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_exist_but_fully_occluded" &&
            event.details?.unoccludedVisibleNodeCount === 0,
        ),
      ).toBe(true),
    );
  });

  it("rechecks visibility when an external panel overlay appears and is removed", async () => {
    render(
      <DiscussionTree
        sessionId="session_dynamic_overlay"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.details?.visibilityHealth === "healthy_visible",
        ),
      ).toBe(true),
    );

    flow.occluded = true;
    const overlay = document.createElement("div");
    overlay.className = "tree-test-occluder";
    overlay.setAttribute("data-discussion-tree-occluder", "external-test-overlay");
    document.querySelector<HTMLElement>("[data-discussion-tree-panel]")?.appendChild(overlay);
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_exist_but_fully_occluded",
        ),
      ).toBe(true),
    );

    flow.occluded = false;
    overlay.remove();
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some((event) => event.event === "tree_visibility_recovered"),
      ).toBe(true),
    );
  });

  it.each(["span", "svg", "button", "h3", "li"] as const)(
    "does not treat a node-owned %s descendant as an occluder",
    async (tag) => {
      flow.descendantTag = tag;
      Object.defineProperty(document, "elementsFromPoint", {
        configurable: true,
        value: vi.fn(() => {
          const node = document.querySelector<HTMLElement>(".react-flow__node[data-id]");
          const descendant = node?.querySelector(tag);
          return descendant && node ? [descendant, node] : node ? [node] : [];
        }),
      });
      render(
        <DiscussionTree
          sessionId={`session_descendant_${tag}`}
          workspaceId="workspace_render"
          nodes={[initialNodes[0]]}
          edges={[]}
          treeVersion={1}
        />,
      );

      await waitFor(() =>
        expect(
          recentDiagnosticEvents(100).some(
            (event) => event.details?.visibilityHealth === "healthy_visible",
          ),
        ).toBe(true),
      );
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.details?.reason === "nodes_exist_but_fully_occluded",
        ),
      ).toBe(false);
    },
  );

  it("does not accept DOM count equality while React Flow nodes remain uninitialized", async () => {
    flow.nodesInitialized = false;
    render(
      <DiscussionTree
        sessionId="session_uninitialized"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_not_initialized",
        ),
      ).toBe(true),
    );
    expect(
      recentDiagnosticEvents(100).some(
        (event) => event.details?.visibilityHealth === "healthy_visible",
      ),
    ).toBe(false);
  });

  it("detects stale React Flow DOM nodes even when counts match", async () => {
    flow.staleDomNodeIds = ["stale-root", "stale-agenda", "stale-item"];
    render(
      <DiscussionTree
        sessionId="session_stale_dom"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "stale_dom_only" &&
            Number(event.details?.staleDomNodeCount) > 0,
        ),
      ).toBe(true),
    );
  });

  it("offers a manual view reset and records its before/after result", async () => {
    render(
      <DiscussionTree
        sessionId="session_manual_reset"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    flow.fitView.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "表示をリセット" }));

    await waitFor(() => expect(flow.fitView).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_manual_view_reset" &&
            event.details?.recoveryAttempted === true &&
            typeof event.details?.beforeHealth === "string" &&
            typeof event.details?.afterHealth === "string",
        ),
      ).toBe(true),
    );
  });

  it("rolls a failed manual reset back to the last healthy viewport", async () => {
    render(
      <DiscussionTree
        sessionId="session_manual_rollback"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.details?.visibilityHealth === "healthy_visible",
        ),
      ).toBe(true),
    );
    const committedProviderId = committedSnapshotView().getByTestId("react-flow").dataset
      .providerId as string;
    const healthyViewport = { x: 0, y: 0, zoom: 1 };
    const brokenViewport = { x: 8_000, y: 8_000, zoom: 1 };
    flow.providerViewports.set(committedProviderId, brokenViewport);
    flow.nodeRectMode = "offscreen";
    flow.fitView.mockClear();
    flow.fitView.mockResolvedValueOnce(false);
    flow.setViewport.mockClear();
    flow.setCenter.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "表示をリセット" }));

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_manual_reset_completed" &&
            event.details?.rollbackViewportSource === "last_known_good" &&
            event.details?.rolledBack === true,
        ),
      ).toBe(true),
    );
    expect(
      flow.setViewport.mock.calls.some(
        ([viewport]) => JSON.stringify(viewport) === JSON.stringify(healthyViewport),
      ),
    ).toBe(true);
    expect(
      flow.setViewport.mock.calls.some(
        ([viewport]) => JSON.stringify(viewport) === JSON.stringify(brokenViewport),
      ),
    ).toBe(false);
  });

  it("runs manual reset as a single flight under duplicate clicks", async () => {
    render(
      <StrictMode>
        <DiscussionTree
          sessionId="session_manual_single_flight"
          workspaceId="workspace_render"
          nodes={initialNodes}
          edges={initialEdges}
          treeVersion={1}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    flow.fitView.mockClear();
    resetClientDiagnosticsForTest();

    const button = screen.getByRole("button", { name: "表示をリセット" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).filter(
          (event) => event.event === "tree_manual_reset_completed",
        ),
      ).toHaveLength(1),
    );
    expect(flow.fitView).toHaveBeenCalledTimes(1);
    expect(flow.setCenter.mock.calls.length).toBeLessThanOrEqual(1);
    expect(
      recentDiagnosticEvents(100).filter((event) => event.event === "tree_manual_reset_started"),
    ).toHaveLength(1);
    expect(
      recentDiagnosticEvents(100).filter(
        (event) => event.event === "tree_manual_reset_ignored_duplicate",
      ),
    ).toHaveLength(1);
    expect(
      recentDiagnosticEvents(100).filter((event) => event.event === "tree_manual_view_reset"),
    ).toHaveLength(1);
  });

  it("does not steal the viewport during or immediately after an intentional pan", async () => {
    render(
      <DiscussionTree
        sessionId="session_pan"
        workspaceId="workspace_render"
        nodes={initialNodes}
        edges={initialEdges}
        treeVersion={1}
      />,
    );
    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) => event.details?.visibilityHealth === "healthy_visible",
        ),
      ).toBe(true),
    );
    flow.fitView.mockClear();
    flow.setViewport.mockClear();
    flow.nodeRectMode = "offscreen";

    act(() => flow.onMoveStart?.(new MouseEvent("pointerdown")));
    act(() => flow.onMoveEnd?.(new MouseEvent("pointerup")));

    await waitFor(() =>
      expect(
        recentDiagnosticEvents(100).some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_exist_but_offscreen" &&
            event.details?.recoveryAttempted === false,
        ),
      ).toBe(true),
    );
    expect(flow.fitView).not.toHaveBeenCalled();
    expect(flow.setViewport).not.toHaveBeenCalled();
  });

  it("shows a non-empty fallback when React Flow rendering throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    flow.throwRender = true;
    render(<DiscussionTree nodes={initialNodes} edges={initialEdges} treeVersion={3} />);

    expect(committedSnapshotView().getByTestId("discussion-tree-render-fallback")).toBeTruthy();
    expect(committedSnapshotView().getByText("議論ツリーを簡易表示しています")).toBeTruthy();
    expect(committedSnapshotView().getByText("騒音")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("hides library attribution and tentative staging details", () => {
    const tentativeItem: AnalysisItem = {
      id: "candidate-1",
      kind: "open_issue",
      severity: "medium",
      title: "候補",
      body: "候補論点の説明",
      status: "open",
      classificationStatus: "tentative",
      candidateTopicId: "candidate-topic-1",
    };

    render(
      <DiscussionTree nodes={initialNodes} edges={initialEdges} analysisItems={[tentativeItem]} />,
    );

    expect(
      committedSnapshotView().getByTestId("react-flow").getAttribute("data-hide-attribution"),
    ).toBe("true");
    expect(screen.queryByLabelText("候補論点")).toBeNull();
    expect(screen.queryByText(/根拠が揃うまで/)).toBeNull();
  });
});
