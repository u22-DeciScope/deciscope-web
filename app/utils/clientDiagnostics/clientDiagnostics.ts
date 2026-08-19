import {
  dropDiagnosticRecords,
  loadPersistedDiagnosticRecords,
  markDiagnosticRecordsSent,
  persistDiagnosticRecord,
  type StoredDiagnosticRecord,
} from "~/utils/clientDiagnostics/diagnosticsStorage";
import {
  httpDiagnosticsTransport,
  type DiagnosticsTransport,
} from "~/utils/clientDiagnostics/diagnosticsTransport";
import {
  CRITICAL_DIAGNOSTIC_EVENTS,
  DIAGNOSTIC_ANOMALY_CONTEXT_EVENTS,
  DIAGNOSTIC_FLUSH_INTERVAL_MS,
  DIAGNOSTIC_MAX_BATCH_EVENTS,
  DIAGNOSTIC_MAX_PENDING_EVENTS,
  DIAGNOSTIC_MAX_STACK_CHARS,
  DIAGNOSTIC_RING_BUFFER_SIZE,
  DIAGNOSTIC_THROTTLE_WINDOW_MS,
  NEVER_THROTTLED_DIAGNOSTIC_EVENTS,
  type DiagnosticBatch,
  type DiagnosticEvent,
  type DiagnosticEventInput,
  type DiagnosticEventName,
} from "~/utils/clientDiagnostics/diagnosticsTypes";

// 診断ログのブラウザ側本体。
//
// 設計上の必須条件: この module から会議画面・議論ツリーへ例外を伝播させない。
// 記録・永続化・送信のすべてを try/catch で包み、失敗は内部カウンタに
// 積むだけにする(ユーザー向けエラー表示も行わない)。

const TAB_ID_STORAGE_KEY = "deciscope-diagnostics-tab-id";

type RingEntry = StoredDiagnosticRecord;

const ringBuffer: RingEntry[] = [];
const pending: DiagnosticEvent[] = [];
const throttleSeenAt = new Map<string, number>();

let sequenceCounter = 0;
// このページ読み込み固有のID。IndexedDBのキー前置に使い、リロード後の
// 連番リセットで前回分のレコードを上書きしないようにする。
let loadId = generateId("load");
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;
let listenersInstalled = false;
let hydrated = false;
let transport: DiagnosticsTransport = httpDiagnosticsTransport;
let networkEnabled = defaultNetworkEnabled();
let cachedTabId = "";

const failures = { send: 0, record: 0, droppedPending: 0 };

function defaultNetworkEnabled() {
  // テスト実行時は既定で送信しない。送信そのものを検証したいテストは
  // configureClientDiagnosticsForTest({ transport }) で明示的に有効化する。
  if (import.meta.env.MODE === "test") {
    return false;
  }
  return String(import.meta.env.VITE_DECISCOPE_CLIENT_DIAGNOSTICS ?? "").toLowerCase() !== "false";
}

export function frontendBuildVersion() {
  const configured =
    import.meta.env.VITE_FRONTEND_BUILD_VERSION ?? import.meta.env.VITE_COMMIT_SHA ?? "";
  const trimmed = String(configured).trim();
  return trimmed || (import.meta.env.DEV ? "dev" : "unknown");
}

export function frontendBuildFingerprint() {
  return {
    repositoryName: "deciscope-web",
    frontendBuildVersion: frontendBuildVersion(),
    gitCommitSha: String(import.meta.env.VITE_COMMIT_SHA ?? "").trim() || "unknown",
    buildTimestamp: String(import.meta.env.VITE_BUILD_TIMESTAMP ?? "").trim() || "unknown",
    dirtyBuild: String(import.meta.env.VITE_DIRTY_BUILD ?? "").trim() || "unknown",
    runtimeEnvironment: import.meta.env.MODE || "unknown",
  } as const;
}

let buildFingerprintLogged = false;

export function logFrontendBuildFingerprint() {
  if (buildFingerprintLogged || import.meta.env.MODE === "test") {
    return;
  }
  buildFingerprintLogged = true;
  console.info("DeciScope frontend build fingerprint", frontendBuildFingerprint());
}

