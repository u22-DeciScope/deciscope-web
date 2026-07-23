import type {
  LiveAnalysisPayload,
  LiveTreePayloadState,
  MeetingAIAnalyses,
  MeetingAIAnalysis,
  TreeSnapshotPayload,
} from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSessionStatus } from "~/api/meetingSessions/meetingSessionsApi";

export type AnalysisRuntimeStatus = {
  liveVersion: number | null;
  finalVersion: number | null;
  liveStatus: MeetingAIAnalysis["status"] | null;
  finalStatus: MeetingAIAnalysis["status"] | null;
  meetingStatus: MeetingSessionStatus | null;
  websocketClosed: boolean;
};

export type MeetingAnalysisState = {
  sessionId: string;
  liveAnalysis: MeetingAIAnalysis | null;
  finalSummary: MeetingAIAnalysis | null;
  finalTreeSnapshot: TreeSnapshotPayload | null;
  analysisRuntimeStatus: AnalysisRuntimeStatus;
};

export type MeetingAnalysisAction =
  | { type: "session_changed"; sessionId: string }
  | { type: "analysis_event"; analysis: MeetingAIAnalysis }
  | { type: "rest_snapshot"; analyses: MeetingAIAnalyses }
  | { type: "meeting_status"; status: MeetingSessionStatus }
  | { type: "websocket_closed" }
  | { type: "explicit_reset" };

export function initialMeetingAnalysisState(sessionId = ""): MeetingAnalysisState {
  return {
    sessionId,
    liveAnalysis: null,
    finalSummary: null,
    finalTreeSnapshot: null,
    analysisRuntimeStatus: {
      liveVersion: null,
      finalVersion: null,
      liveStatus: null,
      finalStatus: null,
      meetingStatus: null,
      websocketClosed: false,
    },
  };
}

export function meetingAnalysisReducer(
  state: MeetingAnalysisState,
  action: MeetingAnalysisAction,
): MeetingAnalysisState {
  switch (action.type) {
    case "session_changed":
      return action.sessionId === state.sessionId
        ? state
        : initialMeetingAnalysisState(action.sessionId);
    case "explicit_reset":
      return initialMeetingAnalysisState(state.sessionId);
    case "meeting_status":
      return {
        ...state,
        analysisRuntimeStatus: {
          ...state.analysisRuntimeStatus,
          meetingStatus: action.status,
        },
      };
    case "websocket_closed":
      return {
        ...state,
        analysisRuntimeStatus: {
          ...state.analysisRuntimeStatus,
          websocketClosed: true,
        },
      };
    case "analysis_event":
      if (
        state.sessionId &&
        action.analysis.sessionId &&
        action.analysis.sessionId !== state.sessionId
      ) {
        return state;
      }
      return reduceAnalysisEvent(state, action.analysis);
    case "rest_snapshot": {
      if (
        state.sessionId &&
        action.analyses.sessionId &&
        action.analyses.sessionId !== state.sessionId
      ) {
        return state;
      }
      let next = state;
      if (action.analyses.live) {
        next = reduceAnalysisEvent(next, action.analyses.live);
      }
      if (action.analyses.final) {
        next = reduceAnalysisEvent(next, action.analyses.final);
      }
      if (
        action.analyses.treeSnapshot &&
        shouldApplyFinalTreeSnapshot(next, action.analyses.treeSnapshot)
      ) {
        next = { ...next, finalTreeSnapshot: action.analyses.treeSnapshot };
      }
      return next;
    }
  }
}

