import { act, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

// jsdom does not complete React Flow's internal measurement lifecycle even
// though this fixture supplies deterministic node geometry. The dedicated
// viewport suite covers nodesInitialized=false; this transition suite models
// the initialized browser state so it can exercise LKG retention at 0x0.
vi.mock("@xyflow/react", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    useNodesInitialized: () => true,
    useReactFlow: () => {
      const instance = actual.useReactFlow();
      const requestedViewportRef = React.useRef<{
        x: number;
        y: number;
        zoom: number;
      } | null>(null);
      return React.useMemo(
        () => ({
          ...instance,
          getViewport: () => {
            if (requestedViewportRef.current) return requestedViewportRef.current;
            const current = instance.getViewport();
            if ([current.x, current.y, current.zoom].every(Number.isFinite)) return current;
            const transform =
              document.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform;
            const matched = /translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(
              transform ?? "",
            );
            return matched
              ? { x: Number(matched[1]), y: Number(matched[2]), zoom: Number(matched[3]) }
              : { x: 0, y: 0, zoom: 1 };
          },
          setViewport: async (...args: Parameters<typeof instance.setViewport>) => {
            requestedViewportRef.current = args[0];
            try {
              await instance.setViewport(...args);
            } catch {
              // The real jsdom renderer may reject a viewport change before
              // its hidden preparation pane has dimensions. The mock keeps
              // the requested finite viewport as that provider's state.
            }
            return true;
          },
          setCenter: (...args: Parameters<typeof instance.setCenter>) => {
            requestedViewportRef.current = null;
            return instance.setCenter(...args);
          },
          fitView: (...args: Parameters<typeof instance.fitView>) => {
            requestedViewportRef.current = null;
            return instance.fitView(...args);
          },
        }),
        [instance],
      );
    },
  };
});

import { DiscussionTree, type DiscussionTreeFocusRequest } from "./DiscussionTree";
import { SESSION_1FDC_ID, session1fdcSnapshots } from "./__fixtures__/session1fdcTreeSnapshots";
import {
  SESSION_28F3_ID,
  session28f3AnalysisItems,
  session28f3Snapshots,
} from "./__fixtures__/session28f3TreeSnapshots";

