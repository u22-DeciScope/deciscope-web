import { type ReactNode } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import {
  recentDiagnosticEvents,
  resetClientDiagnosticsForTest,
} from "~/utils/clientDiagnostics/clientDiagnostics";

// focus移動は非同期で、割り込まれた d3-zoom transition は end を発火しない。
// このmockは setCenter の settle 時点をテストから制御し、「前ノード向けの完了が
// 後から届く」競合を決定的に再現する。
const flow = vi.hoisted(() => ({
  setCenterMode: "resolve" as "resolve" | "defer" | "reject",
  setCenterCalls: [] as Array<{ providerId: string; x: number; y: number }>,
  deferredCenters: [] as Array<{
    providerId: string;
    resolve: (applied: boolean) => void;
    reject: () => void;
  }>,
  fitView: vi.fn(),
  getNode: vi.fn(),
  setViewport: vi.fn(),
  updateNodeInternals: vi.fn(),
  pane: { width: 900, height: 600 },
  nodesInitialized: true,
  providerViewports: new Map<string, { x: number; y: number; zoom: number }>(),
  providerNodesInitialized: new Map<string, boolean>(),
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");

  type MockFlowNode = { id: string; position?: { x: number; y: number } };
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
    const [graph, setGraph] = React.useState<{ nodes: MockFlowNode[]; edges: MockFlowEdge[] }>({
      nodes: [],
      edges: [],
    });
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
    if (!store) throw new Error("React Flow mock hooks must render inside ReactFlowProvider");
    return store;
  };

  const applyCenter = (providerId: string, x: number, y: number, zoom: number) => {
    flow.providerViewports.set(providerId, {
      x: flow.pane.width / 2 - x * zoom,
      y: flow.pane.height / 2 - y * zoom,
      zoom,
    });
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
      onPaneClick,
    }: {
      children: ReactNode;
      nodes: MockFlowNode[];
      edges: MockFlowEdge[];
      onNodeClick?: (event: unknown, node: MockFlowNode) => void;
      onPaneClick?: () => void;
    }) => {
      const providerStore = useProviderStore();
      React.useLayoutEffect(() => {
        providerStore.updateGraph(nodes, edges);
      }, [edges, nodes, providerStore]);
      return (
        <div
          className="react-flow"
          data-testid="react-flow"
          data-provider-id={providerStore.providerId}
        >
          <button type="button" data-testid="flow-pane" onClick={() => onPaneClick?.()}>
            pane
          </button>
          <div className="react-flow__renderer">
            <div className="react-flow__viewport">
              <div className="react-flow__nodes">
                {nodes.map((node, index) => (
                  <button
                    type="button"
                    key={node.id}
                    className="react-flow__node"
                    data-id={node.id}
                    data-testid={`flow-node-${node.id}`}
                    onClick={(event) => onNodeClick?.(event, node)}
                    ref={(element) => {
                      if (!element) return;
                      const left = 40 + index * 280;
                      element.getBoundingClientRect = () =>
                        ({
                          x: left,
                          y: 80,
                          left,
                          top: 80,
                          right: left + 260,
                          bottom: 164,
                          width: 260,
                          height: 84,
                          toJSON: () => ({}),
                        }) as DOMRect;
                    }}
                  >
                    {node.id}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {children}
        </div>
      );
    },
    useReactFlow: () => {
      const providerStore = useProviderStore();
      return React.useMemo(
        () => ({
          fitView: (options?: { padding?: number; duration?: number }) => {
            flow.fitView(options);
            return Promise.resolve(true);
          },
          getNode: flow.getNode,
          getViewport: () =>
            flow.providerViewports.get(providerStore.providerId) ?? { x: 0, y: 0, zoom: 1 },
          setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => {
            flow.setCenterCalls.push({ providerId: providerStore.providerId, x, y });
            const zoom = options?.zoom ?? 1;
            if (flow.setCenterMode === "resolve") {
              applyCenter(providerStore.providerId, x, y, zoom);
              return Promise.resolve(true);
            }
            if (flow.setCenterMode === "reject") {
              return Promise.reject(new Error("interrupted"));
            }
            return new Promise<boolean>((resolve, reject) => {
              flow.deferredCenters.push({
                providerId: providerStore.providerId,
                resolve: (applied: boolean) => {
                  if (applied) applyCenter(providerStore.providerId, x, y, zoom);
                  resolve(applied);
                },
                reject: () => reject(new Error("interrupted")),
              });
            });
          },
          setViewport: async (
            viewport: { x: number; y: number; zoom: number },
            options?: { duration?: number },
          ) => {
            flow.setViewport(viewport, options);
            flow.providerViewports.set(providerStore.providerId, viewport);
            return true;
          },
        }),
        [providerStore],
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
      const defaultMeasured =
        (flow.providerNodesInitialized.get(providerStore.providerId) ?? flow.nodesInitialized)
          ? { width: 260, height: 90 }
          : { width: undefined, height: undefined };
      const nodeLookup = new Map(
        [...providerStore.nodeLookup].map(([id, node]) => [
          id,
          { ...(node as object), measured: defaultMeasured },
        ]),
      );
      return selector({ ...flow.pane, nodeLookup, edgeLookup: providerStore.edgeLookup });
    },
  };
});

import { DiscussionTree } from "./DiscussionTree";

const SESSION = "session-focus-operations";

const baseNodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "会議" },
  { id: "agenda-1", kind: "topic", parentId: "root", label: "経緯" },
  { id: "node-a", kind: "issue", parentId: "agenda-1", label: "論点A" },
  { id: "node-b", kind: "decision", parentId: "agenda-1", label: "論点B" },
];
const baseEdges: TreeEdgePayload[] = [
  { id: "root-agenda", source: "root", target: "agenda-1" },
  { id: "agenda-a", source: "agenda-1", target: "node-a" },
  { id: "agenda-b", source: "agenda-1", target: "node-b" },
];

