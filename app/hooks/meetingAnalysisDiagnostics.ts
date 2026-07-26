import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import {
  hasCompleteTree,
  selectedAnalysisTree,
  shouldReplaceAnalysis,
  treeApplyDecision,
  type MeetingAnalysisAction,
  type MeetingAnalysisState,
} from "~/hooks/meetingAnalysisState";
import {
  compactDiagnosticEvents,
  recentDiagnosticEvents,
  recordDiagnosticEvent,
} from "~/utils/clientDiagnostics/clientDiagnostics";
import { DIAGNOSTIC_ANOMALY_CONTEXT_EVENTS } from "~/utils/clientDiagnostics/diagnosticsTypes";
import {
  classifyTreeEmptiness,
  currentIntentionalTreeTeardown,
  type TreeObservation,
  type TreeTransitionCause,
} from "~/utils/clientDiagnostics/treeEmptiness";

// session store の状態遷移を診断イベントへ変換する層。
// storeのdispatchは REST/WebSocket/明示reset のすべてが通る唯一の合流点なので、
// ここに置くことで「どのsnapshotが採用/拒否されたか」と
// 「ツリーがいつ空になったか」を漏れなく観測できる。

export type StoreTransitionContext = {
  sessionId: string;
  workspaceId: string;
  action: MeetingAnalysisAction;
  before: MeetingAnalysisState;
  after: MeetingAnalysisState;
  // reducerが状態を変えたかどうか。拒否されたsnapshotでは false になる。
  stateChanged?: boolean;
};

/** observeAnalysisTree は診断イベントに載せるツリー状態のスナップショット。 */
export function observeAnalysisTree(state: MeetingAnalysisState): TreeObservation {
  const selected = selectedAnalysisTree(state);
  const nodes = selected.tree?.nodes ?? [];
  return {
    nodeCount: nodes.length,
    treeVersion: selected.treeVersion,
    analysisVersion: state.analysisRuntimeStatus.liveVersion,
    rootNodeId: rootNodeId(nodes),
    sessionStatus: state.analysisRuntimeStatus.meetingStatus ?? "",
    snapshotSource: selected.source ?? "",
  };
}

/**
 * analysisDiagnosticsFields は現在のツリー状態から診断イベントの共通項目を作る。
 * hook側(WS/REST/ライフサイクル)から使う。
 */
export function analysisDiagnosticsFields(
  state: MeetingAnalysisState,
  sessionId: string,
  workspaceId: string,
) {
  const observed = observeAnalysisTree(state);
  return {
    sessionId,
    workspaceId,
    treeVersion: observed.treeVersion,
    analysisVersion: observed.analysisVersion,
    nodeCount: observed.nodeCount,
    rootNodeId: observed.rootNodeId,
    sessionStatus: observed.sessionStatus,
    snapshotSource: observed.snapshotSource,
    updatedAt: state.liveAnalysis?.updatedAtUtc ?? "",
  };
}

// rootNodeId は表示ツリーの起点。親を持たない最初のノード、無ければ先頭ノード。
function rootNodeId(nodes: TreeNodePayload[]): string {
  if (nodes.length === 0) {
    return "";
  }
  const ids = new Set(nodes.map((node) => node.id));
  const root = nodes.find((node) => !node.parentId || !ids.has(node.parentId));
  return root?.id ?? nodes[0].id;
}

function transitionCause(action: MeetingAnalysisAction): TreeTransitionCause {
  return action.type;
}

type AnalysisFacts = {
  analysisVersion: number | null;
  treeVersion: number | null;
  updatedAt: string;
  nodeCount: number | null;
  status: string;
  payloadPresent: boolean;
  updateKind: string;
};

