import { type ReactNode } from "react";
import { act, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import {
  recentDiagnosticEvents,
  resetClientDiagnosticsForTest,
} from "~/utils/clientDiagnostics/clientDiagnostics";

// 非同期のviewport操作は「完了しないまま置き換えられる」ことが実ブラウザでも
// 起こる(d3-zoomのtransitionは割り込まれるとendを発火せず、React Flowが返す
// Promiseが永久にsettleしない)。このmockはfitView/setViewportのsettle時点を
// テストから制御し、その競合を決定的に再現する。
const flow = vi.hoisted(() => ({
  fitViewCalls: [] as Array<{ resolve: (applied: boolean) => void; reject: () => void }>,
  fitViewMode: "resolve" as "resolve" | "defer" | "reject",
  fitView: vi.fn(),
  getNode: vi.fn(),
  setCenter: vi.fn(),
  setViewport: vi.fn(),
  updateNodeInternals: vi.fn(),
  pane: { width: 900, height: 600 },
  nodesInitialized: true,
  providerViewports: new Map<string, { x: number; y: number; zoom: number }>(),
  providerNodesInitialized: new Map<string, boolean>(),
  // A/Bの両bufferがReactFlowを描画するため、ハンドラはprovider単位で保持する。
  // committed側のハンドラを呼ばないとユーザー操作として扱われない。
  moveHandlers: new Map<
    string,
    {
      onMoveStart?: (event: MouseEvent | null) => void;
      onMoveEnd?: (event: MouseEvent | null) => void;
    }
  >(),
  nodeDescendant: false,
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");

  type MockFlowNode = { id: string; data?: { label?: string; momentLabel?: string } };
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
      onMoveStart,
      onMoveEnd,
    }: {
      children: ReactNode;
      nodes: MockFlowNode[];
      edges: MockFlowEdge[];
      onMoveStart?: (event: MouseEvent | null) => void;
      onMoveEnd?: (event: MouseEvent | null) => void;
    }) => {
      const providerStore = useProviderStore();
      React.useLayoutEffect(() => {
        providerStore.updateGraph(nodes, edges);
      }, [edges, nodes, providerStore]);
      flow.moveHandlers.set(providerStore.providerId, { onMoveStart, onMoveEnd });
      return (
        <div
          className="react-flow"
          data-testid="react-flow"
          data-provider-id={providerStore.providerId}
        >
          <div className="react-flow__renderer">
            <div className="react-flow__viewport">
              <div className="react-flow__nodes">
                {nodes.map((node, index) => (
                  <div
                    key={node.id}
                    className="react-flow__node"
                    data-id={node.id}
                    data-testid={`flow-node-${node.id}`}
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
                    {flow.nodeDescendant ? (
                      <span data-discussion-node-owner-id={node.id} data-testid="node-descendant" />
                    ) : null}
                  </div>
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
            if (flow.fitViewMode === "resolve") return Promise.resolve(true);
            if (flow.fitViewMode === "reject") return Promise.reject(new Error("fit view failed"));
            // d3-zoomのtransitionが割り込まれた状態。Promiseは決してsettleしない。
            return new Promise<boolean>((resolve, reject) => {
              flow.fitViewCalls.push({ resolve, reject: () => reject(new Error("interrupted")) });
            });
          },
          getNode: flow.getNode,
          getViewport: () =>
            flow.providerViewports.get(providerStore.providerId) ?? { x: 0, y: 0, zoom: 1 },
          setCenter: async (
            x: number,
            y: number,
            options?: { zoom?: number; duration?: number },
          ) => {
            flow.setCenter(x, y, options);
            const current = flow.providerViewports.get(providerStore.providerId) ?? {
              x: 0,
              y: 0,
              zoom: 1,
            };
            const zoom = options?.zoom ?? current.zoom;
            flow.providerViewports.set(providerStore.providerId, {
              x: flow.pane.width / 2 - x * zoom,
              y: flow.pane.height / 2 - y * zoom,
              zoom,
            });
            return true;
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
      // React Flow は adoptUserNodes(= nodes プロップの取り込み)まで measured を
      // 持たない。「まだ計測されていない準備中buffer」を集約フラグだけでなく
      // measured 未設定としても再現する。
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
      return selector({
        ...flow.pane,
        nodeLookup,
        edgeLookup: providerStore.edgeLookup,
      });
    },
  };
});

import { DiscussionTree } from "./DiscussionTree";

const v1Nodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "会議" },
  { id: "agenda-1", kind: "topic", parentId: "root", label: "騒音" },
  { id: "item-1", kind: "todo", parentId: "agenda-1", label: "確認" },
];
const v1Edges: TreeEdgePayload[] = [
  { id: "root-agenda", source: "root", target: "agenda-1" },
  { id: "agenda-item", source: "agenda-1", target: "item-1" },
];
const v2Nodes: TreeNodePayload[] = [
  ...v1Nodes,
  { id: "group-1", kind: "group", parentId: "agenda-1", label: "強風条件" },
];
const v2Edges: TreeEdgePayload[] = [
  ...v1Edges,
  { id: "agenda-group", source: "agenda-1", target: "group-1" },
];

const SESSION = "session-viewport-operations";

function Harness({
  nodes,
  edges,
  treeVersion,
}: {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  treeVersion: number;
}) {
  return (
    <DiscussionTree
      sessionId={SESSION}
      nodes={nodes}
      edges={edges}
      treeVersion={treeVersion}
      analysisVersion={treeVersion}
    />
  );
}

function committedRoot() {
  return document.querySelector<HTMLElement>(
    '[data-testid="discussion-tree-canvas"] > [data-discussion-snapshot-role="committed"]',
  );
}

function committedVersion() {
  return committedRoot()?.dataset.discussionSnapshotVersion ?? "none";
}

function swapPhase() {
  return committedRoot()?.dataset.discussionSwapPhase ?? "none";
}

function programmaticActive() {
  return committedRoot()?.dataset.discussionProgrammaticViewportMoveActive ?? "none";
}

function committedDomNodeCount() {
  return committedRoot()?.querySelectorAll(".react-flow__node").length ?? 0;
}

function committedProviderId() {
  return (
    committedRoot()?.querySelector<HTMLElement>("[data-provider-id]")?.dataset.providerId ?? ""
  );
}

async function settle(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

// 診断イベントが増えなくなるまで待ち、以降の観測が「いま起こした操作」だけに
// 起因することを保証する。
async function waitForQuiescence(maxRounds = 20) {
  let previous = -1;
  for (let round = 0; round < maxRounds; round += 1) {
    const current = recentDiagnosticEvents().length;
    if (current === previous) return;
    previous = current;
    await settle(120);
  }
  throw new Error("discussion tree never became quiescent");
}

// committed bufferに対してユーザーのpan操作を再現する。
function userPan(viewport: { x: number; y: number; zoom: number }) {
  const provider = committedProviderId();
  const handlers = flow.moveHandlers.get(provider);
  if (!handlers?.onMoveStart || !handlers.onMoveEnd) {
    throw new Error(`move handlers were not registered for committed provider ${provider}`);
  }
  act(() => {
    handlers.onMoveStart?.({} as MouseEvent);
    flow.providerViewports.set(provider, viewport);
    handlers.onMoveEnd?.({} as MouseEvent);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetClientDiagnosticsForTest();
  flow.fitViewCalls.length = 0;
  flow.fitViewMode = "resolve";
  flow.pane.width = 900;
  flow.pane.height = 600;
  flow.nodesInitialized = true;
  flow.providerViewports.clear();
  flow.providerNodesInitialized.clear();
  flow.moveHandlers.clear();
  flow.nodeDescendant = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  // 実ブラウザと同じく、指定座標を含む要素だけを前面から順に返す。
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: vi.fn((x: number, y: number) => {
      const stack: Element[] = [];
      const overlay = document.querySelector<HTMLElement>("[data-test-portal-overlay]");
      if (overlay) {
        const rect = overlay.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          stack.push(overlay);
        }
      }
      for (const node of document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")) {
        const rect = node.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
        const descendant = node.querySelector<HTMLElement>("[data-discussion-node-owner-id]");
        if (descendant) stack.push(descendant);
        stack.push(node);
      }
      return stack;
    }),
  });
});