function Harness({
  nodes = baseNodes,
  edges = baseEdges,
  treeVersion = 1,
  sessionId = SESSION,
}: {
  nodes?: TreeNodePayload[];
  edges?: TreeEdgePayload[];
  treeVersion?: number;
  sessionId?: string;
}) {
  return (
    <DiscussionTree
      sessionId={sessionId}
      workspaceId="workspace-focus"
      nodes={nodes}
      edges={edges}
      treeVersion={treeVersion}
      analysisVersion={treeVersion}
    />
  );
}

beforeEach(() => {
  resetClientDiagnosticsForTest();
  flow.setCenterMode = "resolve";
  flow.setCenterCalls = [];
  flow.deferredCenters = [];
  flow.nodesInitialized = true;
  flow.providerViewports.clear();
  flow.providerNodesInitialized.clear();
  flow.fitView.mockReset();
  flow.setViewport.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: true })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("node focus operations", () => {
  it("supersedes the previous node focus when another node is clicked", async () => {
    flow.setCenterMode = "defer";
    render(<Harness />);
    await waitFor(() => expect(committedRoot()).not.toBeNull());

    clickNode("node-a");
    await waitFor(() => expect(flow.deferredCenters.length).toBeGreaterThan(0));
    const staleOperationsForA = [...flow.deferredCenters];
    flow.deferredCenters = [];

    clickNode("node-b");
    await waitFor(() => expect(selectedNodeId()).toBe("node-b"));
    const operationsForB = [...flow.deferredCenters];
    expect(operationsForB.length).toBeGreaterThan(0);

    // A向けの完了が後から届いても、選択もフォーカスもBのまま。
    await act(async () => {
      for (const operation of staleOperationsForA) operation.resolve(true);
      await Promise.resolve();
    });
    await act(async () => {
      for (const operation of operationsForB) operation.resolve(true);
      await Promise.resolve();
    });

    await waitFor(() => expect(focusedNodeId()).toBe("node-b"));
    expect(selectedNodeId()).toBe("node-b");
    expect(
      recentDiagnosticEvents(300).some(
        (event) =>
          event.details?.phase === "focus_operation_superseded" &&
          event.details?.focusTargetNodeId === "node-a",
      ),
    ).toBe(true);
  });

  it("ignores a stale focus rejection raised after another node was selected", async () => {
    flow.setCenterMode = "defer";
    render(<Harness />);
    await waitFor(() => expect(committedRoot()).not.toBeNull());

    clickNode("node-a");
    await waitFor(() => expect(flow.deferredCenters.length).toBeGreaterThan(0));
    const staleOperationsForA = [...flow.deferredCenters];
    flow.deferredCenters = [];

    clickNode("node-b");
    await waitFor(() => expect(selectedNodeId()).toBe("node-b"));
    const operationsForB = [...flow.deferredCenters];

    await act(async () => {
      for (const operation of staleOperationsForA) operation.reject();
      await Promise.resolve();
    });
    await act(async () => {
      for (const operation of operationsForB) operation.resolve(true);
      await Promise.resolve();
    });

    await waitFor(() => expect(focusedNodeId()).toBe("node-b"));
    expect(selectedNodeId()).toBe("node-b");
    await waitFor(() => expect(programmaticActive()).toBe("false"));
  });

  it("clears selection and focus on a blank click and ignores the late completion", async () => {
    flow.setCenterMode = "defer";
    render(<Harness />);
    await waitFor(() => expect(committedRoot()).not.toBeNull());

    clickNode("node-a");
    await waitFor(() => expect(flow.deferredCenters.length).toBeGreaterThan(0));
    const staleOperationsForA = [...flow.deferredCenters];

    await act(async () => {
      fireEvent.click(committedView().getByTestId("flow-pane"));
    });
    expect(selectedNodeId()).toBe("");
    expect(focusedNodeId()).toBe("");
    expect(pendingFocusNodeId()).toBe("");

    await act(async () => {
      for (const operation of staleOperationsForA) operation.resolve(true);
      await Promise.resolve();
    });
    expect(selectedNodeId()).toBe("");
    expect(focusedNodeId()).toBe("");
    await waitFor(() => expect(programmaticActive()).toBe("false"));
  });

  it("does not restore a previous selection or focus after a remount", async () => {
    render(<Harness />);
    await waitFor(() => expect(committedRoot()).not.toBeNull());
    clickNode("node-a");
    await waitFor(() => expect(focusedNodeId()).toBe("node-a"));

    // reload相当。同じsessionでもcomponentは作り直される。
    const remount = render(<Harness />);
    await waitFor(() => expect(remount.container.querySelector(".react-flow")).not.toBeNull());
    const roots = [...document.querySelectorAll<HTMLElement>("[data-discussion-snapshot-role]")];
    const fresh = roots[roots.length - 1];
    expect(fresh?.dataset.discussionSelectedNodeId ?? "").toBe("");
    expect(fresh?.dataset.discussionFocusedNodeId ?? "").toBe("");
  });

  it("clears focus when the focused node disappears from the next committed tree", async () => {
    const view = render(<Harness />);
    await waitFor(() => expect(committedRoot()).not.toBeNull());
    clickNode("node-a");
    await waitFor(() => expect(focusedNodeId()).toBe("node-a"));

    const withoutA = baseNodes.filter((node) => node.id !== "node-a");
    const edgesWithoutA = baseEdges.filter((edge) => edge.target !== "node-a");
    view.rerender(<Harness nodes={withoutA} edges={edgesWithoutA} treeVersion={2} />);

    await waitFor(() => expect(committedRoot()?.dataset.discussionSnapshotVersion).toBe("2"), {
      timeout: 4000,
    });
    await waitFor(() => expect(selectedNodeId()).toBe(""));
    expect(focusedNodeId()).toBe("");
  });

  it("moves focus to the canonical node when the focused node is merged away", async () => {
    const view = render(<Harness />);
    await waitFor(() => expect(committedRoot()).not.toBeNull());
    clickNode("node-a");
    await waitFor(() => expect(focusedNodeId()).toBe("node-a"));

    const mergedNodes: TreeNodePayload[] = [
      { id: "root", kind: "topic", label: "会議" },
      { id: "agenda-1", kind: "topic", parentId: "root", label: "経緯" },
      {
        id: "node-canonical",
        kind: "issue",
        parentId: "agenda-1",
        label: "統合された論点",
        mergedFromNodeIds: ["node-a"],
      },
      { id: "node-b", kind: "decision", parentId: "agenda-1", label: "論点B" },
    ];
    const mergedEdges: TreeEdgePayload[] = [
      { id: "root-agenda", source: "root", target: "agenda-1" },
      { id: "agenda-canonical", source: "agenda-1", target: "node-canonical" },
      { id: "agenda-b", source: "agenda-1", target: "node-b" },
    ];
    view.rerender(<Harness nodes={mergedNodes} edges={mergedEdges} treeVersion={2} />);

    await waitFor(() => expect(committedRoot()?.dataset.discussionSnapshotVersion).toBe("2"), {
      timeout: 4000,
    });
    await waitFor(() => expect(selectedNodeId()).toBe("node-canonical"));
  });

  it(
    "focuses only the last clicked node across 50 alternating clicks",
    { timeout: 20_000 },
    async () => {
      render(<Harness />);
      await waitFor(() => expect(committedRoot()).not.toBeNull());

      for (let index = 0; index < 50; index += 1) {
        clickNode(index % 2 === 0 ? "node-a" : "node-b");
      }
      const lastNodeId = 49 % 2 === 0 ? "node-a" : "node-b";
      // 各操作は最長700ms(移動400ms + settle猶予300ms)で必ず退役する。条件が
      // 成立するまで待つ上限であり、固定sleepではない。
      await waitFor(() => expect(focusedNodeId()).toBe(lastNodeId), { timeout: 8000 });
      expect(selectedNodeId()).toBe(lastNodeId);
      await waitFor(() => expect(programmaticActive()).toBe("false"), { timeout: 8000 });
      const lastCenter = flow.setCenterCalls[flow.setCenterCalls.length - 1];
      const expectedNode = committedView().getByTestId(`flow-node-${lastNodeId}`);
      expect(expectedNode).not.toBeNull();
      expect(lastCenter).toBeDefined();
    },
  );
});

function committedRoot() {
  return document.querySelector<HTMLElement>('[data-discussion-snapshot-role="committed"]');
}

function committedView() {
  const root = committedRoot();
  if (!root) throw new Error("committed snapshot is not rendered");
  return {
    getByTestId: (id: string) => {
      const element = root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!element) throw new Error(`missing ${id}`);
      return element;
    },
  };
}

function clickNode(id: string) {
  act(() => {
    fireEvent.click(committedView().getByTestId(`flow-node-${id}`));
  });
}

function selectedNodeId() {
  return committedRoot()?.dataset.discussionSelectedNodeId ?? "";
}

function focusedNodeId() {
  return committedRoot()?.dataset.discussionFocusedNodeId ?? "";
}

function pendingFocusNodeId() {
  return committedRoot()?.dataset.discussionPendingFocusNodeId ?? "";
}

function programmaticActive() {
  return committedRoot()?.dataset.discussionProgrammaticViewportMoveActive ?? "";
}