type SnapshotVersion = 12 | 13 | 14 | 15;

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
  readonly m11: number;
  readonly m22: number;
  readonly m41: number;
  readonly m42: number;

  constructor(transform = "") {
    const matrix = /matrix\(([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,)]+)/.exec(transform);
    this.m11 = matrix ? Number(matrix[1]) || 1 : 1;
    this.m22 = matrix ? Number(matrix[4]) || 1 : 1;
    this.m41 = matrix ? Number(matrix[5]) || 0 : 0;
    this.m42 = matrix ? Number(matrix[6]) || 0 : 0;
  }
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("session_1fdc26b44086f0b8 mounted v12→v15 transition", () => {
  beforeEach(() => {
    canvasSize = { width: 900, height: 600 };
    resizeObservers.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
  });

  it(
    "keeps one committed React Flow visible through buffered reparent, focus, fit and resize",
    { timeout: 15_000 },
    async () => {
      let now = 10_000;
      const monotonicStart = performance.now();
      vi.spyOn(Date, "now").mockImplementation(
        () => now + Math.max(0, performance.now() - monotonicStart),
      );
      vi.spyOn(console, "error").mockImplementation(() => {});
      const viewportSamples: Array<{
        version: SnapshotVersion;
        x: number;
        y: number;
        zoom: number;
      }> = [];
      const view = render(<TransitionHarness version={12} />);
      triggerResizeObservers();

      await expectStableVersion(12, 19, { width: 900, height: 600 });
      await finiteDOMViewport();
      const reactFlowInstance = committedQuery(".react-flow");
      expect(reactFlowInstance).not.toBeNull();
      expect(committedQuery('[data-id="item-v12-cap-evicted"]')).not.toBeNull();

      // 実UIのcollapseを発火し、子ノードがReact Flow内部stateから除外されることを確認。
      const group = await flowNode("group-7f859ddcc5d2");
      fireEvent.click(within(group).getByRole("button", { name: "子ノードを折りたたむ" }));
      await waitFor(() => expect(renderedFlowNodeCount()).toBeLessThan(19));

      // Agenda Progress/AIカード相当のfocus requestで隠れた祖先を展開し直す。
      now = 11_000;
      view.rerender(
        <TransitionHarness
          version={12}
          focusItemRequest={{ itemId: "item-todo-bbb88a0a2821", token: 1 }}
        />,
      );
      await expectStableVersion(12, 19, { width: 900, height: 600 });
      await settleRenderFrame();
      viewportSamples.push({ version: 12, ...(await finiteDOMViewport()) });

      // v13差分はcontainer 0x0中に投入する。React Flow内部は500x500へfallbackするが、
      // DiscussionTreeは外側ResizeObserverの0x0を正しく使い、fit/focusを延期する。
      now = 16_000;
      canvasSize = { width: 0, height: 0 };
      triggerResizeObservers();
      view.rerender(<TransitionHarness version={13} agendaExpanded />);
      await waitFor(() => expect(renderedFlowNodeCount()).toBe(19));
      expect(committedQuery("[data-discussion-lkg-retained='true']")).not.toBeNull();

      // Agenda Progress展開後の周辺レイアウトを想定して正サイズへ復帰。
      canvasSize = { width: 820, height: 480 };
      triggerResizeObservers();
      view.rerender(<TransitionHarness version={13} agendaExpanded />);
      await expectStableVersion(13, 21, { width: 820, height: 480 });
      expect(committedQuery('[data-id="item-v12-cap-evicted"]')).toBeNull();
      for (const newId of [
        "candidate-3ade9c3ca58b",
        "group-f593d8263314",
        "item-todo-a0e5e6896967",
      ]) {
        expect(committedQuery(`[data-id="${newId}"]`)).not.toBeNull();
      }
      expect(
        committedQuery('[data-id="edge-group-f593d8263314-item-issue-discussion-6b593f577ba5"]'),
      ).not.toBeNull();
      expect(committedQuery('[data-id="item-todo-bbb88a0a2821"]')).not.toBeNull();
      viewportSamples.push({ version: 13, ...(await finiteDOMViewport()) });

      // collapse stateをversion更新間で保持したまま、v14の新旧reparent edge混在を投入。
      const dynamicTopic = await flowNode("candidate-3ade9c3ca58b");
      fireEvent.click(within(dynamicTopic).getByRole("button", { name: "子ノードを折りたたむ" }));
      await waitFor(() => expect(renderedFlowNodeCount()).toBeLessThan(21));
      now = 20_000;
      view.rerender(
        <TransitionHarness
          version={14}
          edges={v14WithStaleReparentEdge()}
          agendaExpanded
          focusItemRequest={{ itemId: "item-risk-6fd10beab717", token: 2 }}
        />,
      );
      await expectStableVersion(14, 21, { width: 820, height: 480 });
      expect(renderedFlowEdgeCount()).toBe(20);
      expect(
        committedQuery(
          '[data-id="edge-topic-agenda-7dd3ab9e5ea9-item-issue-discussion-78a7f63f99de"]',
        ),
      ).not.toBeNull();
      viewportSamples.push({ version: 14, ...(await finiteDOMViewport()) });

      // v15のreparentと周辺レイアウト縮小を同じinstanceへ適用する。
      now = 24_000;
      canvasSize = { width: 760, height: 440 };
      triggerResizeObservers();
      view.rerender(
        <TransitionHarness
          version={15}
          focusItemRequest={{ itemId: "item-issue-discussion-947e3072c2fd", token: 3 }}
        />,
      );
      await expectStableVersion(15, 21, { width: 760, height: 440 });
      expect(
        committedQuery(
          '[data-id="edge-topic-agenda-a5f8fcd0c7a2-item-issue-discussion-947e3072c2fd"]',
        ),
      ).not.toBeNull();
      viewportSamples.push({ version: 15, ...(await finiteDOMViewport()) });

      expect(viewportSamples.map((sample) => sample.version)).toEqual([12, 13, 14, 15]);
      for (const sample of viewportSamples) {
        expect(Number.isFinite(sample.x)).toBe(true);
        expect(Number.isFinite(sample.y)).toBe(true);
        expect(Number.isFinite(sample.zoom)).toBe(true);
        expect(sample.zoom).toBeGreaterThanOrEqual(0.2);
        expect(sample.zoom).toBeLessThanOrEqual(1.25);
      }
      expect(viewportSamples[3]).toEqual({ ...viewportSamples[2], version: 15 });

      expect(committedSnapshotRoot()?.querySelectorAll(".react-flow")).toHaveLength(1);
      view.unmount();
      expect(committedQuery(".react-flow")).toBeNull();
    },
  );
});