// diagnosticsTabId はブラウザタブ単位のID。sessionStorage はタブ単位かつ
// リロードをまたいで保持されるため、同一タブ内で一貫したIDになる。
export function diagnosticsTabId() {
  if (cachedTabId) {
    return cachedTabId;
  }
  cachedTabId = generateId("tab");
  try {
    if (typeof sessionStorage !== "undefined") {
      const stored = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
      if (stored) {
        cachedTabId = stored;
      } else {
        sessionStorage.setItem(TAB_ID_STORAGE_KEY, cachedTabId);
      }
    }
  } catch {
    // sessionStorage が使えない環境ではメモリ上のIDをそのまま使う。
  }
  return cachedTabId;
}

function generateId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

function currentRoute() {
  try {
    if (typeof window !== "undefined" && window.location) {
      return `${window.location.pathname}${window.location.search}`;
    }
  } catch {
    // location が読めない環境では空にする。
  }
  return "";
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function throttleSignature(event: DiagnosticEvent) {
  const renderPhase =
    event.event.startsWith("tree_render_") && event.details
      ? `${String(event.details.phase ?? "")}:${String(event.details.reason ?? "")}`
      : "";
  const lifecycleIdentity = event.details
    ? [
        event.details.layoutRevision,
        event.details.pendingGeneration ?? event.details.generation,
        event.details.manualResetRequestId,
        event.details.diagnosticSignature,
      ]
        .map((value) => String(value ?? ""))
        .join(":")
    : "";
  return [
    event.event,
    event.sessionId,
    event.route,
    event.sessionStatus,
    event.snapshotSource,
    event.rootNodeId,
    event.treeVersion ?? "-",
    event.analysisVersion ?? "-",
    event.nodeCount ?? "-",
    renderPhase,
    lifecycleIdentity,
  ].join("\0");
}

function shouldThrottle(event: DiagnosticEvent, nowMs: number) {
  if (NEVER_THROTTLED_DIAGNOSTIC_EVENTS.has(event.event)) {
    return false;
  }
  const signature = throttleSignature(event);
  const seenAt = throttleSeenAt.get(signature);
  if (seenAt !== undefined && nowMs - seenAt < DIAGNOSTIC_THROTTLE_WINDOW_MS) {
    return true;
  }
  throttleSeenAt.set(signature, nowMs);
  if (throttleSeenAt.size > 256) {
    for (const [key, value] of throttleSeenAt) {
      if (nowMs - value >= DIAGNOSTIC_THROTTLE_WINDOW_MS) {
        throttleSeenAt.delete(key);
      }
    }
  }
  return false;
}

function buildEvent(name: DiagnosticEventName, input: DiagnosticEventInput): DiagnosticEvent {
  sequenceCounter += 1;
  const event: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    event: name,
    sessionId: (input.sessionId ?? "").trim(),
    workspaceId: (input.workspaceId ?? "").trim(),
    tabId: diagnosticsTabId(),
    route: (input.route ?? currentRoute()).trim(),
    frontendBuildVersion: frontendBuildVersion(),
    treeVersion: normalizeNumber(input.treeVersion),
    analysisVersion: normalizeNumber(input.analysisVersion),
    updatedAt: (input.updatedAt ?? "").trim(),
    nodeCount: normalizeNumber(input.nodeCount),
    rootNodeId: (input.rootNodeId ?? "").trim(),
    sessionStatus: (input.sessionStatus ?? "").trim(),
    snapshotSource: (input.snapshotSource ?? "").trim(),
    sequence: sequenceCounter,
  };
  if (input.details && Object.keys(input.details).length > 0) {
    event.details = input.details;
  }
  return event;
}

function recordKeyOf(sequence: number) {
  return `${loadId}:${String(sequence).padStart(6, "0")}`;
}

function pushToRingBuffer(event: DiagnosticEvent) {
  const record: RingEntry = {
    recordKey: recordKeyOf(event.sequence),
    sequence: event.sequence,
    sent: false,
    event,
  };
  ringBuffer.push(record);
  persistDiagnosticRecord(record);
  const dropped: string[] = [];
  while (ringBuffer.length > DIAGNOSTIC_RING_BUFFER_SIZE) {
    const removed = ringBuffer.shift();
    if (removed) {
      dropped.push(removed.recordKey);
    }
  }
  dropDiagnosticRecords(dropped);
}

function enqueue(event: DiagnosticEvent) {
  pending.push(event);
  while (pending.length > DIAGNOSTIC_MAX_PENDING_EVENTS) {
    pending.shift();
    failures.droppedPending += 1;
  }
}

/**
 * recordDiagnosticEvent は1件の診断イベントを記録する。
 * 例外を投げないことを保証する(呼び出し側でのtry/catchは不要)。
 */