afterEach(() => {
  // 失敗時もbody直下のportal overlayを残さない(後続テストの遮蔽判定を汚さない)。
  for (const overlay of document.querySelectorAll("[data-test-portal-overlay]")) {
    overlay.remove();
  }
});

describe("viewport operation generation management", () => {
  it("commits a prepared tree even when the previous programmatic move never settles", async () => {
    flow.fitViewMode = "defer";
    const view = render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    expect(committedVersion()).toBe("1");

    const domCounts: number[] = [];
    const sampler = setInterval(() => domCounts.push(committedDomNodeCount()), 5);
    view.rerender(<Harness nodes={v2Nodes} edges={v2Edges} treeVersion={2} />);

    await waitFor(() => expect(committedVersion()).toBe("2"), { timeout: 4000 });
    clearInterval(sampler);

    expect(swapPhase()).toBe("committed");
    // settleしない操作が残っても、activeは必ず有限時間で解除される。
    await waitFor(() => expect(programmaticActive()).toBe("false"), { timeout: 4000 });
    // 更新中に committed 側のDOMノードが0になってはいけない(点滅の直接原因)。
    expect(domCounts.length).toBeGreaterThan(10);
    expect(Math.min(...domCounts)).toBeGreaterThan(0);
    expect(committedDomNodeCount()).toBe(4);
  });

  it("ignores a stale viewport completion that resolves after a newer tree was committed", async () => {
    flow.fitViewMode = "defer";
    const view = render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(flow.fitViewCalls.length).toBeGreaterThan(0));
    const staleOperations = [...flow.fitViewCalls];

    view.rerender(<Harness nodes={v2Nodes} edges={v2Edges} treeVersion={2} />);
    await waitFor(() => expect(committedVersion()).toBe("2"), { timeout: 4000 });

    const providerAfterCommit = committedProviderId();
    const viewportAfterCommit = { ...flow.providerViewports.get(providerAfterCommit)! };
    flow.setViewport.mockClear();
    flow.setCenter.mockClear();

    // v1向けに開始した操作が遅れて完了しても、v13相当の確定状態を戻してはいけない。
    await act(async () => {
      for (const operation of staleOperations) operation.resolve(true);
      await Promise.resolve();
    });
    await settle();

    expect(committedVersion()).toBe("2");
    expect(swapPhase()).toBe("committed");
    expect(programmaticActive()).toBe("false");
    expect(committedProviderId()).toBe(providerAfterCommit);
    expect(flow.providerViewports.get(providerAfterCommit)).toEqual(viewportAfterCommit);
    expect(committedDomNodeCount()).toBe(4);
  });

  it("releases the programmatic flag when a fit view operation rejects", async () => {
    flow.fitViewMode = "reject";
    render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(flow.fitView).toHaveBeenCalled());
    await waitFor(() => expect(programmaticActive()).toBe("false"));
  });

  it("does not leave a never-settling operation pinned after unmount", async () => {
    flow.fitViewMode = "defer";
    const view = render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(flow.fitViewCalls.length).toBeGreaterThan(0));
    const orphaned = [...flow.fitViewCalls];
    view.unmount();

    await act(async () => {
      for (const operation of orphaned) operation.resolve(true);
      await Promise.resolve();
    });

    flow.fitViewMode = "resolve";
    render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(programmaticActive()).toBe("false"));
    expect(committedVersion()).toBe("1");
  });
});

