import type {
  LiveAnalysisPayload,
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
      return reduceAnalysisEvent(state, action.analysis);
    case "rest_snapshot": {
      let next = state;
      if (action.analyses.live) {
        next = reduceAnalysisEvent(next, action.analyses.live);
      }
      if (action.analyses.final) {
        next = reduceAnalysisEvent(next, action.analyses.final);
      }
      if (hasCompleteTree(action.analyses.treeSnapshot?.tree)) {
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
  return {
    ...state,
    liveAnalysis,
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
  return Boolean(incoming && (!current || incoming.version >= current.version));
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
  const incomingComplete = hasCompleteTree(incomingPayload.tree);
  // 完全なtreeでも、明示的な削除理由(removedNodeIds/mergedNodeIds)無しに
  // 既存ノードが大量に消えるpayloadはlast-known-good treeを保持する。
  // 正当なdedup merge・group flatten・削除はサーバーがremovedNodeIdsで
  // 説明するため通常どおり全置換される。
  const preserveCurrentTree =
    incomingComplete && isUnexplainedTreeCollapse(currentPayload, incomingPayload);
  const applyIncomingTree = incomingComplete && !preserveCurrentTree;
  const tree = applyIncomingTree ? incomingPayload.tree : (currentPayload?.tree ?? incomingPayload.tree);
  const items =
    incomingPayload.items.length > 0
      ? incomingPayload.items
      : (currentPayload?.items ?? incomingPayload.items);
  return {
    ...incoming,
    payload: {
      ...incomingPayload,
      items,
      tree,
      ...(!applyIncomingTree && currentPayload?.treeVersion !== undefined
        ? { treeVersion: currentPayload.treeVersion }
        : {}),
    },
  };
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
  const explained = new Set([...(incoming.removedNodeIds ?? []), ...(incoming.mergedNodeIds ?? [])]);
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
  | "ignored_stale"
  | "preserved_incomplete"
  | "preserved_invalid"
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
  if (!hasCompleteTree(incomingPayload.tree)) {
    return "preserved_incomplete";
  }
  const currentPayload = (current?.payload ?? null) as LiveAnalysisPayload | null;
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
  if (hasCompleteTree(state.finalTreeSnapshot?.tree)) {
    return state.finalTreeSnapshot?.tree?.nodes?.length ?? 0;
  }
  const payload = state.liveAnalysis?.payload as LiveAnalysisPayload | null;
  return payload?.tree?.nodes?.length ?? 0;
}

export function analysisTreeVersion(state: MeetingAnalysisState): number | null {
  if (hasCompleteTree(state.finalTreeSnapshot?.tree)) {
    return state.finalTreeSnapshot?.treeVersion ?? null;
  }
  const payload = state.liveAnalysis?.payload as LiveAnalysisPayload | null;
  return payload?.treeVersion ?? null;
}
