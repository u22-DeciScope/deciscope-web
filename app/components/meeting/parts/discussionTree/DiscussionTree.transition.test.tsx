import { act, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TreeEdgePayload } from "~/api/meetings/meetingRuntimeTypes";

import { DiscussionTree, type DiscussionTreeFocusRequest } from "./DiscussionTree";
import { SESSION_1FDC_ID, session1fdcSnapshots } from "./__fixtures__/session1fdcTreeSnapshots";

type DebugDetails = Record<string, unknown>;
type DebugSpy = { mock: { calls: unknown[][] } };
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
  readonly m11 = 1;
  readonly m22: number;

  constructor(transform = "") {
    const matrix = /matrix\([^,]+,[^,]+,[^,]+,([^,]+)/.exec(transform);
    this.m22 = matrix ? Number(matrix[1]) || 1 : 1;
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

describe("session_1fdc26b44086f0b8 mounted v12→v15 transition", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_DECISCOPE_DEBUG_MEETING_START", "1");
    canvasSize = { width: 900, height: 600 };
    resizeObservers.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps one DiscussionTree/React Flow instance coherent through reparent, focus, fit and resize", async () => {
    let now = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const viewportSamples: Array<{ version: SnapshotVersion; x: number; y: number; zoom: number }> =
      [];
    const view = render(<TransitionHarness version={12} />);
    triggerResizeObservers();

    await expectStableVersion(debug, 12, 19, { width: 900, height: 600 });
    expect(
      debugEvents(debug, "Discussion tree fit requested").some(
        (event) => event.treeVersion === 12 && event.fitViewReason === "initial",
      ),
    ).toBe(true);
    const reactFlowInstance = document.querySelector(".react-flow");
    expect(reactFlowInstance).not.toBeNull();
    expect(document.querySelector('[data-id="item-v12-cap-evicted"]')).not.toBeNull();
    expect(debugEvents(debug, "DiscussionTree mounted")).toHaveLength(1);
    expect(debugEvents(debug, "DiscussionTree unmounted")).toHaveLength(0);
    expect(debugEvents(debug, "Discussion React Flow mounted")).toHaveLength(1);
    expect(debugEvents(debug, "Discussion React Flow unmounted")).toHaveLength(0);

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
    await expectStableVersion(debug, 12, 19, { width: 900, height: 600 });
    viewportSamples.push({ version: 12, ...(await finiteDOMViewport()) });

    // v13差分はcontainer 0x0中に投入する。React Flow内部は500x500へfallbackするが、
    // DiscussionTreeは外側ResizeObserverの0x0を正しく使い、fit/focusを延期する。
    now = 16_000;
    canvasSize = { width: 0, height: 0 };
    triggerResizeObservers();
    view.rerender(<TransitionHarness version={13} agendaExpanded />);
    await waitFor(() => expect(renderedFlowNodeCount()).toBe(21));
    await waitFor(() => {
      const state = latestRenderState(debug, 13, 0, 0);
      expect(state?.propNodeCount).toBe(21);
      expect(state?.reactFlowPaneWidth).toBe(500);
      expect(state?.reactFlowPaneHeight).toBe(500);
    });
    expect(
      debugEvents(debug, "Discussion tree fit deferred").some(
        (event) => event.treeVersion === 13 && event.containerWidth === 0,
      ),
    ).toBe(true);

    // Agenda Progress展開後の周辺レイアウトを想定して正サイズへ復帰。
    canvasSize = { width: 820, height: 480 };
    triggerResizeObservers();
    view.rerender(<TransitionHarness version={13} agendaExpanded />);
    await expectStableVersion(debug, 13, 21, { width: 820, height: 480 });
    expect(document.querySelector('[data-id="item-v12-cap-evicted"]')).toBeNull();
    for (const newId of [
      "candidate-3ade9c3ca58b",
      "group-f593d8263314",
      "item-todo-a0e5e6896967",
    ]) {
      expect(document.querySelector(`[data-id="${newId}"]`)).not.toBeNull();
    }
    expect(
      document.querySelector(
        '[data-id="edge-group-f593d8263314-item-issue-discussion-6b593f577ba5"]',
      ),
    ).not.toBeNull();
    expect(
      debugEvents(debug, "Discussion tree structural focus").some(
        (event) => event.treeVersion === 13,
      ),
    ).toBe(true);
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
    await expectStableVersion(debug, 14, 21, { width: 820, height: 480 });
    const v14 = latestRenderState(debug, 14, 820, 480);
    expect(v14?.canonicalEdgeCount).toBe(21);
    expect(v14?.renderedEdgeCount).toBe(20);
    expect(v14?.reactFlowInternalEdgeCount).toBe(20);
    expect(
      document.querySelector(
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
    await expectStableVersion(debug, 15, 21, { width: 760, height: 440 });
    expect(
      document.querySelector(
        '[data-id="edge-topic-agenda-a5f8fcd0c7a2-item-issue-discussion-947e3072c2fd"]',
      ),
    ).not.toBeNull();
    viewportSamples.push({ version: 15, ...(await finiteDOMViewport()) });

    for (const version of [12, 13, 14, 15] as const) {
      const expected = version === 12 ? 19 : 21;
      const state = latestExpandedRenderState(debug, version, expected);
      expect(state).toMatchObject({
        propNodeCount: expected,
        convertedNodeCount: expected,
        layoutInputNodeCount: expected,
        layoutOutputNodeCount: expected,
        renderedNodeCount: expected,
        reactFlowInternalNodeCount: expected,
        missingParentCount: 0,
        unreachableNodeCount: 0,
        invalidPositionCount: 0,
        layoutError: null,
      });
    }
    expect(viewportSamples.map((sample) => sample.version)).toEqual([12, 13, 14, 15]);
    for (const sample of viewportSamples) {
      expect(Number.isFinite(sample.x)).toBe(true);
      expect(Number.isFinite(sample.y)).toBe(true);
      expect(Number.isFinite(sample.zoom)).toBe(true);
      expect(sample.zoom).toBeGreaterThanOrEqual(0.2);
      expect(sample.zoom).toBeLessThanOrEqual(1.25);
    }
    expect(viewportSamples[3]).toEqual({ ...viewportSamples[2], version: 15 });

    expect(document.querySelector(".react-flow")).toBe(reactFlowInstance);
    expect(debugEvents(debug, "DiscussionTree mounted")).toHaveLength(1);
    expect(debugEvents(debug, "DiscussionTree unmounted")).toHaveLength(0);
    expect(debugEvents(debug, "Discussion React Flow mounted")).toHaveLength(1);
    expect(debugEvents(debug, "Discussion React Flow unmounted")).toHaveLength(0);
    view.unmount();
    expect(debugEvents(debug, "DiscussionTree unmounted")).toHaveLength(1);
    expect(debugEvents(debug, "Discussion React Flow unmounted")).toHaveLength(1);
  });
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

async function expectStableVersion(
  debug: DebugSpy,
  version: SnapshotVersion,
  nodeCount: number,
  size: { width: number; height: number },
) {
  await waitFor(() => expect(renderedFlowNodeCount()).toBe(nodeCount));
  await waitFor(() => {
    const state = latestRenderState(debug, version, size.width, size.height);
    expect(state).toMatchObject({
      propNodeCount: nodeCount,
      convertedNodeCount: nodeCount,
      layoutInputNodeCount: nodeCount,
      layoutOutputNodeCount: nodeCount,
      renderedNodeCount: nodeCount,
      reactFlowInternalNodeCount: nodeCount,
      missingParentCount: 0,
      unreachableNodeCount: 0,
      invalidPositionCount: 0,
      layoutError: null,
    });
  });
}

function latestRenderState(
  debug: DebugSpy,
  version: SnapshotVersion,
  width: number,
  height: number,
) {
  return debugEvents(debug, "Discussion tree render state")
    .reverse()
    .find(
      (event) =>
        event.treeVersion === version &&
        event.containerWidth === width &&
        event.containerHeight === height,
    );
}

function latestExpandedRenderState(debug: DebugSpy, version: SnapshotVersion, expected: number) {
  return debugEvents(debug, "Discussion tree render state")
    .reverse()
    .find(
      (event) =>
        event.treeVersion === version &&
        event.renderedNodeCount === expected &&
        event.reactFlowInternalNodeCount === expected,
    );
}

function debugEvents(debug: DebugSpy, message: string): DebugDetails[] {
  return debug.mock.calls.flatMap((call) =>
    call[0] === `[meeting-page] ${message}` && isDebugDetails(call[1]) ? [call[1]] : [],
  );
}

function isDebugDetails(value: unknown): value is DebugDetails {
  return typeof value === "object" && value !== null;
}

async function finiteDOMViewport() {
  let viewport = { x: Number.NaN, y: Number.NaN, zoom: Number.NaN };
  await waitFor(() => {
    const element = document.querySelector<HTMLElement>(".react-flow__viewport");
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
    node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
    expect(node).not.toBeNull();
  });
  return node!;
}

function renderedFlowNodeCount() {
  return document.querySelectorAll(".react-flow__node").length;
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