describe("pending tree state machine", () => {
  it("restarts preparation after props roll back and the new version arrives again", async () => {
    const view = render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(committedVersion()).toBe("1"));

    // 準備中のbufferだけ measurement 未完了にして preparing で止める。
    const standby = document.querySelector<HTMLElement>(
      '[data-testid="discussion-tree-canvas"] > [data-discussion-snapshot-role="standby"]',
    );
    const pendingProvider =
      standby?.querySelector<HTMLElement>("[data-provider-id]")?.dataset.providerId;
    expect(pendingProvider).toBeTruthy();
    flow.providerNodesInitialized.set(pendingProvider!, false);

    view.rerender(<Harness nodes={v2Nodes} edges={v2Edges} treeVersion={2} />);
    await waitFor(() => expect(swapPhase()).toBe("preparing"));
    expect(committedVersion()).toBe("1");

    // propsが旧versionへ戻る。滞留したpendingは破棄されなければならない。
    view.rerender(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(swapPhase()).not.toBe("preparing"));
    expect(committedVersion()).toBe("1");
    expect(committedDomNodeCount()).toBe(3);

    // v2が再到着したら、新しいgenerationで準備し直して最終的にcommitできること。
    flow.providerNodesInitialized.clear();
    view.rerender(<Harness nodes={v2Nodes} edges={v2Edges} treeVersion={2} />);
    await waitFor(() => expect(committedVersion()).toBe("2"), { timeout: 4000 });
    expect(swapPhase()).toBe("committed");
    expect(committedDomNodeCount()).toBe(4);

    const commits = recentDiagnosticEvents().filter(
      (event) =>
        event.event === "tree_swap_committed" &&
        (event.details?.treeVersionAfter as number | null) === 2,
    );
    expect(commits).toHaveLength(1);
  });

  it("never leaves a pending tree preparing once its snapshot is superseded", async () => {
    const view = render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(committedVersion()).toBe("1"));

    const standby = document.querySelector<HTMLElement>(
      '[data-testid="discussion-tree-canvas"] > [data-discussion-snapshot-role="standby"]',
    );
    const pendingProvider =
      standby?.querySelector<HTMLElement>("[data-provider-id]")?.dataset.providerId;
    flow.providerNodesInitialized.set(pendingProvider!, false);
    view.rerender(<Harness nodes={v2Nodes} edges={v2Edges} treeVersion={2} />);
    await waitFor(() => expect(swapPhase()).toBe("preparing"));

    flow.providerNodesInitialized.clear();
    const v3Nodes = [
      ...v2Nodes,
      { id: "item-2", kind: "todo", parentId: "agenda-1", label: "追記" } as TreeNodePayload,
    ];
    const v3Edges = [
      ...v2Edges,
      { id: "agenda-item-2", source: "agenda-1", target: "item-2" } as TreeEdgePayload,
    ];
    view.rerender(<Harness nodes={v3Nodes} edges={v3Edges} treeVersion={3} />);

    await waitFor(() => expect(committedVersion()).toBe("3"), { timeout: 4000 });
    expect(swapPhase()).toBe("committed");
    // 途中のv2は決してcommitされない。
    expect(
      recentDiagnosticEvents().filter(
        (event) =>
          event.event === "tree_swap_committed" &&
          (event.details?.treeVersionAfter as number | null) === 2,
      ),
    ).toHaveLength(0);
  });
});