function reduceAnalysisEvent(
  state: MeetingAnalysisState,
  incoming: MeetingAIAnalysis,
): MeetingAnalysisState {
  if (incoming.analysisType === "final") {
    if (!shouldReplaceAnalysis(state.finalSummary, incoming)) {
      return state;
    }
    return {
      ...state,
      finalSummary: mergePayload(state.finalSummary, incoming),
      analysisRuntimeStatus: {
        ...state.analysisRuntimeStatus,
        finalVersion: incoming.version,
        finalStatus: incoming.status,
      },
    };
  }

  if (!shouldReplaceAnalysis(state.liveAnalysis, incoming)) {
    return state;
  }
  const liveAnalysis = mergeLiveAnalysis(state.liveAnalysis, incoming);
  const explicitTreeReset =
    incoming.status === "completed" &&
    (incoming.payload as LiveAnalysisPayload | null)?.treeReset === true;
  return {
    ...state,
    liveAnalysis,
    ...(explicitTreeReset ? { finalTreeSnapshot: null } : {}),
    analysisRuntimeStatus: {
      ...state.analysisRuntimeStatus,
      liveVersion: liveAnalysis.version,
      liveStatus: liveAnalysis.status,
      websocketClosed: false,
    },
  };
}

export function shouldReplaceAnalysis(
  current: MeetingAIAnalysis | null,
  incoming: MeetingAIAnalysis | null,
) {
  if (!incoming) {
    return false;
  }
  if (!current) {
    return true;
  }
  if (incoming.version !== current.version) {
    return incoming.version > current.version;
  }

  const currentTreeVersion = liveAnalysisTreeVersion(current);
  const incomingTreeVersion = liveAnalysisTreeVersion(incoming);
  if (
    currentTreeVersion !== null &&
    incomingTreeVersion !== null &&
    incomingTreeVersion > currentTreeVersion
  ) {
    return true;
  }

  const currentUpdatedAt = parseAnalysisTime(current.updatedAtUtc);
  const incomingUpdatedAt = parseAnalysisTime(incoming.updatedAtUtc);
  if (currentUpdatedAt !== null && incomingUpdatedAt !== null) {
    return incomingUpdatedAt >= currentUpdatedAt;
  }
  return true;
}

function mergePayload(
  current: MeetingAIAnalysis | null,
  incoming: MeetingAIAnalysis,
): MeetingAIAnalysis {
  return incoming.payload === null && current?.payload
    ? { ...incoming, payload: current.payload }
    : incoming;
}

function mergeLiveAnalysis(
  current: MeetingAIAnalysis | null,
  incoming: MeetingAIAnalysis,
): MeetingAIAnalysis {
  if (!current) {
    return incoming;
  }
  if (incoming.payload === null) {
    return { ...incoming, payload: current.payload };
  }
  const currentPayload = current.payload as LiveAnalysisPayload | null;
  const incomingPayload = incoming.payload as LiveAnalysisPayload;
  const currentComplete = hasCompleteTree(currentPayload?.tree);
  const incomingComplete = hasCompleteTree(incomingPayload.tree);
  const incomingTreeState = liveTreePayloadState(incomingPayload);
  const explicitTreeReset = incoming.status === "completed" && incomingPayload.treeReset === true;
  const treeFreshEnough = isIncomingTreeFreshEnough(current, incoming);
  // 完全なtreeでも、明示的な削除理由(removedNodeIds/mergedNodeIds)無しに
  // 既存ノードが大量に消えるpayloadはlast-known-good treeを保持する。
  // 正当なdedup merge・group flatten・削除はサーバーがremovedNodeIdsで
  // 説明するため通常どおり全置換される。
  const preserveCurrentTree =
    currentComplete &&
    incomingComplete &&
    incomingTreeState === "snapshot" &&
    isUnexplainedTreeCollapse(currentPayload, incomingPayload);
  const applyIncomingTree =
    incomingComplete &&
    incomingTreeState === "snapshot" &&
    treeFreshEnough &&
    (incoming.status === "completed" || !currentComplete) &&
    !preserveCurrentTree;
  const tree = explicitTreeReset
    ? null
    : applyIncomingTree
      ? incomingPayload.tree
      : (currentPayload?.tree ?? incomingPayload.tree);
  const items =
    incoming.status === "completed" && incomingPayload.items.length > 0
      ? incomingPayload.items
      : (currentPayload?.items ?? incomingPayload.items);
  const isFullSnapshotReplacement =
    incoming.status === "completed" &&
    incomingPayload.payloadKind === "full_snapshot" &&
    incomingTreeState === "snapshot";
  const payloadBase = isFullSnapshotReplacement
    ? incomingPayload
    : { ...currentPayload, ...incomingPayload };
  const retainedTreeMetadata =
    !explicitTreeReset && !applyIncomingTree && currentComplete
      ? {
          treeVersion: currentPayload?.treeVersion,
          treeChanges: currentPayload?.treeChanges,
          payloadKind: currentPayload?.payloadKind,
          nodeCount: currentPayload?.nodeCount,
          edgeCount: currentPayload?.edgeCount,
          removedNodeIds: currentPayload?.removedNodeIds,
          mergedNodeIds: currentPayload?.mergedNodeIds,
          treeHash: currentPayload?.treeHash,
          basedOnTreeVersion: currentPayload?.basedOnTreeVersion,
          treePayloadState: currentPayload?.treePayloadState,
          treeReset: currentPayload?.treeReset,
        }
      : {};
  return {
    ...incoming,
    payload: {
      ...payloadBase,
      items,
      tree,
      ...retainedTreeMetadata,
    },
  };
}

