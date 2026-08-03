import { type ReactNode, type Ref } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { normalizeAIAnalysis, type LiveAnalysisPayload } from "~/api/aiAnalysis/aiAnalysisApi";
import {
  initialMeetingAnalysisState,
  meetingAnalysisReducer,
  selectedAnalysisTree,
} from "~/hooks/meetingAnalysisState";

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => Promise.resolve(true)),
  getNode: vi.fn(),
  viewport: { x: -2_000, y: 0, zoom: 1 },
  // 新規ノードが画面外にある状態を再現し、auto-focusのsetCenterを発火させる。
  getViewport: vi.fn(() => flow.viewport),
  setViewport: vi.fn((viewport: { x: number; y: number; zoom: number }) => {
    flow.viewport = viewport;
    return Promise.resolve(true);
  }),
  updateNodeInternals: vi.fn(),
  setCenter: vi.fn((_x: number, _y: number, _options?: { zoom?: number; duration?: number }) =>
    Promise.resolve(true),
  ),
  nodeLookup: new Map<string, unknown>(),
  edgeLookup: new Map<string, unknown>(),
}));

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  type MockNode = { id: string; measured?: { width?: number; height?: number } };
  type MockEdge = { id: string };
  type ProviderStore = {
    nodeLookup: Map<string, unknown>;
    edgeLookup: Map<string, unknown>;
    updateGraph: (nodes: MockNode[], edges: MockEdge[]) => void;
  };
  const ProviderStoreContext = React.createContext<ProviderStore | null>(null);
  const ReactFlowProvider = ({ children }: { children: ReactNode }) => {
    const [graph, setGraph] = React.useState<{ nodes: MockNode[]; edges: MockEdge[] }>({
      nodes: [],
      edges: [],
    });
    const updateGraph = React.useCallback((nodes: MockNode[], edges: MockEdge[]) => {
      setGraph((current) =>
        current.nodes === nodes && current.edges === edges ? current : { nodes, edges },
      );
    }, []);
    const store = React.useMemo<ProviderStore>(
      () => ({
        nodeLookup: new Map(
          graph.nodes.map((node) => [
            node.id,
            {
              ...node,
              measured: node.measured ?? { width: 260, height: 90 },
              internals: { userNode: node },
            },
          ]),
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
    if (!store) throw new Error("React Flow mock hook used outside ReactFlowProvider");
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
      ref,
    }: {
      children: ReactNode;
      nodes: MockNode[];
      edges: MockEdge[];
      ref?: Ref<HTMLDivElement>;
    }) => {
      const providerStore = useProviderStore();
      React.useLayoutEffect(() => {
        providerStore.updateGraph(nodes, edges);
      }, [edges, nodes, providerStore.updateGraph]);
      flow.nodeLookup = new Map(nodes.map((node) => [node.id, node]));
      flow.edgeLookup = new Map(edges.map((edge) => [edge.id, edge]));
      const setRootRef = (element: HTMLDivElement | null) => {
        if (element) {
          element.getBoundingClientRect = () =>
            ({ left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600 }) as DOMRect;
        }
        if (typeof ref === "function") ref(element);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = element;
      };
      return (
        <div ref={setRootRef} data-testid="react-flow" className="react-flow">
          <div className="react-flow__renderer">
            <div className="react-flow__viewport">
              <div className="react-flow__nodes">
                {nodes.map((node, index) => (
                  <div
                    ref={(element) => {
                      if (!element) return;
                      const left = 20 + (index % 5) * 150;
                      const top = 20 + Math.floor(index / 5) * 80;
                      element.getBoundingClientRect = () =>
                        ({
                          left,
                          top,
                          right: left + 120,
                          bottom: top + 60,
                          width: 120,
                          height: 60,
                        }) as DOMRect;
                    }}
                    key={node.id}
                    className="react-flow__node"
                    data-id={node.id}
                    data-testid={`flow-node-${node.id}`}
                  >
                    {node.id}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {children}
        </div>
      );
    },
    useReactFlow: () => flow,
    useNodesInitialized: () => true,
    useUpdateNodeInternals: () => flow.updateNodeInternals,
    useStore: (
      selector: (state: {
        width: number;
        height: number;
        nodeLookup: Map<string, unknown>;
        edgeLookup: Map<string, unknown>;
      }) => unknown,
    ) => {
      const providerStore = useProviderStore();
      return selector({
        width: 900,
        height: 600,
        nodeLookup: providerStore.nodeLookup,
        edgeLookup: providerStore.edgeLookup,
      });
    },
  };
});

import { DiscussionTree } from "./DiscussionTree";
import {
  rawSession1fdcLiveAnalysis,
  session1fdcSnapshots,
} from "./__fixtures__/session1fdcTreeSnapshots";

// session_497ed2b0aedf9dc6 の v11→v12 相当fixture。
const v11Nodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "環境アセスメント検討会" },
  { id: "agenda-1", kind: "topic", parentId: "root", label: "渡り鳥の調査計画" },
  { id: "agenda-2", kind: "topic", parentId: "root", label: "騒音測定の実施方法" },
  { id: "agenda-3", kind: "topic", parentId: "root", label: "住民説明資料の作成" },
  { id: "topic-unclassified", kind: "topic", parentId: "root", label: "追加論点" },
  { id: "item-issue-noise", kind: "issue", parentId: "agenda-2", label: "夜間低周波音への懸念" },
  { id: "item-todo-doc", kind: "todo", parentId: "agenda-3", label: "公開方針を検討" },
  {
    id: "item-todo-15d69fb0e46d",
    kind: "todo",
    parentId: "topic-unclassified",
    label: "植物種の予備調査の検討",
  },
  {
    id: "question-auto-990f08d9c259",
    kind: "question",
    parentId: "topic-unclassified",
    label: "予備調査を実施するか",
  },
];

const edgesFromParents = (nodes: TreeNodePayload[]): TreeEdgePayload[] =>
  nodes
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `${node.parentId}->${node.id}`,
      source: node.parentId as string,
      target: node.id,
    }));

