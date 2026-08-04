import { StrictMode } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import {
  recentDiagnosticEvents,
  resetClientDiagnosticsForTest,
} from "~/utils/clientDiagnostics/clientDiagnostics";

import { DiscussionTree } from "./DiscussionTree";

// このスイートは @xyflow/react を差し替えない。/summary で観測された
// 「表示対象nodeは全件measured済みなのに useNodesInitialized() は false のまま」
// という状態は、React Flow v12 の実装(store.nodesInitialized を adoptUserNodes で
// しか再計算しない)と jsdom の組み合わせでそのまま再現するため、実物を使うことが
// 本番条件の再現になる。

const SESSION_ID = "session_5de87bd0e121089e";

let canvasSize = { width: 900, height: 600 };
const resizeObservers = new Set<TestResizeObserver>();
const originalResizeObserver = globalThis.ResizeObserver;
const originalDOMMatrixReadOnly = window.DOMMatrixReadOnly;
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalBoundingRect = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "getBoundingClientRect",
);
const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, "getBBox");

class TestResizeObserver implements ResizeObserver {
  private readonly observed = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.add(this);
  }

  observe(target: Element) {
    this.observed.add(target);
    this.emit();
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
    resizeObservers.delete(this);
  }

  emit() {
    const entries = [...this.observed].map((target) => resizeEntry(target));
    if (entries.length > 0) {
      this.callback(entries, this);
    }
  }
}

class TestDOMMatrixReadOnly {
  readonly m11 = 1;
  readonly m22 = 1;
  readonly m41 = 0;
  readonly m42 = 0;
}

beforeAll(() => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
  Object.defineProperty(window, "DOMMatrixReadOnly", {
    configurable: true,
    value: TestDOMMatrixReadOnly,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return elementSize(this).width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return elementSize(this).height;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return rect(elementSize(this));
    },
  });
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value() {
      return { x: 0, y: 0, width: 8, height: 8 };
    },
  });
});