function describeAnalysis(analysis: MeetingAIAnalysis | null | undefined): AnalysisFacts {
  const payload = (analysis?.payload ?? null) as LiveAnalysisPayload | null;
  return {
    analysisVersion: analysis?.version ?? null,
    treeVersion: typeof payload?.treeVersion === "number" ? payload.treeVersion : null,
    updatedAt: analysis?.updatedAtUtc ?? "",
    nodeCount: payload?.tree?.nodes?.length ?? null,
    status: analysis?.status ?? "",
    payloadPresent: payload !== null,
    updateKind: updateKindOf(analysis, payload),
  };
}

// updateKind は「status-only更新か full snapshot か」の区別。
function updateKindOf(
  analysis: MeetingAIAnalysis | null | undefined,
  payload: LiveAnalysisPayload | null,
): string {
  if (!analysis) {
    return "absent";
  }
  if (!payload) {
    return "status_only";
  }
  const treeState =
    payload.treePayloadState ?? (hasCompleteTree(payload.tree) ? "snapshot" : "null");
  if (treeState !== "snapshot") {
    return "status_only";
  }
  if (payload.payloadKind === "full_snapshot") {
    return "full_snapshot";
  }
  return "tree_snapshot";
}

function currentFacts(state: MeetingAnalysisState): AnalysisFacts {
  const selected = selectedAnalysisTree(state);
  return {
    analysisVersion: state.analysisRuntimeStatus.liveVersion,
    treeVersion: selected.treeVersion,
    updatedAt: state.liveAnalysis?.updatedAtUtc ?? "",
    nodeCount: selected.tree?.nodes?.length ?? null,
    status: state.analysisRuntimeStatus.liveStatus ?? "",
    payloadPresent: state.liveAnalysis?.payload != null,
    updateKind: "current",
  };
}

type SnapshotVerdict = {
  adopted: boolean;
  reason: string;
  transport: "rest" | "websocket";
  incoming: AnalysisFacts;
};

// evaluateSnapshot は「今回受け取ったsnapshotが採用されたか」と、その理由を返す。
// 判定条件は reducer 本体と同じ treeApplyDecision / shouldReplaceAnalysis を使う。
function evaluateSnapshot(context: StoreTransitionContext): SnapshotVerdict | null {
  const { action, before } = context;
  if (action.type === "analysis_event") {
    const transport = "websocket" as const;
    if (action.analysis.analysisType === "final") {
      const replaced = shouldReplaceAnalysis(before.finalSummary, action.analysis);
      return {
        adopted: replaced,
        reason: replaced ? "final_analysis_replaced" : "final_analysis_stale",
        transport,
        incoming: describeAnalysis(action.analysis),
      };
    }
    const decision = treeApplyDecision(before.liveAnalysis, action.analysis);
    return {
      adopted: decision === "applied" || decision === "explicit_reset",
      reason: decision,
      transport,
      incoming: describeAnalysis(action.analysis),
    };
  }
  if (action.type === "rest_snapshot") {
    const live = action.analyses.live ?? null;
    const decision = live ? treeApplyDecision(before.liveAnalysis, live) : "no_tree";
    return {
      adopted: decision === "applied" || decision === "explicit_reset",
      reason: decision,
      transport: "rest",
      incoming: describeAnalysis(live),
    };
  }
  return null;
}

/**
 * recordAnalysisStoreTransition は1回のdispatchについて必要な診断イベントを出す。
 * 例外を投げない(recordDiagnosticEvent 自体が安全)。
 */
