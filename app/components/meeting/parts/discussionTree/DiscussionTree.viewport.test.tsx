import { StrictMode, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => Promise.resolve(true)),
  getNode: vi.fn(),
  getViewport: vi.fn(() => ({ x: -2_000, y: 0, zoom: 1 })),
  setCenter: vi.fn((_x: number, _y: number, _options?: { zoom?: number; duration?: number }) =>
    Promise.resolve(true),
  ),
}));

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  Handle: () => null,
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Left: "left", Right: "right" },
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ReactFlow: ({
    children,
    nodes,
    onNodeClick,
    proOptions,
  }: {
    children: ReactNode;
    nodes: Array<{ id: string }>;
    onNodeClick?: (event: MouseEvent, node: { id: string }) => void;
    proOptions?: { hideAttribution?: boolean };
  }) => (
    <div data-testid="react-flow" data-hide-attribution={proOptions?.hideAttribution}>
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          data-testid={`flow-node-${node.id}`}
          onClick={(event) => onNodeClick?.(event.nativeEvent, node)}
        >
          {node.id}
        </button>
      ))}
      {children}
    </div>
  ),
  useReactFlow: () => flow,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 900, height: 600 }),
}));

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

describe("DiscussionTree structural viewport focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it("uses a branching icon and omits the old explanatory subtitle", () => {
    render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);

    const title = screen.getByText("議論ツリー");
    expect(title.closest("header")?.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("論点・リスク・決定事項の関係")).toBeNull();
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

  it("defers while a node is selected and the pending button moves on demand", async () => {
    const view = render(<DiscussionTree nodes={initialNodes} edges={initialEdges} />);
    fireEvent.click(screen.getByTestId("flow-node-item-1"));
    view.rerender(
      <DiscussionTree
        nodes={updatedNodes}
        edges={updatedEdges}
        treeChanges={{ treeVersion: 2, newNodeIds: ["group-1"] }}
      />,
    );
    expect(flow.setCenter).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "変化を表示 (1)" }));
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalledTimes(1));
  });

  it("uses zero-duration viewport movement for reduced motion", async () => {
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
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalled());
    expect(flow.setCenter.mock.calls[0]?.[2]).toMatchObject({ duration: 0 });
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

    expect(screen.getAllByTestId("flow-node-item-1")).toHaveLength(1);
    expect(screen.queryByTestId(/flow-node-agenda-reference/)).toBeNull();
    expect(screen.queryByTestId("discussion-tree-projections")).toBeNull();
    expect(screen.queryByText("今後の対応事項")).toBeNull();
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

    expect(screen.getByTestId("react-flow").getAttribute("data-hide-attribution")).toBe("true");
    expect(screen.queryByLabelText("候補論点")).toBeNull();
    expect(screen.queryByText(/根拠が揃うまで/)).toBeNull();
  });
});