afterAll(() => {
  restoreProperty(globalThis, "ResizeObserver", originalResizeObserver);
  restoreProperty(window, "DOMMatrixReadOnly", originalDOMMatrixReadOnly);
  restoreDescriptor(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  restoreDescriptor(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
  restoreDescriptor(HTMLElement.prototype, "getBoundingClientRect", originalBoundingRect);
  restoreDescriptor(SVGElement.prototype, "getBBox", originalGetBBox);
});

describe("summary route initial hydration", () => {
  beforeEach(() => {
    canvasSize = { width: 900, height: 600 };
    resizeObservers.clear();
    resetClientDiagnosticsForTest();
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
  });

  it(
    "commits a persisted final snapshot that arrives after an empty first mount",
    { timeout: 20_000 },
    async () => {
      const tree = finalTree();
      const view = render(<Harness nodes={[]} edges={[]} />);
      triggerResizeObservers();
      await settle(200);
      expect(hydrationPhase()).toBe("uninitialized");

      view.rerender(<Harness nodes={tree.nodes} edges={tree.edges} />);
      triggerResizeObservers();

      await waitFor(
        () => {
          expect(hydrationPhase(), JSON.stringify(diagnostic())).toBe("displaying_committed");
          expect(committedDomNodeCount()).toBe(tree.nodes.length);
        },
        { timeout: 8000 },
      );
      // 表示対象nodeが全件measured済みでも、React Flow の集約フラグは false のまま
      // 固定されうる。ready判定はそのフラグではなく表示対象node ID集合で行う。
      const flowRoot = committedFlowRoot();
      expect(flowRoot?.dataset.discussionDisplayedNodesMeasured).toBe("true");
      expect(
        recentDiagnosticEvents(200).some(
          (event) => event.details?.phase === "initial_hydration_committed",
        ),
      ).toBe(true);
    },
  );

  it(
    "judges readiness on the displayed node set, not the canonical item count",
    { timeout: 20_000 },
    async () => {
      // canonical 12件のうち3件は tentative item のためツリーへ描画されない。
      const tree = finalTree();
      const tentativeIds = ["item-a-0", "item-a-1", "item-b-0"];
      const analysisItems: AnalysisItem[] = tentativeIds.map((id) => ({
        id,
        kind: "issue",
        severity: "low",
        title: id,
        body: "",
        status: "open",
        classificationStatus: "tentative",
      }));
      const view = render(<Harness nodes={[]} edges={[]} analysisItems={analysisItems} />);
      triggerResizeObservers();
      await settle(200);

      view.rerender(
        <Harness nodes={tree.nodes} edges={tree.edges} analysisItems={analysisItems} />,
      );
      triggerResizeObservers();

      await waitFor(
        () => {
          expect(hydrationPhase(), JSON.stringify(diagnostic())).toBe("displaying_committed");
        },
        { timeout: 8000 },
      );
      expect(committedDomNodeCount()).toBe(tree.nodes.length - tentativeIds.length);
      const committedEvent = recentDiagnosticEvents(200).find(
        (event) => event.details?.phase === "initial_hydration_committed",
      );
      expect(committedEvent?.details?.displayedNodeCount).toBe(
        tree.nodes.length - tentativeIds.length,
      );
      expect(committedEvent?.details?.canonicalNodeCount).toBe(tree.nodes.length);
    },
  );

  it(
    "does not lose the hydrated tree across a Strict Mode remount",
    { timeout: 20_000 },
    async () => {
      const tree = finalTree();
      const view = render(
        <StrictMode>
          <Harness nodes={[]} edges={[]} />
        </StrictMode>,
      );
      triggerResizeObservers();
      await settle(200);
      view.rerender(
        <StrictMode>
          <Harness nodes={tree.nodes} edges={tree.edges} />
        </StrictMode>,
      );
      triggerResizeObservers();

      await waitFor(
        () => {
          expect(hydrationPhase(), JSON.stringify(diagnostic())).toBe("displaying_committed");
          expect(committedDomNodeCount()).toBe(tree.nodes.length);
        },
        { timeout: 8000 },
      );
      // 追加のresize/描画が走ってもcommitted treeが0件へ戻らない。
      triggerResizeObservers();
      await settle(400);
      expect(hydrationPhase()).toBe("displaying_committed");
      expect(committedDomNodeCount()).toBe(tree.nodes.length);
    },
  );

  it(
    "shows a retryable error instead of an empty canvas when the first snapshot is invalid",
    { timeout: 20_000 },
    async () => {
      const tree = finalTree();
      const invalidNodes: TreeNodePayload[] = [
        ...tree.nodes,
        { id: "orphan", kind: "issue", parentId: "missing-parent", label: "孤立" },
      ];
      const view = render(<Harness nodes={[]} edges={[]} />);
      triggerResizeObservers();
      await settle(200);

      view.rerender(<Harness nodes={invalidNodes} edges={tree.edges} />);
      triggerResizeObservers();

      await waitFor(
        () =>
          expect(hydrationPhase(), JSON.stringify(diagnostic())).toBe("failed_initial_hydration"),
        { timeout: 8000 },
      );
      const errorPanel = document.querySelector('[data-testid="discussion-tree-hydration-error"]');
      expect(errorPanel).not.toBeNull();
      expect(errorPanel?.textContent).toContain("議論ツリーを読み込めませんでした");
      expect(
        recentDiagnosticEvents(200).some(
          (event) => event.details?.phase === "initial_hydration_failed",
        ),
      ).toBe(true);

      // 再読み込みで正しいsnapshotを取り込み直せる。
      const retryButton = errorPanel?.querySelector("button");
      expect(retryButton).not.toBeNull();
      await act(async () => {
        fireEvent.click(retryButton!);
      });
      view.rerender(<Harness nodes={tree.nodes} edges={tree.edges} />);
      triggerResizeObservers();
      await waitFor(
        () => {
          expect(hydrationPhase(), JSON.stringify(diagnostic())).toBe("displaying_committed");
          expect(committedDomNodeCount()).toBe(tree.nodes.length);
        },
        { timeout: 8000 },
      );
    },
  );

  it("never renders an empty React Flow canvas while hydrating", { timeout: 20_000 }, async () => {
    const tree = finalTree();
    const view = render(<Harness nodes={[]} edges={[]} />);
    triggerResizeObservers();
    await settle(200);
    expect(document.querySelector('[data-testid="discussion-tree-hydration-idle"]')).not.toBeNull();
    expect(committedFlowRoot()).toBeNull();

    view.rerender(<Harness nodes={tree.nodes} edges={tree.edges} />);
    // 準備中は必ず読み込み表示。committed buffer は存在しない。
    expect(document.querySelector('[data-discussion-snapshot-role="committed"]')).toBeNull();
    expect(
      document.querySelector('[data-testid="discussion-tree-hydration-loading"]'),
    ).not.toBeNull();
    triggerResizeObservers();
    await waitFor(() => expect(hydrationPhase()).toBe("displaying_committed"), { timeout: 8000 });
  });
});

function Harness({
  nodes,
  edges,
  analysisItems,
}: {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems?: AnalysisItem[];
}) {
  return (
    <main data-testid="summary-hydration-harness">
      <DiscussionTree
        sessionId={SESSION_ID}
        workspaceId="workspace_summary"
        nodes={nodes}
        edges={edges}
        analysisItems={analysisItems}
      />
    </main>
  );
}

function finalTree() {
  const nodes: TreeNodePayload[] = [
    { id: "root", kind: "topic", label: "名古屋支社ネットワーク障害の振り返りと再発防止会議" },
    { id: "topic-a", kind: "topic", parentId: "root", label: "障害の経緯確認" },
    { id: "topic-b", kind: "topic", parentId: "root", label: "再発防止策" },
  ];
  for (let index = 0; index < 3; index += 1) {
    nodes.push({
      id: `item-a-${index}`,
      kind: "issue",
      parentId: "topic-a",
      label: `経緯の論点 ${index}`,
    });
    nodes.push({
      id: `item-b-${index}`,
      kind: "decision",
      parentId: "topic-b",
      label: `再発防止の決定 ${index}`,
    });
  }
  const edges: TreeEdgePayload[] = nodes
    .filter((node) => node.parentId)
    .map((node) => ({
      id: `edge-${node.parentId}-${node.id}`,
      source: node.parentId!,
      target: node.id,
    }));
  return { nodes, edges };
}

function hydrationPhase() {
  return document.querySelector<HTMLElement>('[data-testid="discussion-tree-canvas"]')?.dataset
    .discussionHydrationPhase;
}

function committedSnapshotRoot() {
  return document.querySelector<HTMLElement>('[data-discussion-snapshot-role="committed"]');
}

function committedFlowRoot() {
  return (
    committedSnapshotRoot()?.querySelector<HTMLElement>("[data-discussion-flow-instance-id]") ??
    null
  );
}

function committedDomNodeCount() {
  return committedSnapshotRoot()?.querySelectorAll(".react-flow__node").length ?? 0;
}

function diagnostic() {
  return [...document.querySelectorAll<HTMLElement>("[data-discussion-buffer-slot]")].map(
    (snapshot) => {
      const flow = snapshot.querySelector<HTMLElement>("[data-discussion-flow-instance-id]");
      return {
        role: snapshot.dataset.discussionSnapshotRole,
        phase: snapshot.dataset.discussionSwapPhase,
        hydration: snapshot.dataset.discussionHydrationPhase,
        programmatic: snapshot.dataset.discussionProgrammaticViewportMoveActive,
        canvasUnavailable: flow?.dataset.discussionCanvasUnavailable,
        frameInvalid: flow?.dataset.discussionFrameInvalidReasons,
        nodesInitialized: flow?.dataset.discussionNodesInitialized,
        measured: flow?.dataset.discussionMeasuredNodeCount,
        displayedMeasured: flow?.dataset.discussionDisplayedNodesMeasured,
        candidate: flow?.dataset.discussionCandidateNodeCount,
        internal: flow?.dataset.discussionInternalNodeCount,
        dom: flow?.dataset.discussionRenderedDomNodeCount,
      };
    },
  );
}

async function settle(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function triggerResizeObservers() {
  act(() => {
    for (const observer of resizeObservers) {
      observer.emit();
    }
  });
}

function elementSize(element: Element) {
  if (element.classList?.contains("react-flow__node")) {
    return { width: 260, height: 90 };
  }
  if (element.classList?.contains("react-flow__handle")) {
    return { width: 8, height: 8 };
  }
  return canvasSize;
}

function resizeEntry(target: Element): ResizeObserverEntry {
  return {
    target,
    contentRect: rect(elementSize(target)),
    borderBoxSize: [],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
  };
}

function rect(size: { width: number; height: number }): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: size.width,
    bottom: size.height,
    width: size.width,
    height: size.height,
    toJSON: () => ({}),
  } as DOMRect;
}

function restoreDescriptor(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}

function restoreProperty(target: object, property: PropertyKey, value: unknown) {
  if (value === undefined) {
    Reflect.deleteProperty(target, property);
  } else {
    Object.defineProperty(target, property, { configurable: true, value });
  }
}