describe("session_28f3f2e6706a28a4 exact mounted v12→v13→v14 transition", () => {
  beforeEach(() => {
    canvasSize = { width: 900, height: 600 };
    resizeObservers.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
  });

  it(
    "keeps one committed React Flow visible across two groups, eight reparents, 0x0 and focus",
    { timeout: 15_000 },
    async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const view = render(<Session28f3Harness version={12} />);
      triggerResizeObservers();

      await expectStableSession28f3(12, 14, { width: 900, height: 600 });
      await settleRenderFrame();
      const flowRoot = committedQuery<HTMLElement>("[data-discussion-flow-instance-id]");
      const instanceId = flowRoot?.dataset.discussionFlowInstanceId;
      expect(instanceId).toBeTruthy();
      expect(committedQuery('[data-id="root"]')).not.toBeNull();

      canvasSize = { width: 0, height: 0 };
      triggerResizeObservers();
      view.rerender(<Session28f3Harness version={13} agendaExpanded />);
      await waitFor(() => {
        expect(renderedFlowNodeCount()).toBe(14);
        expect(committedQuery("[data-discussion-lkg-retained='true']")).not.toBeNull();
      });

      canvasSize = { width: 820, height: 480 };
      triggerResizeObservers();
      view.rerender(<Session28f3Harness version={13} agendaExpanded />);
      await expectStableSession28f3(13, 16, { width: 820, height: 480 });
      for (const groupId of ["group-dd10e2044647", "group-e0d0e2c2c03e"]) {
        expect(committedQuery(`[data-id="${groupId}"]`)).not.toBeNull();
      }

      const group = await flowNode("group-dd10e2044647");
      fireEvent.click(within(group).getByRole("button", { name: "子ノードを折りたたむ" }));
      await waitFor(() => expect(renderedFlowNodeCount()).toBeLessThan(16));
      view.rerender(
        <Session28f3Harness
          version={13}
          agendaExpanded
          focusItemRequest={{ itemId: "item-issue-discussion-a742c0ebe0fe", token: 1 }}
        />,
      );
      await expectStableSession28f3(13, 16, { width: 820, height: 480 });

      const staleEdges = [
        ...session28f3Snapshots[14].edges,
        {
          id: "stale-v13-group-parent",
          source: "group-dd10e2044647",
          target: "item-issue-discussion-a742c0ebe0fe",
        },
      ];
      view.rerender(
        <Session28f3Harness
          version={14}
          edges={staleEdges}
          focusItemRequest={{ itemId: "item-issue-discussion-a742c0ebe0fe", token: 2 }}
        />,
      );
      await waitFor(() => {
        expect(committedSnapshotRoot()?.dataset.discussionSwapPhase).toBe("failed");
        expect(renderedFlowNodeCount()).toBe(16);
      });
      expect(committedQuery('[data-id="group-dd10e2044647"]')).not.toBeNull();

      // A dangling stale edge is rejected atomically. The following clean v14
      // snapshot is prepared separately and only then replaces committed v13.
      view.rerender(
        <Session28f3Harness
          version={14}
          focusItemRequest={{ itemId: "item-issue-discussion-a742c0ebe0fe", token: 2 }}
        />,
      );
      await expectStableSession28f3(14, 14, { width: 820, height: 480 });
      expect(committedQuery('[data-id="group-dd10e2044647"]')).toBeNull();
      expect(
        committedQuery(
          '[data-id="edge-topic-agenda-64b761a79cc0-item-issue-discussion-a742c0ebe0fe"]',
        ),
      ).not.toBeNull();
      expect(committedQuery(".react-flow__viewport")?.getAttribute("style")).not.toContain("NaN");
      const committedInstanceId = committedQuery<HTMLElement>("[data-discussion-flow-instance-id]")
        ?.dataset.discussionFlowInstanceId;
      expect(committedInstanceId).toBeTruthy();
      expect(committedSnapshotRoot()?.querySelectorAll(".react-flow")).toHaveLength(1);
      const invalidNodes = session28f3Snapshots[14].nodes.map((node) =>
        node.id === "item-issue-discussion-a742c0ebe0fe"
          ? { ...node, parentId: "missing-parent" }
          : node,
      );
      view.rerender(<Session28f3Harness version={14} nodes={invalidNodes} />);
      await waitFor(() => {
        expect(renderedFlowNodeCount()).toBe(14);
        expect(committedSnapshotRoot()?.dataset.discussionSwapPhase).toBe("failed");
        expect(committedQuery('[data-id="root"]')).not.toBeNull();
      });
    },
  );
});