export function recordAnalysisStoreTransition(context: StoreTransitionContext) {
  const { sessionId, workspaceId, action, before, after } = context;
  const previous = observeAnalysisTree(before);
  const next = observeAnalysisTree(after);
  const base = {
    sessionId,
    workspaceId,
    treeVersion: next.treeVersion,
    analysisVersion: next.analysisVersion,
    nodeCount: next.nodeCount,
    rootNodeId: next.rootNodeId,
    sessionStatus: next.sessionStatus,
    snapshotSource: next.snapshotSource,
    updatedAt: after.liveAnalysis?.updatedAtUtc ?? "",
  } as const;

  if (action.type === "explicit_reset" || action.type === "session_changed") {
    recordDiagnosticEvent("store_reset_executed", {
      ...base,
      details: {
        cause: action.type,
        stateChanged: context.stateChanged ?? true,
        previousNodeCount: previous.nodeCount,
        previousTreeVersion: previous.treeVersion,
        previousRootNodeId: previous.rootNodeId,
        ...(action.type === "session_changed" ? { nextSessionId: action.sessionId } : {}),
      },
    });
  }

  const verdict = evaluateSnapshot(context);
  if (verdict) {
    const current = currentFacts(before);
    recordDiagnosticEvent(verdict.adopted ? "snapshot_adopted" : "snapshot_rejected", {
      ...base,
      snapshotSource: verdict.transport,
      details: {
        transport: verdict.transport,
        reason: verdict.reason,
        payloadPresent: verdict.incoming.payloadPresent,
        updateKind: verdict.incoming.updateKind,
        incomingStatus: verdict.incoming.status,
        currentAnalysisVersion: current.analysisVersion,
        incomingAnalysisVersion: verdict.incoming.analysisVersion,
        currentTreeVersion: current.treeVersion,
        incomingTreeVersion: verdict.incoming.treeVersion,
        currentUpdatedAt: current.updatedAt,
        incomingUpdatedAt: verdict.incoming.updatedAt,
        currentNodeCount: current.nodeCount,
        incomingNodeCount: verdict.incoming.nodeCount,
        resultingNodeCount: next.nodeCount,
        resultingTreeVersion: next.treeVersion,
        stateChanged: context.stateChanged ?? true,
      },
    });
  }

  const treeChanged =
    previous.nodeCount !== next.nodeCount ||
    previous.treeVersion !== next.treeVersion ||
    previous.rootNodeId !== next.rootNodeId;
  if (treeChanged) {
    recordDiagnosticEvent("tree_state_changed", {
      ...base,
      details: {
        cause: action.type,
        previousNodeCount: previous.nodeCount,
        previousTreeVersion: previous.treeVersion,
        previousRootNodeId: previous.rootNodeId,
        previousSnapshotSource: previous.snapshotSource,
      },
    });
  }

  const verdictEmptiness = classifyTreeEmptiness({
    previous,
    next,
    cause: transitionCause(action),
    explicitTreeReset: isExplicitTreeReset(action),
    intentionalTeardown: currentIntentionalTreeTeardown(),
  });
  if (!verdictEmptiness.anomaly) {
    return;
  }
  recordDiagnosticEvent("tree_became_empty", {
    ...base,
    details: {
      cause: action.type,
      previousNodeCount: previous.nodeCount,
      previousTreeVersion: previous.treeVersion,
      previousAnalysisVersion: previous.analysisVersion,
      previousRootNodeId: previous.rootNodeId,
      previousSnapshotSource: previous.snapshotSource,
      previousSessionStatus: previous.sessionStatus,
      nextTreeVersion: next.treeVersion,
      nextAnalysisVersion: next.analysisVersion,
      lastSnapshot: verdict
        ? {
            transport: verdict.transport,
            reason: verdict.reason,
            adopted: verdict.adopted,
            updateKind: verdict.incoming.updateKind,
            incomingTreeVersion: verdict.incoming.treeVersion,
            incomingAnalysisVersion: verdict.incoming.analysisVersion,
          }
        : null,
      recentEvents: compactDiagnosticEvents(
        recentDiagnosticEvents(DIAGNOSTIC_ANOMALY_CONTEXT_EVENTS),
      ),
    },
  });
}

function isExplicitTreeReset(action: MeetingAnalysisAction) {
  if (action.type !== "analysis_event" || action.analysis.analysisType === "final") {
    return false;
  }
  const payload = action.analysis.payload as LiveAnalysisPayload | null;
  return action.analysis.status === "completed" && payload?.treeReset === true;
}