describe("user viewport protection", () => {
  it("keeps the panned viewport when the next tree update arrives", async () => {
    const view = render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(committedVersion()).toBe("1"));
    await settle();

    const panned = { x: -120, y: -64, zoom: 0.85 };
    userPan(panned);
    flow.fitView.mockClear();
    flow.setCenter.mockClear();

    view.rerender(<Harness nodes={v2Nodes} edges={v2Edges} treeVersion={2} />);
    await waitFor(() => expect(committedVersion()).toBe("2"), { timeout: 4000 });

    expect(flow.fitView).not.toHaveBeenCalled();
    expect(flow.setCenter).not.toHaveBeenCalled();
    expect(flow.providerViewports.get(committedProviderId())).toEqual(panned);
  });
});

describe("document.body portal overlay", () => {
  it("re-evaluates visibility when a portal modal covers and then uncovers the tree", async () => {
    render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(committedVersion()).toBe("1"));
    // 追加前に完全に静止させ、overlay追加だけが再評価の引き金であることを保証する。
    await waitForQuiescence();

    const overlay = document.createElement("div");
    overlay.setAttribute("data-test-portal-overlay", "true");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgb(0, 0, 0)";
    overlay.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }) as DOMRect;

    // React subtree外のportalとして document.body に直接追加する。
    await act(async () => {
      document.body.appendChild(overlay);
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    await waitFor(() => {
      expect(
        recentDiagnosticEvents().some(
          (event) =>
            event.event === "tree_render_state" &&
            event.details?.phase === "portal_overlay_detected",
        ),
      ).toBe(true);
      expect(
        recentDiagnosticEvents().some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_exist_but_fully_occluded",
        ),
      ).toBe(true);
    });

    resetClientDiagnosticsForTest();
    await act(async () => {
      overlay.remove();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    // モーダルが閉じたら再評価が走り、可視状態へ復帰したことを記録すること。
    await waitFor(() => {
      expect(
        recentDiagnosticEvents().some(
          (event) =>
            event.event === "tree_render_state" &&
            event.details?.phase === "portal_overlay_removed",
        ),
      ).toBe(true);
      expect(
        recentDiagnosticEvents().some((event) => event.event === "tree_visibility_recovered"),
      ).toBe(true);
      expect(
        recentDiagnosticEvents().some(
          (event) =>
            event.event === "tree_visibility_unhealthy" &&
            event.details?.reason === "nodes_exist_but_fully_occluded",
        ),
      ).toBe(false);
    });
    expect(committedDomNodeCount()).toBe(3);
  });

  it("does not treat a node's own descendant as an occluder", async () => {
    flow.nodeDescendant = true;
    render(<Harness nodes={v1Nodes} edges={v1Edges} treeVersion={1} />);
    await waitFor(() => expect(committedVersion()).toBe("1"));
    await settle(150);

    expect(within(committedRoot()!).getAllByTestId("node-descendant").length).toBeGreaterThan(0);
    expect(
      recentDiagnosticEvents().some(
        (event) =>
          event.event === "tree_visibility_unhealthy" &&
          event.details?.reason === "nodes_exist_but_fully_occluded",
      ),
    ).toBe(false);
  });
});