const v11Edges = edgesFromParents(v11Nodes);

const v12Nodes: TreeNodePayload[] = [
  ...v11Nodes
    .filter((node) => node.id !== "topic-unclassified")
    .map((node) =>
      node.id === "item-todo-15d69fb0e46d" || node.id === "question-auto-990f08d9c259"
        ? { ...node, parentId: "candidate-2e0a7402415d" }
        : node,
    ),
  {
    id: "candidate-2e0a7402415d",
    kind: "topic",
    parentId: "root",
    label: "気象データ確認に伴う測定条件",
  },
];
const v12Edges = edgesFromParents(v12Nodes);

const analysisItem = (id: string, overrides: Partial<AnalysisItem> = {}): AnalysisItem => ({
  id,
  kind: "todo",
  severity: "medium",
  title: id,
  body: id,
  status: "open",
  ...overrides,
});

const v11Items: AnalysisItem[] = [
  analysisItem("item-todo-15d69fb0e46d", {
    classificationStatus: "tentative",
    candidateTopicId: "candidate-2e0a7402415d",
  }),
  analysisItem("question-auto-990f08d9c259", {
    kind: "question",
    classificationStatus: "tentative",
    candidateTopicId: "candidate-2e0a7402415d",
  }),
];

const v12Items: AnalysisItem[] = v11Items.map((item) => ({
  ...item,
  classificationStatus: "assigned",
  candidateTopicId: undefined,
}));

