// 議論ツリー消失(previousNodeCount > 0 && currentNodeCount === 0)の判定。
// 正当な空化(明示reset・別セッションへの移動・ログアウト・セッション削除・
// サーバーからの明示的なtreeReset)と、原因不明の消失を区別する。
//
// reducerや送信経路から独立した純粋関数にしてあるため、UIを起動せずに
// 判定条件だけをテストできる。

export type TreeObservation = {
  nodeCount: number;
  treeVersion: number | null;
  analysisVersion: number | null;
  rootNodeId: string;
  sessionStatus: string;
  snapshotSource: string;
};

// ツリー状態を変化させた原因。session storeのaction種別に対応する。
export type TreeTransitionCause =
  | "analysis_event"
  | "rest_snapshot"
  | "explicit_reset"
  | "session_changed"
  | "meeting_status"
  | "websocket_closed";

// 進行中の意図的な破棄。ログアウト・セッション削除など、UI側が
// 「今からツリーが消えるのは正常」と宣言する用途。
export type IntentionalTeardownReason = "logout" | "session_deleted" | "session_navigation";

export type TreeEmptinessReason =
  | "tree_not_empty"
  | "no_previous_tree"
  | "explicit_reset"
  | "session_changed"
  | "explicit_tree_reset"
  | "session_not_started"
  | IntentionalTeardownReason;

export type TreeEmptinessVerdict =
  | { anomaly: false; reason: TreeEmptinessReason }
  | { anomaly: true; reason: "unexpected_tree_clear" };

export type TreeEmptinessInput = {
  previous: TreeObservation;
  next: TreeObservation;
  cause: TreeTransitionCause;
  // サーバーが completed payload で明示的に要求したツリーリセットかどうか。
  explicitTreeReset?: boolean;
  // 意図的な破棄が進行中であればその理由。
  intentionalTeardown?: IntentionalTeardownReason | null;
};

// 会議作成直後で、まだツリーが一度も存在していない段階のセッション状態。
const NOT_STARTED_SESSION_STATUSES = new Set(["", "created", "preparing", "joining", "pending"]);

export function classifyTreeEmptiness(input: TreeEmptinessInput): TreeEmptinessVerdict {
  const { previous, next, cause } = input;
  if (!(previous.nodeCount > 0 && next.nodeCount === 0)) {
    return { anomaly: false, reason: "tree_not_empty" };
  }
  if (previous.nodeCount <= 0) {
    return { anomaly: false, reason: "no_previous_tree" };
  }
  if (input.intentionalTeardown) {
    return { anomaly: false, reason: input.intentionalTeardown };
  }
  if (cause === "explicit_reset") {
    return { anomaly: false, reason: "explicit_reset" };
  }
  if (cause === "session_changed") {
    return { anomaly: false, reason: "session_changed" };
  }
  if (input.explicitTreeReset) {
    return { anomaly: false, reason: "explicit_tree_reset" };
  }
  // 会議が始まっておらずツリーが存在し得ない段階での0件は異常としない。
  if (previous.nodeCount === 0 && NOT_STARTED_SESSION_STATUSES.has(next.sessionStatus)) {
    return { anomaly: false, reason: "session_not_started" };
  }
  return { anomaly: true, reason: "unexpected_tree_clear" };
}

let intentionalTeardown: { reason: IntentionalTeardownReason; expiresAtMs: number } | null = null;

// 意図的な破棄の宣言は短時間で失効させる。解除漏れで本物の異常を
// 見逃さないようにするため。
const INTENTIONAL_TEARDOWN_TTL_MS = 5000;

/**
 * markIntentionalTreeTeardown は、これから起きるツリーの空化が正当である
 * ことを宣言する(ログアウト・セッション削除など)。
 */
export function markIntentionalTreeTeardown(reason: IntentionalTeardownReason, nowMs = Date.now()) {
  intentionalTeardown = { reason, expiresAtMs: nowMs + INTENTIONAL_TEARDOWN_TTL_MS };
}

/** currentIntentionalTreeTeardown は有効な宣言があればその理由を返す。 */
export function currentIntentionalTreeTeardown(
  nowMs = Date.now(),
): IntentionalTeardownReason | null {
  if (!intentionalTeardown) {
    return null;
  }
  if (nowMs >= intentionalTeardown.expiresAtMs) {
    intentionalTeardown = null;
    return null;
  }
  return intentionalTeardown.reason;
}

export function clearIntentionalTreeTeardown() {
  intentionalTeardown = null;
}
