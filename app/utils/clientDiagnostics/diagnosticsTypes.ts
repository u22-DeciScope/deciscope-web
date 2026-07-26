// 会議画面の議論ツリーが表示中に消える事象を、ブラウザの開発者コンソールに
// 依存せず事後追跡するためのクライアント診断イベント定義。
// APIの受理リスト(internal/domain/client_diagnostics.go)と一致させること。

export const DIAGNOSTIC_EVENT_NAMES = [
  "tree_store_initialized",
  "tree_component_mounted",
  "tree_component_unmounted",
  "session_hook_created",
  "session_hook_disposed",
  "rest_fetch_started",
  "rest_snapshot_received",
  "ws_connected",
  "ws_disconnected",
  "ws_reconnecting",
  "ws_snapshot_received",
  "snapshot_adopted",
  "snapshot_rejected",
  "tree_state_changed",
  "tree_became_empty",
  "store_reset_requested",
  "store_reset_executed",
  "route_changed",
  "react_error_captured",
] as const;

export type DiagnosticEventName = (typeof DIAGNOSTIC_EVENT_NAMES)[number];

// 検出した異常。記録後ただちに送信する。
export const CRITICAL_DIAGNOSTIC_EVENTS: ReadonlySet<DiagnosticEventName> = new Set([
  "tree_became_empty",
  "react_error_captured",
]);

// 高頻度抑制の対象外。異常に加え、ライフサイクル系(store生成・component
// mount/unmount・hook生成/破棄)を含める。これらは本来まれな事象であり、
// 短時間に繰り返されること自体が調査対象の兆候なので、間引いてはいけない。
export const NEVER_THROTTLED_DIAGNOSTIC_EVENTS: ReadonlySet<DiagnosticEventName> = new Set([
  ...CRITICAL_DIAGNOSTIC_EVENTS,
  "tree_store_initialized",
  "tree_component_mounted",
  "tree_component_unmounted",
  "session_hook_created",
  "session_hook_disposed",
  "store_reset_requested",
  "store_reset_executed",
]);

// snapshotSource は「そのツリー状態がどこから来たか」。
// 想定値は下記だが、選択ロジック(selectedAnalysisTree)の source をそのまま
// 載せる箇所があるため型としては string を許容する。
export type DiagnosticSnapshotSource =
  | "rest"
  | "websocket"
  | "live"
  | "final_snapshot"
  | ""
  | string;

// 呼び出し側が渡す値。未指定のフィールドはイベント組み立て時に既定値で埋める。
export type DiagnosticEventInput = {
  sessionId?: string | null;
  workspaceId?: string | null;
  route?: string | null;
  treeVersion?: number | null;
  analysisVersion?: number | null;
  updatedAt?: string | null;
  nodeCount?: number | null;
  rootNodeId?: string | null;
  sessionStatus?: string | null;
  snapshotSource?: DiagnosticSnapshotSource | null;
  details?: Record<string, unknown> | null;
};

// APIへ送るイベントの正規形。
export type DiagnosticEvent = {
  timestamp: string;
  event: DiagnosticEventName;
  sessionId: string;
  workspaceId: string;
  tabId: string;
  route: string;
  frontendBuildVersion: string;
  treeVersion: number | null;
  analysisVersion: number | null;
  updatedAt: string;
  nodeCount: number | null;
  rootNodeId: string;
  sessionStatus: string;
  snapshotSource: string;
  sequence: number;
  details?: Record<string, unknown>;
};

export type DiagnosticBatch = {
  workspaceId: string;
  sessionId: string;
  tabId: string;
  frontendBuildVersion: string;
  events: DiagnosticEvent[];
};

// ブラウザ内に保持するイベント数の上限。
export const DIAGNOSTIC_RING_BUFFER_SIZE = 200;
// tree_became_empty に添付する直前イベントの最大件数。
export const DIAGNOSTIC_ANOMALY_CONTEXT_EVENTS = 100;
// 1バッチで送るイベント数。
export const DIAGNOSTIC_MAX_BATCH_EVENTS = 25;
// 未送信のまま保持するイベント数の上限(超過分は古いものから捨てる)。
export const DIAGNOSTIC_MAX_PENDING_EVENTS = 200;
// 通常時のバッチ送信間隔。
export const DIAGNOSTIC_FLUSH_INTERVAL_MS = 4000;
// 同一内容の高頻度イベントを抑制する時間窓。
export const DIAGNOSTIC_THROTTLE_WINDOW_MS = 1000;
// componentStack など長文フィールドの上限文字数。
export const DIAGNOSTIC_MAX_STACK_CHARS = 2000;