describe("DiscussionTree v11→v12 (session_497ed2b0aedf9dc6 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flow.viewport = { x: -2_000, y: 0, zoom: 1 };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it("hides the empty 追加論点 placeholder at v11 and keeps real agendas", () => {
    render(<DiscussionTree nodes={v11Nodes} edges={v11Edges} analysisItems={v11Items} />);
    const committed = committedView();
    // 実際に指定されたagendaだけがroot直下に表示される。
    for (const id of ["root", "agenda-1", "agenda-2", "agenda-3"]) {
      expect(committed.getByTestId(`flow-node-${id}`)).toBeTruthy();
    }
    // candidate段階のitemと、その受け皿の「追加論点」topicは表示しない。
    expect(committed.queryByTestId("flow-node-topic-unclassified")).toBeNull();
    expect(committed.queryByTestId("flow-node-item-todo-15d69fb0e46d")).toBeNull();
    expect(committed.queryByTestId("flow-node-question-auto-990f08d9c259")).toBeNull();
  });

  it("keeps every existing node rendered after the buffered v12 promotion", async () => {
    const view = render(
      <DiscussionTree nodes={v11Nodes} edges={v11Edges} analysisItems={v11Items} />,
    );
    const renderedAtV11 = committedView()
      .getAllByTestId(/flow-node-/)
      .map((element) => element.getAttribute("data-testid"));

    view.rerender(
      <DiscussionTree
        nodes={v12Nodes}
        edges={v12Edges}
        analysisItems={v12Items}
        treeChanges={{
          treeVersion: 12,
          newNodeIds: ["candidate-2e0a7402415d"],
          reparentedNodeIds: ["item-todo-15d69fb0e46d", "question-auto-990f08d9c259"],
        }}
      />,
    );

    let committedSnapshot: HTMLElement | null = null;
    await waitFor(() => {
      committedSnapshot = document.querySelector<HTMLElement>(
        '[data-discussion-snapshot-role="committed"]',
      );
      expect(document.querySelector('[data-discussion-snapshot-role="pending"]')).toBeNull();
      expect(
        committedSnapshot?.querySelector('[data-testid="flow-node-candidate-2e0a7402415d"]'),
      ).not.toBeNull();
    });
    const committed = within(committedSnapshot!);

    // バッファ昇格時にもcanonicalなノードは消えない。
    for (const testId of renderedAtV11) {
      if (testId === "flow-node-topic-unclassified") {
        continue;
      }
      expect(committed.getByTestId(testId as string)).toBeTruthy();
    }
    // 昇格したdynamic topicと2つの植物ノードが追加表示される。
    expect(committed.getByTestId("flow-node-candidate-2e0a7402415d")).toBeTruthy();
    expect(committed.getByTestId("flow-node-item-todo-15d69fb0e46d")).toBeTruthy();
    expect(committed.getByTestId("flow-node-question-auto-990f08d9c259")).toBeTruthy();
    // v11で表示されていたノード数 + 3(新topic + 植物2ノード)が描画されている。
    expect(committed.getAllByTestId(/flow-node-/)).toHaveLength(renderedAtV11.length + 3);
  });
});

describe("DiscussionTree node-count rendering boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flow.viewport = { x: -2_000, y: 0, zoom: 1 };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it("renders the actual session_1fdc v13 21-node tree", () => {
    const snapshot = session1fdcSnapshots[13];
    render(
      <DiscussionTree
        sessionId="session_1fdc26b44086f0b8"
        nodes={snapshot.nodes}
        edges={snapshot.edges}
        treeVersion={13}
        treeChanges={snapshot.treeChanges}
      />,
    );
    expect(committedView().getAllByTestId(/flow-node-/)).toHaveLength(21);
    expect(committedView().getByTestId("flow-node-root")).toBeTruthy();
  });

  it("keeps 21 nodes through normalize, store, selector, props, layout, and render", () => {
    const normalized = normalizeAIAnalysis(rawSession1fdcLiveAnalysis(13));
    expect(normalized).not.toBeNull();
    const state = meetingAnalysisReducer(initialMeetingAnalysisState("session_1fdc26b44086f0b8"), {
      type: "analysis_event",
      analysis: normalized!,
    });
    const selected = selectedAnalysisTree(state);
    const payload = normalized?.payload as LiveAnalysisPayload;
    expect(payload.tree?.nodes).toHaveLength(21);
    expect(selected.tree?.nodes).toHaveLength(21);

    render(
      <DiscussionTree
        sessionId="session_1fdc26b44086f0b8"
        nodes={selected.tree?.nodes ?? []}
        edges={selected.tree?.edges ?? []}
        treeVersion={selected.treeVersion}
      />,
    );
    expect(committedView().getAllByTestId(/flow-node-/)).toHaveLength(21);
  });

  it.each([19, 20, 21, 22, 23, 24, 25, 30, 40])("does not blank at %i nodes", (count) => {
    const targetNodes: TreeNodePayload[] = [
      { id: "root", kind: "topic", label: "会議" },
      { id: "topic", kind: "topic", parentId: "root", label: "論点" },
    ];
    for (let index = targetNodes.length; index < count; index += 1) {
      targetNodes.push({
        id: `node-${index}`,
        kind: "issue",
        parentId: "topic",
        label: `論点 ${index}`,
      });
    }
    render(<DiscussionTree nodes={targetNodes} edges={edgesFromParents(targetNodes)} />);
    expect(committedView().getAllByTestId(/flow-node-/)).toHaveLength(count);
    expect(committedView().getByTestId("flow-node-root")).toBeTruthy();
  });
});

function committedView() {
  const root = document.querySelector<HTMLElement>(
    '[data-discussion-snapshot-role="committed"]',
  );
  if (!root) {
    throw new Error("committed discussion snapshot was not rendered");
  }
  return within(root);
}