export function recordDiagnosticEvent(
  name: DiagnosticEventName,
  input: DiagnosticEventInput = {},
): DiagnosticEvent | null {
  try {
    const event = buildEvent(name, input);
    if (shouldThrottle(event, Date.now())) {
      return null;
    }
    pushToRingBuffer(event);
    enqueue(event);
    installLifecycleListeners();
    if (CRITICAL_DIAGNOSTIC_EVENTS.has(name) || pending.length >= DIAGNOSTIC_MAX_BATCH_EVENTS) {
      void flushDiagnostics();
    } else {
      scheduleFlush();
    }
    return event;
  } catch {
    failures.record += 1;
    return null;
  }
}

/**
 * recentDiagnosticEvents は直前の診断イベントを新しい順序を保って返す。
 * tree_became_empty へ添付する直前100件の取得に使う。
 */
export function recentDiagnosticEvents(limit = DIAGNOSTIC_ANOMALY_CONTEXT_EVENTS) {
  return ringBuffer.slice(-limit).map((record) => record.event);
}

/**
 * compactDiagnosticEvents は添付用の縮小表現。通常時にツリー全体のJSONを
 * 持ち回らないための最小フィールドのみ。
 */
export function compactDiagnosticEvents(events: DiagnosticEvent[]) {
  return events.map((event) => ({
    t: event.timestamp,
    e: event.event,
    seq: event.sequence,
    n: event.nodeCount,
    tv: event.treeVersion,
    av: event.analysisVersion,
    s: event.snapshotSource,
    st: event.sessionStatus,
  }));
}

/** truncateStack はスタックトレースを上限文字数へ切り詰める。 */
export function truncateStack(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return value.length > DIAGNOSTIC_MAX_STACK_CHARS
    ? `${value.slice(0, DIAGNOSTIC_MAX_STACK_CHARS)}…[truncated]`
    : value;
}

function scheduleFlush() {
  if (flushTimer !== null || pending.length === 0) {
    return;
  }
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushDiagnostics();
    }, DIAGNOSTIC_FLUSH_INTERVAL_MS);
  } catch {
    flushTimer = null;
  }
}