function liveTreePayloadState(payload: LiveAnalysisPayload): LiveTreePayloadState {
  if (payload.treePayloadState) {
    return payload.treePayloadState;
  }
  if (hasCompleteTree(payload.tree)) {
    return "snapshot";
  }
  return payload.tree === null ? "null" : "invalid";
}

function liveAnalysisTreeVersion(analysis: MeetingAIAnalysis | null): number | null {
  const payload = analysis?.payload as LiveAnalysisPayload | null;
  return typeof payload?.treeVersion === "number" ? payload.treeVersion : null;
}

function isIncomingTreeFreshEnough(
  current: MeetingAIAnalysis,
  incoming: MeetingAIAnalysis,
): boolean {
  const currentTreeVersion = liveAnalysisTreeVersion(current);
  const incomingTreeVersion = liveAnalysisTreeVersion(incoming);
  if (currentTreeVersion !== null && incomingTreeVersion === null) {
    return false;
  }
  if (
    currentTreeVersion !== null &&
    incomingTreeVersion !== null &&
    incomingTreeVersion < currentTreeVersion
  ) {
    return false;
  }
  return true;
}

// 「大量削除」とみなす下限。少数ノードの正当な統合(重複merge等)を
// 誤って拒否しないよう、件数と比率の両方で判定する。
const UNEXPLAINED_REMOVAL_MIN_COUNT = 3;
const UNEXPLAINED_REMOVAL_MIN_RATIO = 0.3;

// unexplainedNodeRemovals は、incomingへ置き換えたときに「説明なく消える」
// 既存ノードidの一覧を返す。removedNodeIds/mergedNodeIdsに載っている削除は
// 正当として除外する。
export function unexplainedNodeRemovals(
  current: LiveAnalysisPayload | null,
  incoming: LiveAnalysisPayload,
): string[] {
  const currentNodes = current?.tree?.nodes ?? [];
  if (currentNodes.length === 0 || !hasCompleteTree(incoming.tree)) {
    return [];
  }
  const incomingIds = new Set((incoming.tree?.nodes ?? []).map((node) => node.id));
  const explained = new Set([
    ...(incoming.removedNodeIds ?? []),
    ...(incoming.mergedNodeIds ?? []),
  ]);
  return currentNodes
    .map((node) => node.id)
    .filter((id) => !incomingIds.has(id) && !explained.has(id));
}