function TransitionHarness({
  version,
  edges,
  agendaExpanded = false,
  focusItemRequest = null,
}: {
  version: SnapshotVersion;
  edges?: TreeEdgePayload[];
  agendaExpanded?: boolean;
  focusItemRequest?: DiscussionTreeFocusRequest | null;
}) {
  const snapshot = session1fdcSnapshots[version];
  return (
    <main data-testid="meeting-transition-harness">
      <aside
        data-testid="agenda-progress-surrounding-layout"
        style={{ height: agendaExpanded ? 180 : 80 }}
      >
        Agenda Progress
      </aside>
      <DiscussionTree
        sessionId={SESSION_1FDC_ID}
        nodes={snapshot.nodes}
        edges={edges ?? snapshot.edges}
        treeChanges={snapshot.treeChanges}
        analysisVersion={version}
        treeVersion={version}
        layoutSignal={agendaExpanded}
        focusItemRequest={focusItemRequest}
      />
    </main>
  );
}

function Session28f3Harness({
  version,
  nodes,
  edges,
  agendaExpanded = false,
  focusItemRequest = null,
}: {
  version: 12 | 13 | 14;
  nodes?: TreeNodePayload[];
  edges?: TreeEdgePayload[];
  agendaExpanded?: boolean;
  focusItemRequest?: DiscussionTreeFocusRequest | null;
}) {
  const snapshot = session28f3Snapshots[version];
  return (
    <main data-testid="session-28f3-transition-harness">
      <aside style={{ height: agendaExpanded ? 190 : 72 }}>Agenda Progress</aside>
      <DiscussionTree
        sessionId={SESSION_28F3_ID}
        nodes={nodes ?? snapshot.nodes}
        edges={edges ?? snapshot.edges}
        analysisItems={session28f3AnalysisItems}
        treeChanges={snapshot.treeChanges}
        analysisVersion={version}
        treeVersion={version}
        treeHash={snapshot.treeHash}
        layoutSignal={agendaExpanded}
        focusItemRequest={focusItemRequest}
      />
    </main>
  );
}

async function expectStableVersion(
  version: SnapshotVersion,
  nodeCount: number,
  size: { width: number; height: number },
) {
  await waitFor(() => {
    expect(
      committedSnapshotRoot()?.dataset.discussionSnapshotVersion,
      JSON.stringify(snapshotDiagnostic()),
    ).toBe(String(version));
    expect(renderedFlowNodeCount()).toBe(nodeCount);
  });
  const flow = committedQuery<HTMLElement>(".react-flow");
  expect(flow?.getBoundingClientRect()).toMatchObject(size);
}

