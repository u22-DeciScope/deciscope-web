import { type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";

const flow = vi.hoisted(() => ({
  fitView: vi.fn(() => Promise.resolve(true)),
  getNode: vi.fn(),
  // 新規ノードが画面外にある状態を再現し、auto-focusのsetCenterを発火させる。
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
  ReactFlow: ({ children, nodes }: { children: ReactNode; nodes: Array<{ id: string }> }) => (
    <div data-testid="react-flow">
      {nodes.map((node) => (
        <div key={node.id} data-testid={`flow-node-${node.id}`}>
          {node.id}
        </div>
      ))}
      {children}
    </div>
  ),
  useReactFlow: () => flow,
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 900, height: 600 }),
}));

import { DiscussionTree } from "./DiscussionTree";

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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it("hides the empty 追加論点 placeholder at v11 and keeps real agendas", () => {
    render(<DiscussionTree nodes={v11Nodes} edges={v11Edges} analysisItems={v11Items} />);
    // 実際に指定されたagendaだけがroot直下に表示される。
    for (const id of ["root", "agenda-1", "agenda-2", "agenda-3"]) {
      expect(screen.getByTestId(`flow-node-${id}`)).toBeTruthy();
    }
    // candidate段階のitemと、その受け皿の「追加論点」topicは表示しない。
    expect(screen.queryByTestId("flow-node-topic-unclassified")).toBeNull();
    expect(screen.queryByTestId("flow-node-item-todo-15d69fb0e46d")).toBeNull();
    expect(screen.queryByTestId("flow-node-question-auto-990f08d9c259")).toBeNull();
  });

  it("keeps every existing node rendered after the v12 promotion auto-focus", async () => {
    const view = render(
      <DiscussionTree nodes={v11Nodes} edges={v11Edges} analysisItems={v11Items} />,
    );
    const renderedAtV11 = view
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

    // 自動フォーカス(viewport移動)は起きてよいが、canonicalなノードは消えない。
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalled());
    for (const testId of renderedAtV11) {
      if (testId === "flow-node-topic-unclassified") {
        continue;
      }
      expect(screen.getByTestId(testId as string)).toBeTruthy();
    }
    // 昇格したdynamic topicと2つの植物ノードが追加表示される。
    expect(screen.getByTestId("flow-node-candidate-2e0a7402415d")).toBeTruthy();
    expect(screen.getByTestId("flow-node-item-todo-15d69fb0e46d")).toBeTruthy();
    expect(screen.getByTestId("flow-node-question-auto-990f08d9c259")).toBeTruthy();
    // v11で表示されていたノード数 + 3(新topic + 植物2ノード)が描画されている。
    expect(screen.getAllByTestId(/flow-node-/)).toHaveLength(renderedAtV11.length + 3);
  });
});