export function isUnexplainedTreeCollapse(
  current: LiveAnalysisPayload | null,
  incoming: LiveAnalysisPayload,
): boolean {
  const currentCount = current?.tree?.nodes?.length ?? 0;
  if (currentCount === 0) {
    return false;
  }
  const removals = unexplainedNodeRemovals(current, incoming);
  return (
    removals.length >= UNEXPLAINED_REMOVAL_MIN_COUNT &&
    removals.length >= currentCount * UNEXPLAINED_REMOVAL_MIN_RATIO
  );
}

export type LiveTreeApplyDecision =
  | "applied"
  | "explicit_reset"
  | "ignored_stale"
  | "preserved_incomplete"
  | "preserved_invalid"
  | "preserved_older_tree"
  | "preserved_status_only"
  | "no_tree";

// treeApplyDecision はログ・観測用に「このliveイベントのtreeがどう扱われるか」
// を返す。reducer本体と同じ判定条件を使う。
export function treeApplyDecision(
  current: MeetingAIAnalysis | null,
  incoming: MeetingAIAnalysis,
): LiveTreeApplyDecision {
  if (!shouldReplaceAnalysis(current, incoming)) {
    return "ignored_stale";
  }
  const incomingPayload = incoming.payload as LiveAnalysisPayload | null;
  if (!incomingPayload) {
    return "no_tree";
  }
  if (incoming.status === "completed" && incomingPayload.treeReset === true) {
    return "explicit_reset";
  }
  if (
    liveTreePayloadState(incomingPayload) !== "snapshot" ||
    !hasCompleteTree(incomingPayload.tree)
  ) {
    return "preserved_incomplete";
  }
  const currentPayload = (current?.payload ?? null) as LiveAnalysisPayload | null;
  if (hasCompleteTree(currentPayload?.tree) && incoming.status !== "completed") {
    return "preserved_status_only";
  }
  if (current && !isIncomingTreeFreshEnough(current, incoming)) {
    return "preserved_older_tree";
  }
  if (isUnexplainedTreeCollapse(currentPayload, incomingPayload)) {
    return "preserved_invalid";
  }
  return "applied";
}

export function hasCompleteTree(tree: LiveAnalysisPayload["tree"] | undefined): boolean {
  const nodes = tree?.nodes ?? [];
  const edges = tree?.edges ?? [];
  if (!tree || nodes.length === 0) {
    return false;
  }
  const ids = new Set(nodes.map((node) => node.id));
  return (
    ids.size === nodes.length && edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))
  );
}

export function analysisTreeNodeCount(state: MeetingAnalysisState): number {
  return selectedAnalysisTree(state).tree?.nodes?.length ?? 0;
}

export function analysisTreeVersion(state: MeetingAnalysisState): number | null {
  return selectedAnalysisTree(state).treeVersion;
}

export type SelectedAnalysisTree = {
  source: "live" | "final_snapshot" | null;
  tree: LiveAnalysisPayload["tree"];
  treeVersion: number | null;
  selectionReason:
    | "no_valid_tree"
    | "live_only"
    | "final_snapshot_only"
    | "newer_live_tree_version"
    | "newer_final_tree_version"
    | "same_version_newer_live_timestamp"
    | "same_version_newer_final_timestamp";
};

