import { describe, expect, it } from "vitest";

import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

import {
  allTargetsVisible,
  anyTargetVisible,
  deriveTreeChanges,
  focusAnimationDuration,
  focusTargetIds,
  isFiniteViewport,
  treeChangeSignature,
  shouldDeferTreeFocus,
} from "./discussionTreeFocus";

const base: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "会議" },
  { id: "agenda-1", kind: "topic", parentId: "root", label: "議題" },
  { id: "item-1", kind: "todo", parentId: "agenda-1", label: "確認", status: "open" },
];

describe("discussion tree structural focus", () => {
  it("prioritizes a newly created group", () => {
    const current = [
      ...base,
      { id: "group-1", kind: "group", parentId: "agenda-1", label: "条件" },
    ];
    const changes = deriveTreeChanges(base, current);
    expect(focusTargetIds(changes, current)).toEqual(["group-1"]);
  });

  it("returns one batch for multiple additions instead of a focus sequence", () => {
    const current = [
      ...base,
      { id: "item-2", kind: "question", parentId: "agenda-1", label: "基準は何か" },
      { id: "item-3", kind: "todo", parentId: "agenda-1", label: "データ確認" },
    ];
    expect(focusTargetIds(deriveTreeChanges(base, current), current)).toEqual(["item-2", "item-3"]);
  });

  it("detects reparent, resolved, and decision promotion without a backend diff", () => {
    const current = base.map((node) =>
      node.id === "item-1"
        ? { ...node, parentId: "group-1", kind: "decision", status: "resolved" }
        : node,
    );
    const changes = deriveTreeChanges(base, current);
    expect(changes.reparentedNodeIds).toEqual(["item-1"]);
    expect(changes.resolvedNodeIds).toEqual(["item-1"]);
    expect(changes.promotedNodeIds).toEqual(["item-1"]);
    expect(focusTargetIds(changes, current)).toEqual(["item-1"]);
  });

  it("uses the backend version in the idempotency signature", () => {
    const changes = deriveTreeChanges(base, base, {
      treeVersion: 12,
      updatedNodeIds: ["item-1", "missing"],
    });
    expect(changes.updatedNodeIds).toEqual(["item-1"]);
    expect(treeChangeSignature(changes)).toContain("12|");
    expect(treeChangeSignature(changes)).toBe(treeChangeSignature(changes));
  });

  it("defers while the user is inspecting and during cooldown", () => {
    expect(
      shouldDeferTreeFocus({
        autoFollow: true,
        selected: true,
        hovered: false,
        now: 10_000,
        lastManualInteractionAt: 0,
        interactionGraceMs: 4_000,
        lastAutoFocusAt: 0,
        cooldownMs: 2_000,
      }),
    ).toBe(true);
    expect(
      shouldDeferTreeFocus({
        autoFollow: true,
        selected: false,
        hovered: false,
        now: 10_000,
        lastManualInteractionAt: 0,
        interactionGraceMs: 4_000,
        lastAutoFocusAt: 0,
        cooldownMs: 2_000,
      }),
    ).toBe(false);
  });

  it("disables viewport animation for reduced motion", () => {
    expect(focusAnimationDuration(true)).toBe(0);
    expect(focusAnimationDuration(false)).toBe(280);
  });

  it("does not pan when every target is already inside the viewport", () => {
    expect(
      allTargetsVisible(
        [{ x: 100, y: 80 }],
        { x: 0, y: 0, zoom: 1 },
        { width: 800, height: 500 },
        { width: 260, height: 90 },
      ),
    ).toBe(true);
    expect(
      allTargetsVisible(
        [{ x: 700, y: 80 }],
        { x: 0, y: 0, zoom: 1 },
        { width: 800, height: 500 },
        { width: 260, height: 90 },
      ),
    ).toBe(false);
  });

  it("rejects non-finite/zero viewports and detects when every node is outside", () => {
    expect(isFiniteViewport({ x: 0, y: 0, zoom: 1 })).toBe(true);
    expect(isFiniteViewport({ x: Number.NaN, y: 0, zoom: 1 })).toBe(false);
    expect(isFiniteViewport({ x: 0, y: Number.POSITIVE_INFINITY, zoom: 1 })).toBe(false);
    expect(isFiniteViewport({ x: 0, y: 0, zoom: 0 })).toBe(false);
    expect(
      anyTargetVisible(
        [{ x: 2_000, y: 2_000 }],
        { x: 0, y: 0, zoom: 1 },
        { width: 800, height: 500 },
        { width: 260, height: 90 },
      ),
    ).toBe(false);
  });
});
