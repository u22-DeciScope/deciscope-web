import { useCallback, useSyncExternalStore } from "react";

import {
  initialMeetingAnalysisState,
  meetingAnalysisReducer,
  type MeetingAnalysisAction,
  type MeetingAnalysisState,
} from "~/hooks/meetingAnalysisState";
import {
  observeAnalysisTree,
  recordAnalysisStoreTransition,
} from "~/hooks/meetingAnalysisDiagnostics";
import { recordDiagnosticEvent } from "~/utils/clientDiagnostics/clientDiagnostics";

type MeetingAnalysisSessionStore = {
  getSnapshot: () => MeetingAnalysisState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: MeetingAnalysisAction) => MeetingAnalysisState;
};

// Route/child componentの再マウントより長く、document reloadより短いsession単位の
// state所有層。full reload時はREST hydrateが復元し、通常のremountや一時的なREST
// 失敗ではここにあるlast-known-good treeを即座に再利用する。
const sessionStores = new Map<string, MeetingAnalysisSessionStore>();
const maxCachedSessions = 4;

export function useMeetingAnalysisSessionStore(sessionId: string, workspaceId = "") {
  const store = getMeetingAnalysisSessionStore(sessionId, workspaceId);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const dispatch = useCallback((action: MeetingAnalysisAction) => store.dispatch(action), [store]);
  return { state, dispatch };
}

export function getMeetingAnalysisSessionStore(
  sessionId: string,
  workspaceId = "",
): MeetingAnalysisSessionStore {
  const normalizedSessionId = sessionId.trim();
  const storeKey = `${workspaceId.trim()}\u0000${normalizedSessionId}`;
  const existing = sessionStores.get(storeKey);
  if (existing) {
    // insertion orderをLRUとして使う。
    sessionStores.delete(storeKey);
    sessionStores.set(storeKey, existing);
    return existing;
  }

  const normalizedWorkspaceId = workspaceId.trim();
  let state = initialMeetingAnalysisState(normalizedSessionId);
  const listeners = new Set<() => void>();
  const store: MeetingAnalysisSessionStore = {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (action) => {
      const previous = state;
      // reset要求は状態が変わらなかった場合も記録する。「resetが要求された」
      // 事実自体が、ツリー消失の原因切り分けに必要なため。
      if (action.type === "explicit_reset" || action.type === "session_changed") {
        const observed = observeAnalysisTree(previous);
        recordDiagnosticEvent("store_reset_requested", {
          sessionId: normalizedSessionId,
          workspaceId: normalizedWorkspaceId,
          treeVersion: observed.treeVersion,
          analysisVersion: observed.analysisVersion,
          nodeCount: observed.nodeCount,
          rootNodeId: observed.rootNodeId,
          sessionStatus: observed.sessionStatus,
          snapshotSource: observed.snapshotSource,
          details: {
            cause: action.type,
            ...(action.type === "session_changed" ? { nextSessionId: action.sessionId } : {}),
          },
        });
      }
      const next = meetingAnalysisReducer(state, action);
      const changed = next !== state;
      if (changed) {
        state = next;
      }
      // 状態が変わらなかったdispatchも記録する。「古いsnapshotが拒否されて
      // 何も起きなかった」ことこそ、ツリー消失の切り分けに必要な情報のため。
      recordAnalysisStoreTransition({
        sessionId: normalizedSessionId,
        workspaceId: normalizedWorkspaceId,
        action,
        before: previous,
        after: next,
        stateChanged: changed,
      });
      if (!changed) {
        return state;
      }
      listeners.forEach((listener) => listener());
      return state;
    },
  };
  sessionStores.set(storeKey, store);
  recordDiagnosticEvent("tree_store_initialized", {
    sessionId: normalizedSessionId,
    workspaceId: normalizedWorkspaceId,
    nodeCount: 0,
    details: { cachedSessionStores: sessionStores.size },
  });
  trimSessionStores(storeKey);
  return store;
}

function trimSessionStores(activeSessionId: string) {
  while (sessionStores.size > maxCachedSessions) {
    const oldest = sessionStores.keys().next().value as string | undefined;
    if (oldest === undefined) {
      return;
    }
    if (oldest === activeSessionId && sessionStores.size > 1) {
      const active = sessionStores.get(oldest);
      sessionStores.delete(oldest);
      if (active) {
        sessionStores.set(oldest, active);
      }
      continue;
    }
    sessionStores.delete(oldest);
  }
}

export function resetMeetingAnalysisSessionStoresForTest() {
  sessionStores.clear();
}