function groupPendingBatches(events: DiagnosticEvent[]) {
  const groups = new Map<string, DiagnosticEvent[]>();
  for (const event of events) {
    if (!event.sessionId || !event.workspaceId) {
      // sessionId/workspaceId が確定していないイベントはAPIの認可対象を
      // 決められないため送らない。ブラウザ内バッファには残る。
      continue;
    }
    const key = `${event.workspaceId}\0${event.sessionId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
      continue;
    }
    groups.set(key, [event]);
  }
  return [...groups.values()].map<DiagnosticBatch>((batchEvents) => ({
    workspaceId: batchEvents[0].workspaceId,
    sessionId: batchEvents[0].sessionId,
    tabId: batchEvents[0].tabId,
    frontendBuildVersion: batchEvents[0].frontendBuildVersion,
    events: batchEvents.slice(0, DIAGNOSTIC_MAX_BATCH_EVENTS),
  }));
}

/**
 * flushDiagnostics は未送信イベントをバッチ送信する。
 * 送信に失敗したイベントはブラウザ内バッファへ差し戻し、握りつぶさない。
 */
export async function flushDiagnostics(): Promise<void> {
  if (flushInFlight || pending.length === 0) {
    return;
  }
  if (!networkEnabled) {
    return;
  }
  flushInFlight = true;
  const drained = pending.splice(0, pending.length);
  const highestDrainedSequence = drained.reduce(
    (highest, event) => Math.max(highest, event.sequence),
    0,
  );
  try {
    const batches = groupPendingBatches(drained);
    const sentSequences: number[] = [];
    const failed: DiagnosticEvent[] = [];
    for (const batch of batches) {
      let delivered = false;
      try {
        delivered = await transport.send(batch);
      } catch {
        delivered = false;
      }
      if (delivered) {
        sentSequences.push(...batch.events.map((event) => event.sequence));
        continue;
      }
      failures.send += 1;
      failed.push(...batch.events);
    }
    markSent(sentSequences);
    if (failed.length > 0) {
      // 失敗分は先頭へ戻して次回再送する。
      pending.unshift(...failed);
      while (pending.length > DIAGNOSTIC_MAX_PENDING_EVENTS) {
        pending.shift();
        failures.droppedPending += 1;
      }
    }
  } catch {
    failures.send += 1;
  } finally {
    flushInFlight = false;
    if (pending.length > 0) {
      // A critical event can arrive while another batch is awaiting its
      // transport. Send only those newly-arrived events immediately. Failed
      // events from this batch have an older sequence and stay on the bounded
      // retry timer, preventing a tight retry loop during an outage.
      const criticalEventArrivedDuringFlush = pending.some(
        (event) =>
          event.sequence > highestDrainedSequence && CRITICAL_DIAGNOSTIC_EVENTS.has(event.event),
      );
      if (criticalEventArrivedDuringFlush) {
        queueMicrotask(() => {
          void flushDiagnostics();
        });
      } else {
        scheduleFlush();
      }
    }
  }
}

function markSent(sequences: number[]) {
  if (sequences.length === 0) {
    return;
  }
  const sentSet = new Set(sequences);
  const recordKeys: string[] = [];
  for (const record of ringBuffer) {
    if (sentSet.has(record.sequence)) {
      record.sent = true;
      recordKeys.push(record.recordKey);
    }
  }
  markDiagnosticRecordsSent(recordKeys);
}

/**
 * flushDiagnosticsWithBeacon は pagehide / visibilitychange(hidden) /
 * beforeunload / 想定外のunmount で未送信イベントの退避を試みる。
 */
export function flushDiagnosticsWithBeacon(reason: string): void {
  try {
    if (!networkEnabled || pending.length === 0) {
      return;
    }
    const drained = pending.splice(0, pending.length);
    const batches = groupPendingBatches(drained);
    const failed: DiagnosticEvent[] = [];
    const sentSequences: number[] = [];
    for (const batch of batches) {
      const delivered = transport.sendSync({
        ...batch,
        events: batch.events.map((event) =>
          event.details
            ? { ...event, details: { ...event.details, beaconReason: reason } }
            : { ...event, details: { beaconReason: reason } },
        ),
      });
      if (delivered) {
        sentSequences.push(...batch.events.map((event) => event.sequence));
        continue;
      }
      failures.send += 1;
      failed.push(...batch.events);
    }
    markSent(sentSequences);
    if (failed.length > 0) {
      pending.unshift(...failed);
    }
  } catch {
    failures.send += 1;
  }
}

function installLifecycleListeners() {
  if (listenersInstalled || typeof window === "undefined") {
    return;
  }
  listenersInstalled = true;
  try {
    window.addEventListener("pagehide", () => flushDiagnosticsWithBeacon("pagehide"));
    window.addEventListener("beforeunload", () => flushDiagnosticsWithBeacon("beforeunload"));
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          flushDiagnosticsWithBeacon("visibility_hidden");
        }
      });
    }
  } catch {
    // リスナー登録に失敗しても通常のバッチ送信は動く。
  }
}

/**
 * hydrateDiagnosticsFromStorage は前回の未送信イベントを読み戻して再送を試みる。
 * リロードやクラッシュをまたいで診断ログを失わないための復旧経路。
 */
export async function hydrateDiagnosticsFromStorage(): Promise<void> {
  if (hydrated) {
    return;
  }
  hydrated = true;
  try {
    const records = await loadPersistedDiagnosticRecords();
    if (records.length === 0) {
      return;
    }
    // 読み込みをまたぐ順序は連番ではなく発生時刻で決める。
    const sorted = [...records].sort(
      (a, b) => Date.parse(a.event.timestamp) - Date.parse(b.event.timestamp),
    );
    const unsent = sorted.filter((record) => !record.sent).map((record) => record.event);
    if (unsent.length === 0) {
      return;
    }
    pending.unshift(...unsent.slice(-DIAGNOSTIC_MAX_PENDING_EVENTS));
    void flushDiagnostics();
  } catch {
    failures.record += 1;
  }
}

// --- テスト用 ---

export function configureClientDiagnosticsForTest(options: {
  transport?: DiagnosticsTransport;
  networkEnabled?: boolean;
}) {
  if (options.transport) {
    transport = options.transport;
  }
  if (options.networkEnabled !== undefined) {
    networkEnabled = options.networkEnabled;
  }
}

export function resetClientDiagnosticsForTest() {
  ringBuffer.length = 0;
  pending.length = 0;
  throttleSeenAt.clear();
  sequenceCounter = 0;
  loadId = generateId("load");
  flushInFlight = false;
  hydrated = false;
  transport = httpDiagnosticsTransport;
  networkEnabled = defaultNetworkEnabled();
  failures.send = 0;
  failures.record = 0;
  failures.droppedPending = 0;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export function pendingDiagnosticEventsForTest() {
  return [...pending];
}