async function expectStableSession28f3(
  version: 12 | 13 | 14,
  renderedNodeCount: number,
  size: { width: number; height: number },
) {
  await waitFor(() => {
    expect(
      committedSnapshotRoot()?.dataset.discussionSnapshotVersion,
      JSON.stringify(snapshotDiagnostic()),
    ).toBe(String(version));
    expect(renderedFlowNodeCount()).toBe(renderedNodeCount);
  });
  const flow = committedQuery<HTMLElement>(".react-flow");
  expect(flow?.getBoundingClientRect()).toMatchObject(size);
  const viewport = await finiteDOMViewport();
  expect(viewport.zoom).toBeGreaterThanOrEqual(0.2);
  expect(viewport.zoom).toBeLessThanOrEqual(1.25);
}

async function finiteDOMViewport() {
  let viewport = { x: Number.NaN, y: Number.NaN, zoom: Number.NaN };
  await waitFor(() => {
    const element = committedQuery<HTMLElement>(".react-flow__viewport");
    const transform = element?.style.transform ?? "";
    const matched = /translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(transform);
    viewport = matched
      ? { x: Number(matched[1]), y: Number(matched[2]), zoom: Number(matched[3]) }
      : viewport;
    expect(Number.isFinite(viewport.x)).toBe(true);
    expect(Number.isFinite(viewport.y)).toBe(true);
    expect(Number.isFinite(viewport.zoom)).toBe(true);
    expect(viewport.zoom).toBeGreaterThan(0);
  });
  return viewport;
}

async function flowNode(id: string) {
  let node: HTMLElement | null = null;
  await waitFor(() => {
    node = committedQuery<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
    expect(node).not.toBeNull();
  });
  return node!;
}

function renderedFlowNodeCount() {
  return committedSnapshotRoot()?.querySelectorAll(".react-flow__node").length ?? 0;
}

function renderedFlowEdgeCount() {
  return committedSnapshotRoot()?.querySelectorAll(".react-flow__edge").length ?? 0;
}

function committedSnapshotRoot() {
  return document.querySelector<HTMLElement>('[data-discussion-snapshot-role="committed"]');
}

function committedQuery<T extends Element>(selector: string) {
  return committedSnapshotRoot()?.querySelector<T>(selector) ?? null;
}

function snapshotDiagnostic() {
  return [
    ...document.querySelectorAll<HTMLElement>(
      "[data-discussion-snapshot-role][data-discussion-snapshot-version]",
    ),
  ].map((snapshot) => {
      const flow = snapshot.querySelector<HTMLElement>("[data-discussion-flow-instance-id]");
      return {
        role: snapshot.dataset.discussionSnapshotRole,
        version: snapshot.dataset.discussionSnapshotVersion,
        generation: snapshot.dataset.discussionSnapshotGeneration,
        phase: snapshot.dataset.discussionSwapPhase,
        interactionActive: snapshot.dataset.discussionViewportInteractionActive,
        programmaticActive: snapshot.dataset.discussionProgrammaticViewportMoveActive,
        manualResetActive: snapshot.dataset.discussionManualResetActive,
        canvasUnavailable: flow?.dataset.discussionCanvasUnavailable,
        frameInvalid: flow?.dataset.discussionFrameInvalidReasons,
        nodesInitialized: flow?.dataset.discussionNodesInitialized,
        candidateCount: flow?.dataset.discussionCandidateNodeCount,
        internalCount: flow?.dataset.discussionInternalNodeCount,
        measuredCount: flow?.dataset.discussionMeasuredNodeCount,
        domCount: flow?.dataset.discussionRenderedDomNodeCount,
        viewport: flow?.querySelector<HTMLElement>(".react-flow__viewport")?.style.transform,
      };
    });
}

async function settleRenderFrame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
}

function v14WithStaleReparentEdge(): TreeEdgePayload[] {
  const snapshot = session1fdcSnapshots[14];
  return [
    ...snapshot.edges,
    {
      id: "stale-v13-parent",
      source: "candidate-3ade9c3ca58b",
      target: "item-issue-discussion-78a7f63f99de",
    },
  ];
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