export function selectedAnalysisTree(state: MeetingAnalysisState): SelectedAnalysisTree {
  const livePayload = state.liveAnalysis?.payload as LiveAnalysisPayload | null;
  const live = hasCompleteTree(livePayload?.tree)
    ? {
        source: "live" as const,
        tree: livePayload?.tree ?? null,
        treeVersion: livePayload?.treeVersion ?? null,
        updatedAt: state.liveAnalysis?.updatedAtUtc,
      }
    : null;
  const snapshot = hasCompleteTree(state.finalTreeSnapshot?.tree)
    ? {
        source: "final_snapshot" as const,
        tree: state.finalTreeSnapshot?.tree ?? null,
        treeVersion: state.finalTreeSnapshot?.treeVersion ?? null,
        updatedAt: state.finalTreeSnapshot?.generatedAtUtc,
      }
    : null;

  if (!live && !snapshot) {
    return { source: null, tree: null, treeVersion: null, selectionReason: "no_valid_tree" };
  }
  if (!live) {
    return {
      source: "final_snapshot",
      tree: snapshot?.tree ?? null,
      treeVersion: snapshot?.treeVersion ?? null,
      selectionReason: "final_snapshot_only",
    };
  }
  if (!snapshot) {
    return { ...live, selectionReason: "live_only" };
  }
  const preferSnapshot = isTreeCandidateNewer(snapshot, live);
  const preferred = preferSnapshot ? snapshot : live;
  const differentTreeVersion = snapshot.treeVersion !== live.treeVersion;
  return {
    source: preferred.source,
    tree: preferred.tree,
    treeVersion: preferred.treeVersion,
    selectionReason: differentTreeVersion
      ? preferSnapshot
        ? "newer_final_tree_version"
        : "newer_live_tree_version"
      : preferSnapshot
        ? "same_version_newer_final_timestamp"
        : "same_version_newer_live_timestamp",
  };
}

export function analysisSelectionDebugSnapshot(state: MeetingAnalysisState) {
  const selected = selectedAnalysisTree(state);
  const livePayload = state.liveAnalysis?.payload as LiveAnalysisPayload | null;
  return {
    sessionStatus: state.analysisRuntimeStatus.meetingStatus,
    liveStatus: state.analysisRuntimeStatus.liveStatus,
    liveAnalysisVersion: state.analysisRuntimeStatus.liveVersion,
    liveTreeVersion: livePayload?.treeVersion ?? null,
    liveNodeCount: livePayload?.tree?.nodes?.length ?? 0,
    finalStatus: state.analysisRuntimeStatus.finalStatus,
    finalAnalysisVersion: state.analysisRuntimeStatus.finalVersion,
    finalTreeVersion: state.finalTreeSnapshot?.treeVersion ?? null,
    finalNodeCount: state.finalTreeSnapshot?.tree?.nodes?.length ?? 0,
    selectedAnalysisType: selected.source,
    selectedTreeVersion: selected.treeVersion,
    selectedNodeCount: selected.tree?.nodes?.length ?? 0,
    selectionReason: selected.selectionReason,
  };
}

type TreeCandidate = {
  treeVersion: number | null;
  updatedAt?: string;
};

function isTreeCandidateNewer(candidate: TreeCandidate, current: TreeCandidate): boolean {
  if (candidate.treeVersion !== null && current.treeVersion !== null) {
    if (candidate.treeVersion !== current.treeVersion) {
      return candidate.treeVersion > current.treeVersion;
    }
    const candidateTime = parseAnalysisTime(candidate.updatedAt);
    const currentTime = parseAnalysisTime(current.updatedAt);
    return candidateTime === null || currentTime === null || candidateTime >= currentTime;
  }
  if (candidate.treeVersion !== null) {
    return true;
  }
  if (current.treeVersion !== null) {
    return false;
  }
  const candidateTime = parseAnalysisTime(candidate.updatedAt);
  const currentTime = parseAnalysisTime(current.updatedAt);
  return candidateTime !== null && (currentTime === null || candidateTime >= currentTime);
}

function shouldApplyFinalTreeSnapshot(
  state: MeetingAnalysisState,
  incoming: TreeSnapshotPayload,
): boolean {
  if (!hasCompleteTree(incoming.tree)) {
    return false;
  }
  const current = selectedAnalysisTree(state);
  if (!current.tree) {
    return true;
  }
  return isTreeCandidateNewer(
    { treeVersion: incoming.treeVersion ?? null, updatedAt: incoming.generatedAtUtc },
    {
      treeVersion: current.treeVersion,
      updatedAt:
        current.source === "final_snapshot"
          ? state.finalTreeSnapshot?.generatedAtUtc
          : state.liveAnalysis?.updatedAtUtc,
    },
  );
}

function parseAnalysisTime(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
