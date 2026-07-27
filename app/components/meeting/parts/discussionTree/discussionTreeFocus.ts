import type { TreeChangesPayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

export type DerivedTreeChanges = {
  treeVersion?: number;
  newNodeIds: string[];
  updatedNodeIds: string[];
  reparentedNodeIds: string[];
  resolvedNodeIds: string[];
  promotedNodeIds: string[];
};

const emptyChanges = (): DerivedTreeChanges => ({
  newNodeIds: [],
  updatedNodeIds: [],
  reparentedNodeIds: [],
  resolvedNodeIds: [],
  promotedNodeIds: [],
});

export function deriveTreeChanges(
  previous: TreeNodePayload[],
  current: TreeNodePayload[],
  reported?: TreeChangesPayload,
): DerivedTreeChanges {
  const currentIds = new Set(current.map((node) => node.id));
  if (reported) {
    return {
      treeVersion: reported.treeVersion,
      newNodeIds: validUniqueIds(reported.newNodeIds, currentIds),
      updatedNodeIds: validUniqueIds(reported.updatedNodeIds, currentIds),
      reparentedNodeIds: validUniqueIds(reported.reparentedNodeIds, currentIds),
      resolvedNodeIds: validUniqueIds(reported.resolvedNodeIds, currentIds),
      promotedNodeIds: validUniqueIds(reported.promotedNodeIds, currentIds),
    };
  }

  const changes = emptyChanges();
  const previousById = new Map(previous.map((node) => [node.id, node]));
  for (const node of current) {
    const before = previousById.get(node.id);
    if (!before) {
      changes.newNodeIds.push(node.id);
      continue;
    }
    if (before.parentId !== node.parentId) {
      changes.reparentedNodeIds.push(node.id);
    }
    if (before.status !== "resolved" && node.status === "resolved") {
      changes.resolvedNodeIds.push(node.id);
    }
    if (before.kind !== "decision" && node.kind === "decision") {
      changes.promotedNodeIds.push(node.id);
    }
    if (
      before.kind !== node.kind ||
      before.status !== node.status ||
      before.label !== node.label ||
      before.description !== node.description
    ) {
      changes.updatedNodeIds.push(node.id);
    }
  }
  return changes;
}

export function focusTargetIds(changes: DerivedTreeChanges, nodes: TreeNodePayload[]): string[] {
  const rootIds = new Set(
    nodes
      .filter((node) => node.id === "root" || (!node.parentId && node.kind === "topic"))
      .map((node) => node.id),
  );
  for (const ids of [
    changes.newNodeIds,
    changes.promotedNodeIds,
    changes.reparentedNodeIds,
    changes.resolvedNodeIds,
  ]) {
    const targets = ids.filter((id) => !rootIds.has(id));
    if (targets.length > 0) {
      return targets;
    }
  }
  return [];
}

export function treeChangeSignature(changes: DerivedTreeChanges): string {
  return [
    changes.treeVersion ?? "local",
    changes.newNodeIds.join(","),
    changes.updatedNodeIds.join(","),
    changes.reparentedNodeIds.join(","),
    changes.resolvedNodeIds.join(","),
    changes.promotedNodeIds.join(","),
  ].join("|");
}

export function shouldDeferTreeFocus(input: {
  autoFollow: boolean;
  selected: boolean;
  hovered: boolean;
  now: number;
  lastManualInteractionAt: number;
  interactionGraceMs: number;
  lastAutoFocusAt: number;
  cooldownMs: number;
}): boolean {
  return (
    !input.autoFollow ||
    input.selected ||
    input.hovered ||
    input.now - input.lastManualInteractionAt < input.interactionGraceMs ||
    input.now - input.lastAutoFocusAt < input.cooldownMs
  );
}

export function focusAnimationDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 280;
}

export function allTargetsVisible(
  positions: Array<{ x: number; y: number }>,
  viewport: { x: number; y: number; zoom: number },
  pane: { width: number; height: number },
  nodeSize: { width: number; height: number },
  margin = 20,
): boolean {
  if (
    positions.length === 0 ||
    pane.width <= 0 ||
    pane.height <= 0 ||
    !isFiniteViewport(viewport)
  ) {
    return false;
  }
  return positions.every((position) => {
    const left = position.x * viewport.zoom + viewport.x;
    const top = position.y * viewport.zoom + viewport.y;
    const right = left + nodeSize.width * viewport.zoom;
    const bottom = top + nodeSize.height * viewport.zoom;
    return (
      left >= margin &&
      top >= margin &&
      right <= pane.width - margin &&
      bottom <= pane.height - margin
    );
  });
}

export function anyTargetVisible(
  positions: Array<{ x: number; y: number }>,
  viewport: { x: number; y: number; zoom: number },
  pane: { width: number; height: number },
  nodeSize: { width: number; height: number },
): boolean {
  if (
    positions.length === 0 ||
    pane.width <= 0 ||
    pane.height <= 0 ||
    !isFiniteViewport(viewport)
  ) {
    return false;
  }
  return positions.some((position) => {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return false;
    }
    const left = position.x * viewport.zoom + viewport.x;
    const top = position.y * viewport.zoom + viewport.y;
    const right = left + nodeSize.width * viewport.zoom;
    const bottom = top + nodeSize.height * viewport.zoom;
    return right >= 0 && bottom >= 0 && left <= pane.width && top <= pane.height;
  });
}

export function isFiniteViewport(viewport: { x: number; y: number; zoom: number }): boolean {
  return (
    Number.isFinite(viewport.x) &&
    Number.isFinite(viewport.y) &&
    Number.isFinite(viewport.zoom) &&
    viewport.zoom > 0
  );
}

function validUniqueIds(ids: string[] | undefined, allowed: Set<string>): string[] {
  return [...new Set(ids ?? [])].filter((id) => allowed.has(id));
}
