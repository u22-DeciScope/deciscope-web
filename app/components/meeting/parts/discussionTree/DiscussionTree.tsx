import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HiOutlineShare } from "react-icons/hi2";

import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type {
  AnalysisItem,
  TreeChangesPayload,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import {
  buildAgendaLabelMap,
  buildMeetingMomentIndex,
  humanizeAgendaReferences,
  treeNodeMomentLabel,
} from "~/components/meeting/parts/meetingDisplayMetadata";

import {
  flushDiagnosticsWithBeacon,
  recordDiagnosticEvent,
} from "~/utils/clientDiagnostics/clientDiagnostics";

import { type DiscussionFlowNode, nodeTypes } from "./DiscussionNodeView";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutDiscussionTree,
  normalizeEdges,
  orderDiscussionTreeNodesParentFirst,
  uniqueDiscussionTreeNodes,
} from "./discussionTreeLayout";
import { DiscussionTreeErrorBoundary } from "./DiscussionTreeErrorBoundary";
import {
  buildDiscussionTreeModel,
  collapsibleNodeIds,
  isNodeVisible,
  type DiscussionTreeModel,
} from "./discussionTreeModel";
import { NodeDetailCard } from "./NodeDetailCard";
import {
  allTargetsVisible,
  deriveTreeChanges,
  focusAnimationDuration,
  focusTargetIds,
  isFiniteViewport,
  shouldDeferTreeFocus,
  treeChangeSignature,
} from "./discussionTreeFocus";

// バッジ表示・件数バッジの種別の並び順(安定した順序で見比べやすくする)。
const KIND_ORDER = [
  "issue",
  "open_issue",
  "question",
  "risk",
  "fact",
  "decision",
  "todo",
  "group",
  "topic",
];

// ノード選択時に右上へ出る NodeDetailCard の占有幅。w-72(288px) + right-2(8px)。
// ノードを中央表示するとき、この幅ぶんを避けて「詳細カードに隠れない可視領域」の
// 中央へ寄せる。NodeDetailCard.tsx のサイズを変えたらここも合わせること。
const NODE_DETAIL_OVERLAY_WIDTH = 296;
// 上記の補正を行う最小の可視幅。パネルが狭くて詳細カードを避けた領域にノード
// (幅260px)を収められない場合は、補正せず単純な中央表示にする。
const MIN_VISIBLE_WIDTH_FOR_OVERLAY_OFFSET = 320;
const AUTO_FOLLOW_INTERACTION_GRACE_MS = 4000;
const AUTO_FOLLOW_COOLDOWN_MS = 2000;
const STRUCTURAL_HIGHLIGHT_MS = 3000;
const PRACTICALLY_INVISIBLE_OPACITY = 0.02;
const NODE_INITIALIZATION_GRACE_FRAMES = 2;
const VISIBILITY_RECOVERY_COOLDOWN_MS = 1500;
const MAX_CONSECUTIVE_VISIBILITY_RECOVERIES = 2;
const MANUAL_RESET_DUPLICATE_WINDOW_MS = 300;
// viewport操作の完了通知が割り込みで失われた場合に、その操作だけを打ち切るまでの
// 猶予。想定アニメーション時間へ上乗せする。d3のtransitionは duration からせいぜい
// 数フレーム遅れて終わるだけなので、これ以上待っても取りこぼしを回復できない。
const VIEWPORT_OPERATION_SETTLE_MARGIN_MS = 300;
// 初回hydrateがreadyにならないまま放置される上限。超えたらエラー表示と再取得
// 導線へ倒す(空のReact Flow canvasを出し続けない)。通常updateの待ち時間を
// 延ばすものではなく、表示できる旧treeが存在しない初回hydrate専用の失敗判定。
const INITIAL_HYDRATION_BUDGET_MS = 8000;
let discussionFlowInstanceSequence = 0;
let discussionProviderInstanceSequence = 0;
let discussionViewportOperationSequence = 0;
let discussionFocusRequestSequence = 0;
let discussionHydrationSequence = 0;

// 進行中のprogrammatic viewport操作1件。非同期の完了が「いま有効か」を
// generationと対象tree/layout、focus対象nodeと選択世代で判定するために必要な
// 情報だけを持つ。
type ViewportOperation = {
  operationId: number;
  generation: number;
  source: string;
  treeVersion: number | null;
  layoutRevision: string;
  startedAt: number;
  bufferSlot: DiscussionTreeBufferSlot;
  // focus由来の操作だけが持つ対象node。nullはfitViewなどnodeを狙わない操作。
  focusRequestId: number | null;
  focusTargetNodeId: string | null;
  selectionRevision: number;
};

type DiscussionRenderFrame = {
  signature: string;
  nodes: DiscussionFlowNode[];
  edges: Edge[];
  bounds: ReturnType<typeof layoutDiscussionTree>["bounds"];
  viewport: { x: number; y: number; zoom: number };
  treeVersion: number | null;
  treeHash: string | null;
};

// AIアシスタントのカードクリックなど、外部から「この分析itemに対応するノードへ
// フォーカスしてほしい」という要求。同じitemIdを連続でクリックしても再フォーカス
// できるよう、要求ごとに増えるtokenを持つ。
export type DiscussionTreeFocusRequest = {
  itemId: string;
  token: number;
};

type DiscussionTreeProps = {
  sessionId?: string;
  // workspaceId は診断ログ(client diagnostics)の認可単位。表示には使わない。
  workspaceId?: string;
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems?: AnalysisItem[];
  segments?: MeetingSegmentDto[];
  onSelectAnalysisItem?: (id: string) => void;
  updateStatus?: React.ReactNode;
  // 隣接カラム(タイムライン)の開閉など、外部要因でこのパネルの表示幅が
  // 変わったことを知らせるシグナル。値が変化した回だけ一度だけ再fitViewする。
  layoutSignal?: boolean;
  focusItemRequest?: DiscussionTreeFocusRequest | null;
  treeChanges?: TreeChangesPayload;
  analysisVersion?: number | null;
  treeVersion?: number | null;
  treeHash?: string;
};

type DiscussionTreeSnapshot = {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems?: AnalysisItem[];
  segments?: MeetingSegmentDto[];
  treeChanges?: TreeChangesPayload;
  analysisVersion: number | null;
  treeVersion: number | null;
  treeHash?: string;
  layoutRevision: string;
  metadataRevision: string;
};

type BufferedDiscussionTreeSnapshot = DiscussionTreeSnapshot & {
  generation: number;
  receivedAt: number;
};

type DiscussionTreeRuntimeReadiness = {
  generation: number;
  bufferSlot: DiscussionTreeBufferSlot;
  providerInstanceId: string;
  reactFlowInstanceId: string;
  componentKey: string;
  metadataRevision: string;
  candidateSignature: string;
  layoutRevision: string;
  internalNodeCount: number;
  internalNodeIdSignature: string;
  domNodeCount: number;
  domNodeIdSignature: string;
  domMeasuredNodeIdSignature: string;
  measuredNodeCount: number;
  measuredNodeIdSignature: string;
  expectedDisplayedNodeIdSignature: string;
  expectedDisplayedNodeCount: number;
  measurementComplete: boolean;
  measurementBlockingReason: string;
  nodesInitialized: boolean;
  nodesInitializedStale: boolean;
  hydrationKind: DiscussionTreeHydrationKind;
  paintReady: boolean;
  paintBlockingReason: string;
  visibleNodeCount: number;
  viewport: { x: number; y: number; zoom: number };
};
type DiscussionTreeFailureReadiness = Pick<
  DiscussionTreeRuntimeReadiness,
  "bufferSlot" | "metadataRevision"
> &
  Partial<DiscussionTreeRuntimeReadiness>;

type DiscussionTreeSwapPhase = "committed" | "preparing" | "ready" | "failed";
type DiscussionTreeBufferSlot = "a" | "b";
type DiscussionTreeSnapshotRole = "committed" | "pending" | "standby";
// 表示中のtreeが存在しない初回hydrateと、旧treeを表示したまま行う通常updateは
// 満たすべき前提が違う。通常updateのpending条件をそのまま初回へ流用すると、
// 「表示できる旧treeが無いのに準備が終わらない」= 全面空白のまま停止する。
type DiscussionTreeHydrationKind = "initial" | "update";
type DiscussionTreeHydrationPhase =
  | "uninitialized"
  | "hydrating_initial_snapshot"
  | "initial_snapshot_ready"
  | "displaying_committed"
  | "preparing_update"
  | "swapping_update"
  | "failed_initial_hydration";

// React Flow v12 の store.nodesInitialized は adoptUserNodes(= nodes プロップの
// 更新)でしか再計算されない。実測値を書き込む updateNodeInternals はこのフラグを
// 更新しないため、propsが落ち着いた画面(/summary の確定済み最終ツリー)では
// 「全nodeがmeasured済みなのに nodesInitialized=false のまま固定」になる。
// したがってreadinessの正本は「React Flowへ実際に渡した表示対象node ID集合が
// 内部store・DOMの双方で計測済みか」であり、集約フラグは観測値として記録する。
type DiscussionTreeMeasurementReadiness = {
  complete: boolean;
  blockingReason: string;
  nodesInitializedStale: boolean;
};

export function discussionTreeMeasurementReadiness(input: {
  expectedNodeCount: number;
  expectedNodeIdSignature: string;
  expectedEdgeCount: number;
  internalNodeCount: number;
  internalNodeIdSignature: string;
  internalEdgeCount: number;
  measuredNodeCount: number;
  measuredNodeIdSignature: string;
  domNodeCount: number;
  domNodeIdSignature: string;
  domMeasuredNodeIdSignature: string;
  nodesInitialized: boolean;
}): DiscussionTreeMeasurementReadiness {
  const blockingReason =
    input.expectedNodeCount === 0
      ? "no_displayed_nodes"
      : input.internalNodeCount !== input.expectedNodeCount ||
          input.internalNodeIdSignature !== input.expectedNodeIdSignature
        ? "internal_node_set_mismatch"
        : input.internalEdgeCount !== input.expectedEdgeCount
          ? "internal_edge_count_mismatch"
          : input.measuredNodeCount !== input.expectedNodeCount ||
              input.measuredNodeIdSignature !== input.expectedNodeIdSignature
            ? "internal_measurement_incomplete"
            : input.domNodeCount !== input.expectedNodeCount ||
                input.domNodeIdSignature !== input.expectedNodeIdSignature
              ? "dom_node_set_mismatch"
              : input.domMeasuredNodeIdSignature !== input.expectedNodeIdSignature
                ? "dom_measurement_incomplete"
                : "";
  return {
    complete: blockingReason === "",
    blockingReason,
    nodesInitializedStale: blockingReason === "" && !input.nodesInitialized,
  };
}

export function DiscussionTree(props: DiscussionTreeProps) {
  // A meeting boundary is a hard ownership boundary. Keying only by session
  // resets both React Flow providers and every last-known-good/ref cache before
  // a different meeting can render, while normal tree versions stay buffered.
  return <DiscussionTreeSession key={props.sessionId || "anonymous"} {...props} />;
}

function DiscussionTreeSession({
  sessionId = "",
  workspaceId = "",
  nodes,
  edges,
  analysisItems,
  segments,
  onSelectAnalysisItem,
  updateStatus,
  layoutSignal,
  focusItemRequest,
  treeChanges,
  analysisVersion = null,
  treeVersion = null,
  treeHash,
}: DiscussionTreeProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const observedCanvasSize = useDiscussionTreeCanvasSize(canvasRef);
  const incomingSnapshot = useMemo<DiscussionTreeSnapshot>(() => {
    const layoutRevision = discussionTreeLayoutRevision(nodes, edges, analysisItems ?? []);
    return {
      nodes,
      edges,
      analysisItems,
      segments,
      treeChanges,
      analysisVersion,
      treeVersion,
      treeHash,
      layoutRevision,
      metadataRevision: opaqueDiscussionTreeMetadataRevision({
        treeVersion,
        analysisVersion,
        treeHash: treeHash ?? null,
        nodes,
        edges,
        analysisItems: analysisItems ?? [],
        segments: segments ?? [],
        treeChanges: treeChanges ?? null,
      }),
    };
  }, [analysisItems, analysisVersion, edges, nodes, segments, treeChanges, treeHash, treeVersion]);
  const latestIncomingMetadataRevisionRef = useRef(incomingSnapshot.metadataRevision);
  latestIncomingMetadataRevisionRef.current = incomingSnapshot.metadataRevision;
  const initialSnapshotRef = useRef(incomingSnapshot);
  const initialBufferedSnapshotRef = useRef<BufferedDiscussionTreeSnapshot | null>(
    initialSnapshotRef.current.nodes.length > 0
      ? { ...initialSnapshotRef.current, generation: 1, receivedAt: Date.now() }
      : null,
  );
  const [committedTree, setCommittedTree] = useState<BufferedDiscussionTreeSnapshot | null>(
    initialBufferedSnapshotRef.current,
  );
  const [pendingTree, setPendingTree] = useState<BufferedDiscussionTreeSnapshot | null>(null);
  const [slotSnapshots, setSlotSnapshots] = useState<
    Record<DiscussionTreeBufferSlot, BufferedDiscussionTreeSnapshot | null>
  >(() => ({
    a: initialBufferedSnapshotRef.current,
    // The hidden fixed slot starts from the same measured ID set. The first
    // one-node update can therefore preserve existing React Flow internals and
    // measure only the added node instead of mounting an empty provider.
    b: initialBufferedSnapshotRef.current,
  }));
  const [committedSlot, setCommittedSlot] = useState<DiscussionTreeBufferSlot | null>(() =>
    initialBufferedSnapshotRef.current ? "a" : null,
  );
  const [pendingSlot, setPendingSlot] = useState<DiscussionTreeBufferSlot | null>(null);
  const [swapPhase, setSwapPhase] = useState<DiscussionTreeSwapPhase>("committed");
  const [committedViewport, setCommittedViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [viewportInteractionActive, setViewportInteractionActive] = useState(false);
  // 進行中のprogrammatic viewport操作はbuffer slotごとに保持する。単一のboolean
  // だと片方のslotの完了がもう片方の進行中操作を消し、逆に片方の取りこぼしが全体を
  // activeのまま固定してしまう。
  const [programmaticViewportMoveSlots, setProgrammaticViewportMoveSlots] = useState<
    Record<DiscussionTreeBufferSlot, boolean>
  >({ a: false, b: false });
  const programmaticViewportMoveActive =
    programmaticViewportMoveSlots.a || programmaticViewportMoveSlots.b;
  const handleProgrammaticViewportMoveChange = useCallback(
    (slot: DiscussionTreeBufferSlot, active: boolean) => {
      setProgrammaticViewportMoveSlots((current) =>
        current[slot] === active ? current : { ...current, [slot]: active },
      );
    },
    [],
  );
  const [manualResetActive, setManualResetActive] = useState(false);
  // selection(詳細パネルで選択中) / focus(viewportが実際に寄せたnode) /
  // pending focus(いま移動中の対象) を分離する。単一のidで兼ねると、選択だけが
  // 変わったあとも過去のfocus操作が「現在の対象」として扱われ、viewportが前の
  // ノードへ戻ってしまう。
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pendingFocusTargetId, setPendingFocusTargetId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const selectedIdRef = useRef(selectedId);
  const selectionRevisionRef = useRef(selectionRevision);
  selectedIdRef.current = selectedId;
  selectionRevisionRef.current = selectionRevision;
  const selectionDiagnosticFieldsRef = useRef({
    sessionId,
    workspaceId,
    treeVersion,
    analysisVersion,
  });
  selectionDiagnosticFieldsRef.current = { sessionId, workspaceId, treeVersion, analysisVersion };
  // 選択の変更は必ずここを通す。revisionを進めることで、進行中のfocus操作は
  // 「別の選択に対する操作」になり、遅れて届く完了が現在の状態を書き換えない。
  const selectNode = useCallback(
    (nodeId: string | null, options: { focus: boolean; source: string }) => {
      const previousNodeId = selectedIdRef.current;
      const nextRevision = selectionRevisionRef.current + 1;
      selectedIdRef.current = nodeId;
      selectionRevisionRef.current = nextRevision;
      setSelectedId(nodeId);
      setSelectionRevision(nextRevision);
      setPendingFocusTargetId(nodeId !== null && options.focus ? nodeId : null);
      if (nodeId === null) {
        setFocusedId(null);
      }
      const fields = selectionDiagnosticFieldsRef.current;
      recordDiagnosticEvent("tree_render_state", {
        sessionId: fields.sessionId,
        workspaceId: fields.workspaceId,
        treeVersion: fields.treeVersion,
        analysisVersion: fields.analysisVersion,
        details: {
          phase: nodeId === null ? "selection_cleared" : "selection_changed",
          previousNodeId,
          targetNodeId: nodeId,
          selectionRevision: nextRevision,
          focusRequested: nodeId !== null && options.focus,
          source: options.source,
        },
      });
    },
    [],
  );
  // focus操作が「いまも現在の選択に対する操作」として完了したときだけ呼ばれる。
  const handleFocusSettled = useCallback((nodeId: string, revision: number) => {
    if (selectedIdRef.current !== nodeId || selectionRevisionRef.current !== revision) {
      return;
    }
    setFocusedId(nodeId);
  }, []);
  const handlePendingFocusTargetConsumed = useCallback((nodeId: string) => {
    setPendingFocusTargetId((current) => (current === nodeId ? null : current));
  }, []);
  const providerInstanceIdsRef = useRef<Record<DiscussionTreeBufferSlot, string> | null>(null);
  if (!providerInstanceIdsRef.current) {
    discussionProviderInstanceSequence += 1;
    const a = `${sessionId || "anonymous"}:provider-instance:${discussionProviderInstanceSequence}`;
    discussionProviderInstanceSequence += 1;
    const b = `${sessionId || "anonymous"}:provider-instance:${discussionProviderInstanceSequence}`;
    providerInstanceIdsRef.current = { a, b };
  }
  // These guards describe one meeting interaction stream, not one rendering
  // buffer. Keeping them above the fixed A/B providers prevents a promotion
  // from forgetting a pan, focus token, or in-flight manual reset.
  const lastManualInteractionAtRef = useRef(0);
  const lastAutoFocusAtRef = useRef(0);
  const manualResetInProgressRef = useRef(false);
  const manualResetRequestIdRef = useRef(0);
  const lastManualResetAtRef = useRef(0);
  const processedFocusTokenRef = useRef<number | null>(null);
  const generationRef = useRef(committedTree?.generation ?? 0);
  const committedTreeRef = useRef(committedTree);
  const pendingTreeRef = useRef(pendingTree);
  const committedSlotRef = useRef(committedSlot);
  const pendingSlotRef = useRef(pendingSlot);
  const rejectedIncomingRevisionRef = useRef("");
  committedTreeRef.current = committedTree;
  pendingTreeRef.current = pendingTree;
  committedSlotRef.current = committedSlot;
  pendingSlotRef.current = pendingSlot;
  // 初回hydrateは通常updateと別のphaseで管理する。旧treeが無い状態は
  // 「準備が終わるまで待つ」だけでは全面空白のまま停止しうるため、明示的な
  // loading・failed・retryを持たせる。
  const [hydrationPhase, setHydrationPhase] = useState<DiscussionTreeHydrationPhase>(() =>
    initialBufferedSnapshotRef.current ? "displaying_committed" : "uninitialized",
  );
  const [hydrationFailureReason, setHydrationFailureReason] = useState("");
  const [initialHydrationRetryEpoch, setInitialHydrationRetryEpoch] = useState(0);
  const hydrationIdRef = useRef("");
  const hydrationGenerationRef = useRef(0);
  if (!hydrationIdRef.current) {
    discussionHydrationSequence += 1;
    hydrationIdRef.current = `${sessionId || "anonymous"}:hydration:${discussionHydrationSequence}`;
  }
  const recordHydrationPhase = useCallback(
    (
      phase: string,
      snapshot: BufferedDiscussionTreeSnapshot | null,
      extra: Record<string, unknown> = {},
    ) => {
      recordDiagnosticEvent("tree_render_state", {
        sessionId,
        workspaceId,
        treeVersion: snapshot?.treeVersion ?? treeVersion,
        analysisVersion: snapshot?.analysisVersion ?? analysisVersion,
        nodeCount: snapshot?.nodes.length ?? 0,
        rootNodeId: discussionTreeRootNodeId(snapshot?.nodes ?? []),
        details: {
          phase,
          hydrationId: hydrationIdRef.current,
          hydrationGeneration: hydrationGenerationRef.current,
          source: "persisted_snapshot_props",
          snapshotKind: "tree_snapshot",
          treeVersion: snapshot?.treeVersion ?? null,
          analysisVersion: snapshot?.analysisVersion ?? null,
          canonicalNodeCount: snapshot?.nodes.length ?? 0,
          generation: snapshot?.generation ?? null,
          layoutRevision: snapshot?.layoutRevision ?? "",
          ...extra,
        },
      });
    },
    [analysisVersion, sessionId, treeVersion, workspaceId],
  );

  // 準備中のpendingが対象でなくなったときに破棄する。ここで破棄しないと
  // pendingは preparing のまま滞留し、readinessの照合対象(最新のincoming)と
  // 永久に一致しないため、同じversionが再到着しても準備し直せなくなる。
  // cancelは failed とは違い revision を棄却リストへ入れないので、同じ内容が
  // 再到着したら新しいgenerationで準備をやり直せる。
  const cancelPendingTree = useCallback(
    (cancelled: BufferedDiscussionTreeSnapshot, reason: string) => {
      const previous = committedTreeRef.current;
      const cancelledSlot = pendingSlotRef.current;
      pendingTreeRef.current = null;
      pendingSlotRef.current = null;
      setPendingTree(null);
      setPendingSlot(null);
      if (cancelledSlot && previous) {
        setSlotSnapshots((current) => ({ ...current, [cancelledSlot]: previous }));
      }
      setSwapPhase(previous ? "committed" : "failed");
      recordDiagnosticEvent("tree_swap_kept_previous", {
        sessionId,
        workspaceId,
        treeVersion: previous?.treeVersion ?? null,
        analysisVersion: previous?.analysisVersion ?? null,
        nodeCount: previous?.nodes.length ?? 0,
        rootNodeId: discussionTreeRootNodeId(previous?.nodes ?? []),
        details: discussionTreeSwapDiagnosticDetails(previous, cancelled, {
          reason,
          pendingPhase: "cancelled",
          cancelledGeneration: cancelled.generation,
        }),
      });
    },
    [sessionId, workspaceId],
  );

  useEffect(() => {
    const currentCommitted = committedTreeRef.current;
    const currentPending = pendingTreeRef.current;
    // 同じpendingを準備中なら二重に開始しない。
    if (incomingSnapshot.metadataRevision === currentPending?.metadataRevision) {
      return;
    }
    if (
      incomingSnapshot.metadataRevision === currentCommitted?.metadataRevision ||
      incomingSnapshot.metadataRevision === rejectedIncomingRevisionRef.current
    ) {
      // propsが現在のcommitted(または不正として棄却済みのrevision)へ戻った。
      // 準備中だったpendingはもう対象ではないので明示的にcancelする。
      if (currentPending) {
        cancelPendingTree(
          currentPending,
          incomingSnapshot.metadataRevision === currentCommitted?.metadataRevision
            ? "props_rolled_back_to_committed"
            : "pending_superseded_by_rejected_revision",
        );
      }
      return;
    }

    if (incomingSnapshot.nodes.length === 0 && !currentCommitted) {
      return;
    }

    if (incomingSnapshot.nodes.length === 0 && currentCommitted?.nodes.length) {
      rejectedIncomingRevisionRef.current = incomingSnapshot.metadataRevision;
      const discardedSlot = pendingSlotRef.current;
      pendingTreeRef.current = null;
      pendingSlotRef.current = null;
      setPendingTree(null);
      setPendingSlot(null);
      if (discardedSlot) {
        setSlotSnapshots((current) => ({ ...current, [discardedSlot]: currentCommitted }));
      }
      setSwapPhase("failed");
      recordDiagnosticEvent("tree_swap_failed", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: currentCommitted.nodes.length,
        rootNodeId: discussionTreeRootNodeId(currentCommitted.nodes),
        details: discussionTreeSwapDiagnosticDetails(currentCommitted, null, {
          reason: "incoming_tree_empty",
        }),
      });
      recordDiagnosticEvent("tree_swap_kept_previous", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: currentCommitted.nodes.length,
        rootNodeId: discussionTreeRootNodeId(currentCommitted.nodes),
        details: discussionTreeSwapDiagnosticDetails(currentCommitted, null, {
          reason: "incoming_tree_empty",
        }),
      });
      return;
    }

    // Metadata arriving while the same pending layout is being measured must
    // not churn its provider or restart readiness on every analysis revision.
    if (currentPending && incomingSnapshot.layoutRevision === currentPending.layoutRevision) {
      const pendingMetadataUpdate = {
        ...incomingSnapshot,
        generation: currentPending.generation,
        receivedAt: currentPending.receivedAt,
      };
      pendingTreeRef.current = pendingMetadataUpdate;
      setPendingTree(pendingMetadataUpdate);
      const slot = pendingSlotRef.current;
      if (slot) {
        setSlotSnapshots((current) => ({ ...current, [slot]: pendingMetadataUpdate }));
      }
      return;
    }

    // Description/status/evidence-only changes keep the active provider and
    // positions. Only structural input gets a separately prepared buffer.
    if (currentCommitted && incomingSnapshot.layoutRevision === currentCommitted.layoutRevision) {
      rejectedIncomingRevisionRef.current = "";
      const metadataUpdate = {
        ...incomingSnapshot,
        generation: currentCommitted.generation,
        receivedAt: currentCommitted.receivedAt,
      };
      committedTreeRef.current = metadataUpdate;
      setCommittedTree(metadataUpdate);
      setSlotSnapshots((current) => {
        const next = { ...current };
        const activeSlot = committedSlotRef.current;
        const discardedSlot = pendingSlotRef.current;
        if (activeSlot) next[activeSlot] = metadataUpdate;
        if (discardedSlot) next[discardedSlot] = metadataUpdate;
        return next;
      });
      if (currentPending) {
        pendingTreeRef.current = null;
        setPendingTree(null);
        pendingSlotRef.current = null;
        setPendingSlot(null);
      }
      setSwapPhase("committed");
      return;
    }

    generationRef.current += 1;
    const nextPending: BufferedDiscussionTreeSnapshot = {
      ...incomingSnapshot,
      generation: generationRef.current,
      receivedAt: Date.now(),
    };
    const nextPendingSlot =
      pendingSlotRef.current ?? (committedSlotRef.current === "a" ? "b" : "a");
    rejectedIncomingRevisionRef.current = "";
    if (currentPending) {
      recordDiagnosticEvent("tree_swap_kept_previous", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: currentCommitted?.nodes.length ?? 0,
        rootNodeId: discussionTreeRootNodeId(currentCommitted?.nodes ?? []),
        details: discussionTreeSwapDiagnosticDetails(currentCommitted, currentPending, {
          reason: "pending_snapshot_superseded",
          supersededGeneration: currentPending.generation,
          replacementGeneration: nextPending.generation,
        }),
      });
    }
    pendingTreeRef.current = nextPending;
    pendingSlotRef.current = nextPendingSlot;
    setPendingTree(nextPending);
    setPendingSlot(nextPendingSlot);
    setSlotSnapshots((current) => ({ ...current, [nextPendingSlot]: nextPending }));
    setSwapPhase("preparing");
    if (currentCommitted) {
      setHydrationPhase("preparing_update");
    } else {
      hydrationGenerationRef.current += 1;
      setHydrationFailureReason("");
      setHydrationPhase("hydrating_initial_snapshot");
      recordHydrationPhase("initial_hydration_snapshot_selected", nextPending, {
        bufferSlot: nextPendingSlot,
      });
      recordHydrationPhase("initial_hydration_started", nextPending, {
        bufferSlot: nextPendingSlot,
      });
    }
    recordDiagnosticEvent("tree_swap_started", {
      sessionId,
      workspaceId,
      treeVersion,
      analysisVersion,
      nodeCount: currentCommitted?.nodes.length ?? 0,
      rootNodeId: discussionTreeRootNodeId(currentCommitted?.nodes ?? nextPending.nodes),
      details: discussionTreeSwapDiagnosticDetails(currentCommitted, nextPending, {
        pendingGeneration: nextPending.generation,
        pendingPhase: "preparing",
        hydrationKind: currentCommitted ? "update" : "initial",
        hydrationId: hydrationIdRef.current,
        hydrationGeneration: hydrationGenerationRef.current,
      }),
    });
  }, [
    analysisVersion,
    cancelPendingTree,
    incomingSnapshot,
    initialHydrationRetryEpoch,
    recordHydrationPhase,
    sessionId,
    treeVersion,
    workspaceId,
  ]);

  // 初回hydrateだけの失敗判定。表示できる旧treeが無い状態で準備が終わらない
  // ままになったら、空のcanvasを出し続けずエラー表示と再取得導線へ倒す。
  useEffect(() => {
    if (committedTree || !pendingTree || hydrationPhase !== "hydrating_initial_snapshot") {
      return;
    }
    const failing = pendingTree;
    const timer = setTimeout(() => {
      if (committedTreeRef.current || pendingTreeRef.current !== failing) {
        return;
      }
      setHydrationFailureReason("initial_hydration_timeout");
      setHydrationPhase("failed_initial_hydration");
      recordHydrationPhase("initial_hydration_failed", failing, {
        failureReason: "initial_hydration_timeout",
        budgetMs: INITIAL_HYDRATION_BUDGET_MS,
        bufferSlot: pendingSlotRef.current,
      });
    }, INITIAL_HYDRATION_BUDGET_MS);
    return () => clearTimeout(timer);
  }, [committedTree, hydrationPhase, pendingTree, recordHydrationPhase]);

  const retryInitialHydration = useCallback(() => {
    rejectedIncomingRevisionRef.current = "";
    pendingTreeRef.current = null;
    pendingSlotRef.current = null;
    setPendingTree(null);
    setPendingSlot(null);
    setSlotSnapshots({ a: null, b: null });
    setSwapPhase("committed");
    setHydrationFailureReason("");
    setHydrationPhase("uninitialized");
    recordHydrationPhase("initial_hydration_retry_requested", null, {
      retryEpoch: initialHydrationRetryEpoch + 1,
    });
    setInitialHydrationRetryEpoch((current) => current + 1);
  }, [initialHydrationRetryEpoch, recordHydrationPhase]);

  const handlePendingReady = useCallback(
    (readiness: DiscussionTreeRuntimeReadiness) => {
      const next = pendingTreeRef.current;
      const nextSlot = pendingSlotRef.current;
      // 進行中のprogrammatic viewport操作はここでは昇格条件にしない。非同期の
      // viewport完了は割り込みで永久にsettleしないことがあり、それを必須条件に
      // すると準備済みのpendingが永久にcommitできず旧treeのまま固まる。
      // viewportは昇格後もそのまま維持されるので、blinkの原因にはならない。
      if (
        !next ||
        !nextSlot ||
        nextSlot !== readiness.bufferSlot ||
        next.generation !== readiness.generation ||
        next.metadataRevision !== readiness.metadataRevision ||
        next.metadataRevision !== latestIncomingMetadataRevisionRef.current
      ) {
        recordDiagnosticEvent("tree_render_state", {
          sessionId,
          workspaceId,
          treeVersion: next?.treeVersion ?? null,
          analysisVersion: next?.analysisVersion ?? null,
          nodeCount: next?.nodes.length ?? 0,
          details: {
            phase: "pending_stale_callback_ignored",
            callback: "pending_ready",
            readinessGeneration: readiness.generation,
            pendingGeneration: next?.generation ?? null,
            readinessBufferSlot: readiness.bufferSlot,
            pendingBufferSlot: nextSlot,
            readinessMetadataRevision: readiness.metadataRevision,
            pendingMetadataRevision: next?.metadataRevision ?? "",
            latestIncomingMetadataRevision: latestIncomingMetadataRevisionRef.current,
            layoutRevision: readiness.layoutRevision,
          },
        });
        return false;
      }
      const previous = committedTreeRef.current;
      const swapDurationMs = Math.max(0, Date.now() - next.receivedAt);
      setSwapPhase("ready");
      if (previous) {
        setHydrationPhase("swapping_update");
      } else {
        setHydrationPhase("initial_snapshot_ready");
        recordHydrationPhase("initial_hydration_ready", next, {
          bufferSlot: readiness.bufferSlot,
          displayedNodeCount: readiness.expectedDisplayedNodeCount,
          expectedNodeIdsCount: readiness.expectedDisplayedNodeCount,
          measuredNodeIdsCount: readiness.measuredNodeCount,
          domNodeCount: readiness.domNodeCount,
          nodesInitialized: readiness.nodesInitialized,
          nodesInitializedStale: readiness.nodesInitializedStale,
          visibleNodeCount: readiness.visibleNodeCount,
        });
      }
      recordDiagnosticEvent("tree_pending_ready", {
        sessionId,
        workspaceId,
        treeVersion: next.treeVersion,
        analysisVersion: next.analysisVersion,
        nodeCount: next.nodes.length,
        rootNodeId: discussionTreeRootNodeId(next.nodes),
        details: discussionTreeSwapDiagnosticDetails(previous, next, {
          ...readiness,
          pendingPhase: "ready",
          swapDurationMs,
          viewportBefore: committedViewport,
          viewportAfter: readiness.viewport,
        }),
      });

      // Both buffers are keyed by generation. In this single React commit the
      // prepared provider changes role to committed and the old provider is
      // removed, so no paint can observe an empty tree between them.
      committedTreeRef.current = next;
      pendingTreeRef.current = null;
      committedSlotRef.current = nextSlot;
      pendingSlotRef.current = null;
      rejectedIncomingRevisionRef.current = "";
      setCommittedTree(next);
      setPendingTree(null);
      setCommittedSlot(nextSlot);
      setPendingSlot(null);
      setSlotSnapshots({ a: next, b: next });
      setCommittedViewport(readiness.viewport);
      setSwapPhase("committed");
      setHydrationFailureReason("");
      setHydrationPhase("displaying_committed");
      if (!previous) {
        recordHydrationPhase("initial_hydration_committed", next, {
          bufferSlot: readiness.bufferSlot,
          displayedNodeCount: readiness.expectedDisplayedNodeCount,
          domNodeCount: readiness.domNodeCount,
          nodesInitialized: readiness.nodesInitialized,
          nodesInitializedStale: readiness.nodesInitializedStale,
          visibleNodeCount: readiness.visibleNodeCount,
          swapDurationMs,
        });
      }
      recordDiagnosticEvent("tree_swap_committed", {
        sessionId,
        workspaceId,
        treeVersion: next.treeVersion,
        analysisVersion: next.analysisVersion,
        nodeCount: next.nodes.length,
        rootNodeId: discussionTreeRootNodeId(next.nodes),
        details: discussionTreeSwapDiagnosticDetails(previous, next, {
          ...readiness,
          pendingPhase: "committed",
          swapDurationMs,
          viewportBefore: committedViewport,
          viewportAfter: readiness.viewport,
        }),
      });
      return true;
    },
    [committedViewport, recordHydrationPhase, sessionId, workspaceId],
  );

  const handlePendingFailed = useCallback(
    (generation: number, reason: string, readiness: DiscussionTreeFailureReadiness) => {
      const failed = pendingTreeRef.current;
      if (
        !failed ||
        failed.generation !== generation ||
        pendingSlotRef.current !== readiness.bufferSlot ||
        failed.metadataRevision !== readiness.metadataRevision ||
        failed.metadataRevision !== latestIncomingMetadataRevisionRef.current
      ) {
        recordDiagnosticEvent("tree_render_state", {
          sessionId,
          workspaceId,
          treeVersion: failed?.treeVersion ?? null,
          analysisVersion: failed?.analysisVersion ?? null,
          nodeCount: failed?.nodes.length ?? 0,
          details: {
            phase: "pending_stale_callback_ignored",
            callback: "pending_failed",
            reason,
            readinessGeneration: generation,
            pendingGeneration: failed?.generation ?? null,
            readinessBufferSlot: readiness.bufferSlot,
            pendingBufferSlot: pendingSlotRef.current,
            readinessMetadataRevision: readiness.metadataRevision,
            pendingMetadataRevision: failed?.metadataRevision ?? "",
            latestIncomingMetadataRevision: latestIncomingMetadataRevisionRef.current,
          },
        });
        return;
      }
      const previous = committedTreeRef.current;
      const failedSlot = pendingSlotRef.current;
      rejectedIncomingRevisionRef.current = failed.metadataRevision;
      const details = discussionTreeSwapDiagnosticDetails(previous, failed, {
        ...readiness,
        reason,
        pendingPhase: "failed",
        swapDurationMs: Math.max(0, Date.now() - failed.receivedAt),
        viewportBefore: committedViewport,
        viewportAfter: committedViewport,
      });
      pendingTreeRef.current = null;
      pendingSlotRef.current = null;
      setPendingTree(null);
      setPendingSlot(null);
      if (failedSlot && previous) {
        setSlotSnapshots((current) => ({ ...current, [failedSlot]: previous }));
      }
      setSwapPhase("failed");
      if (!previous) {
        // 表示できる旧treeが無い失敗は「更新の見送り」ではなく初回hydrateの失敗。
        // 空のcanvasを正常扱いせず、エラー表示と再取得導線へ倒す。
        setHydrationFailureReason(reason);
        setHydrationPhase("failed_initial_hydration");
        recordHydrationPhase("initial_hydration_failed", failed, {
          failureReason: reason,
          bufferSlot: readiness.bufferSlot,
          nodesInitialized: readiness.nodesInitialized ?? null,
          measurementBlockingReason: readiness.measurementBlockingReason ?? "",
        });
      }
      recordDiagnosticEvent("tree_swap_failed", {
        sessionId,
        workspaceId,
        treeVersion: failed.treeVersion,
        analysisVersion: failed.analysisVersion,
        nodeCount: previous?.nodes.length ?? 0,
        rootNodeId: discussionTreeRootNodeId(previous?.nodes ?? []),
        details,
      });
      recordDiagnosticEvent("tree_swap_kept_previous", {
        sessionId,
        workspaceId,
        treeVersion: previous?.treeVersion ?? null,
        analysisVersion: previous?.analysisVersion ?? null,
        nodeCount: previous?.nodes.length ?? 0,
        rootNodeId: discussionTreeRootNodeId(previous?.nodes ?? []),
        details,
      });
    },
    [committedViewport, recordHydrationPhase, sessionId, workspaceId],
  );

  // committed treeが差し替わったら、選択/フォーカス対象の整合を取り直す。
  // 同じidが残っていれば維持し、mergeで畳まれたならcanonical nodeへ移し、
  // 消えたなら選択とフォーカスを解除する。
  useEffect(() => {
    if (!committedTree || selectedId === null) {
      return;
    }
    if (committedTree.nodes.some((node) => node.id === selectedId)) {
      return;
    }
    const canonical = committedTree.nodes.find((node) =>
      (node.mergedFromNodeIds ?? []).includes(selectedId),
    );
    if (canonical) {
      selectNode(canonical.id, { focus: true, source: "tree_swap_merged_target" });
      return;
    }
    selectNode(null, { focus: false, source: "tree_swap_target_removed" });
  }, [committedTree, selectNode, selectedId]);

  const displayedNodeCount = useMemo(
    () =>
      visibleDiscussionTreeNodeCount(
        committedTree?.nodes ?? [],
        committedTree?.edges ?? [],
        committedTree?.analysisItems ?? [],
      ),
    [committedTree],
  );
  const lifecycleSnapshotRef = useRef({
    sessionId: sessionId || null,
    pathname: typeof window === "undefined" ? null : window.location.pathname,
    treeVersion,
    nodeCount: nodes.length,
    analysisVersion,
    treeHash: treeHash ?? null,
  });
  lifecycleSnapshotRef.current = {
    sessionId: sessionId || null,
    pathname: typeof window === "undefined" ? null : window.location.pathname,
    treeVersion,
    nodeCount: nodes.length,
    analysisVersion,
    treeHash: treeHash ?? null,
  };
  const diagnosticFieldsRef = useRef({ sessionId, workspaceId, treeVersion, analysisVersion });
  diagnosticFieldsRef.current = { sessionId, workspaceId, treeVersion, analysisVersion };
  useEffect(() => {
    recordDiagnosticEvent("tree_component_mounted", {
      ...diagnosticFieldsRef.current,
      nodeCount: lifecycleSnapshotRef.current.nodeCount,
      rootNodeId: discussionTreeRootNodeId(nodes),
      details: { displayedNodeCount: lifecycleSnapshotRef.current.nodeCount },
    });
    return () => {
      const snapshot = lifecycleSnapshotRef.current;

      recordDiagnosticEvent("tree_component_unmounted", {
        ...diagnosticFieldsRef.current,
        nodeCount: snapshot.nodeCount,
        details: { nodeCountAtUnmount: snapshot.nodeCount },
      });
      // ノードを保持したままのunmountは想定外の破棄の可能性があるため、
      // ページ遷移で失う前に未送信イベントの退避を試みる。
      if (snapshot.nodeCount > 0) {
        flushDiagnosticsWithBeacon("tree_component_unmounted");
      }
    };
  }, []);
  return (
    <div
      data-discussion-tree-panel
      className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-(--ds-radius-panel) border lg:min-h-0"
      style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="flex min-h-11 shrink-0 items-center border-b px-4 py-1"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: "var(--brand-light)", color: "var(--brand)" }}
        >
          <HiOutlineShare className="h-4 w-4" />
        </span>
        <div className="ml-2 min-w-0 flex-1">
          <p className="text-[12px] font-bold" style={{ color: "var(--text-main)" }}>
            議論ツリー
          </p>
        </div>
        {pendingTree && (
          <span className="mr-2 min-w-0 shrink text-[10px]" style={{ color: "var(--text-muted)" }}>
            議論ツリーを更新中
          </span>
        )}
        {updateStatus && <span className="mr-2 min-w-0 shrink">{updateStatus}</span>}
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ background: "var(--brand-light)", color: "var(--brand)" }}
        >
          {displayedNodeCount}
        </span>
      </div>

      <div
        ref={canvasRef}
        className="relative min-h-0 flex-1"
        data-testid="discussion-tree-canvas"
        data-discussion-hydration-phase={hydrationPhase}
        data-discussion-hydration-failure-reason={hydrationFailureReason}
      >
        {!committedTree ? (
          <div className="p-4">
            <div
              className="rounded-(--ds-radius-control) border px-4 py-5 text-[12px]"
              style={{
                background: "var(--ds-surface-muted)",
                borderColor:
                  hydrationPhase === "failed_initial_hydration"
                    ? "var(--danger)"
                    : "var(--ds-border)",
                color: "var(--text-muted)",
              }}
              data-testid={
                hydrationPhase === "failed_initial_hydration"
                  ? "discussion-tree-hydration-error"
                  : hydrationPhase === "hydrating_initial_snapshot" ||
                      hydrationPhase === "initial_snapshot_ready"
                    ? "discussion-tree-hydration-loading"
                    : "discussion-tree-hydration-idle"
              }
            >
              {hydrationPhase === "failed_initial_hydration" ? (
                <>
                  <p className="font-semibold" style={{ color: "var(--danger)" }}>
                    議論ツリーを読み込めませんでした
                  </p>
                  <p className="mt-1 leading-5">
                    {nodes.length > 0
                      ? "保存済みの議論ツリーは取得できましたが、表示の準備に失敗しました。"
                      : "保存済みの議論ツリーが見つかりませんでした。"}
                  </p>
                  <button
                    type="button"
                    className="mt-3 rounded-(--ds-radius-control) border px-3 py-1.5 text-[11px] font-semibold"
                    style={{
                      background: "var(--ds-surface)",
                      borderColor: "var(--ds-border)",
                      color: "var(--text-sub)",
                    }}
                    onClick={retryInitialHydration}
                  >
                    再読み込み
                  </button>
                </>
              ) : hydrationPhase === "hydrating_initial_snapshot" ||
                hydrationPhase === "initial_snapshot_ready" ? (
                <>
                  <p className="font-semibold" style={{ color: "var(--text-main)" }}>
                    議論ツリーを読み込んでいます
                  </p>
                  <p className="mt-1 leading-5">
                    保存済みの議論ツリーを表示できる状態にしています。
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold" style={{ color: "var(--text-main)" }}>
                    議論構造を待っています
                  </p>
                  <p className="mt-1 leading-5">
                    分析イベントが届くと、React Flow上に論点のつながりが表示されます。
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}
        {(["a", "b"] as const).map((slot) => {
          const snapshot = slotSnapshots[slot];
          const snapshotRole: DiscussionTreeSnapshotRole =
            slot === committedSlot ? "committed" : slot === pendingSlot ? "pending" : "standby";
          const providerInstanceId = providerInstanceIdsRef.current![slot];
          return (
            <div
              key={slot}
              className={`absolute inset-0 ${
                snapshotRole !== "committed" ? "pointer-events-none opacity-0" : ""
              }`}
              aria-hidden={snapshotRole !== "committed" ? true : undefined}
              inert={snapshotRole !== "committed" ? true : undefined}
              data-discussion-buffer-slot={slot}
              data-discussion-provider-instance-id={providerInstanceId}
              data-discussion-snapshot-role={snapshotRole}
              data-discussion-snapshot-version={snapshot?.treeVersion ?? "none"}
              data-discussion-snapshot-generation={snapshot?.generation ?? "none"}
              data-discussion-swap-phase={swapPhase}
              data-discussion-viewport-interaction-active={
                viewportInteractionActive ? "true" : "false"
              }
              data-discussion-programmatic-viewport-move-active={
                programmaticViewportMoveActive ? "true" : "false"
              }
              data-discussion-manual-reset-active={manualResetActive ? "true" : "false"}
              data-discussion-hydration-phase={hydrationPhase}
              data-discussion-selected-node-id={selectedId ?? ""}
              data-discussion-focused-node-id={focusedId ?? ""}
              data-discussion-pending-focus-node-id={pendingFocusTargetId ?? ""}
              data-discussion-selection-revision={selectionRevision}
            >
              <ReactFlowProvider>
                {snapshot ? (
                  <DiscussionTreeErrorBoundary
                    nodes={snapshot.nodes}
                    sessionId={sessionId}
                    workspaceId={workspaceId}
                    treeVersion={snapshot.treeVersion}
                    resetKey={`${snapshot.treeVersion ?? "none"}:${snapshot.nodes.length}:${snapshot.edges.length}:${snapshot.generation}`}
                    onError={
                      snapshotRole === "pending"
                        ? (error) =>
                            handlePendingFailed(snapshot.generation, error.name, {
                              bufferSlot: slot,
                              metadataRevision: snapshot.metadataRevision,
                            })
                        : undefined
                    }
                  >
                    <DiscussionFlow
                      sessionId={sessionId}
                      workspaceId={workspaceId}
                      nodes={snapshot.nodes}
                      edges={snapshot.edges}
                      analysisItems={snapshot.analysisItems}
                      segments={snapshot.segments}
                      onSelectAnalysisItem={onSelectAnalysisItem}
                      layoutSignal={layoutSignal}
                      focusItemRequest={focusItemRequest}
                      treeChanges={snapshot.treeChanges}
                      analysisVersion={snapshot.analysisVersion}
                      treeVersion={snapshot.treeVersion}
                      treeHash={snapshot.treeHash}
                      observedCanvasSize={observedCanvasSize}
                      snapshotRole={snapshotRole}
                      bufferSlot={slot}
                      providerInstanceId={providerInstanceId}
                      snapshotGeneration={snapshot.generation}
                      layoutRevision={snapshot.layoutRevision}
                      metadataRevision={snapshot.metadataRevision}
                      preservedViewport={committedViewport}
                      viewportInteractionActive={viewportInteractionActive}
                      programmaticViewportMoveActive={programmaticViewportMoveActive}
                      manualResetActive={manualResetActive}
                      onPendingReady={handlePendingReady}
                      onPendingFailed={handlePendingFailed}
                      onCommittedViewportChange={setCommittedViewport}
                      onViewportInteractionChange={setViewportInteractionActive}
                      onProgrammaticViewportMoveChange={handleProgrammaticViewportMoveChange}
                      onManualResetActiveChange={setManualResetActive}
                      hydrationKind={committedSlot === null ? "initial" : "update"}
                      selectedId={selectedId}
                      selectionRevision={selectionRevision}
                      focusedId={focusedId}
                      pendingFocusTargetId={pendingFocusTargetId}
                      selectNode={selectNode}
                      onFocusSettled={handleFocusSettled}
                      onPendingFocusTargetConsumed={handlePendingFocusTargetConsumed}
                      hoveredId={hoveredId}
                      setHoveredId={setHoveredId}
                      autoFollow={autoFollow}
                      setAutoFollow={setAutoFollow}
                      collapsed={collapsed}
                      setCollapsed={setCollapsed}
                      lastManualInteractionAtRef={lastManualInteractionAtRef}
                      lastAutoFocusAtRef={lastAutoFocusAtRef}
                      manualResetInProgressRef={manualResetInProgressRef}
                      manualResetRequestIdRef={manualResetRequestIdRef}
                      lastManualResetAtRef={lastManualResetAtRef}
                      processedFocusTokenRef={processedFocusTokenRef}
                    />
                  </DiscussionTreeErrorBoundary>
                ) : null}
              </ReactFlowProvider>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function discussionTreeLayoutRevision(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
  analysisItems: AnalysisItem[],
) {
  const staged = stageTentativeTree(nodes, edges, analysisItems);
  const normalizedEdges = normalizeEdges(staged.nodes, staged.edges);
  return JSON.stringify({
    nodes: staged.nodes.map((node) => [node.id, node.kind ?? "", node.parentId ?? ""]),
    edges: normalizedEdges.map((edge) => [edge.id, edge.source, edge.target]),
  });
}

function opaqueDiscussionTreeMetadataRevision(value: unknown) {
  const serialized = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `m:${serialized.length}:${first.toString(16)}:${second.toString(16)}`;
}

function discussionTreeSwapDiagnosticDetails(
  committed: BufferedDiscussionTreeSnapshot | null,
  pending: BufferedDiscussionTreeSnapshot | null,
  details: Record<string, unknown> = {},
) {
  return {
    treeVersionBefore: committed?.treeVersion ?? null,
    treeVersionAfter: pending?.treeVersion ?? committed?.treeVersion ?? null,
    layoutRevision: pending?.layoutRevision ?? committed?.layoutRevision ?? "",
    committedNodeCount: committed?.nodes.length ?? 0,
    pendingNodeCount: pending?.nodes.length ?? 0,
    internalNodeCount: 0,
    internalNodeIdSignature: "",
    domNodeCount: 0,
    domNodeIdSignature: "",
    domMeasuredNodeIdSignature: "",
    measuredNodeCount: 0,
    measuredNodeIdSignature: "",
    nodesInitialized: false,
    visibleNodeCount: 0,
    swapDurationMs: 0,
    viewportBefore: null,
    viewportAfter: null,
    ...details,
  };
}

// React Flowがduration付きの移動で返すPromiseは、d3-zoomのtransitionが別の移動に
// 割り込まれると 'end' を発火しないため永久にsettleしない。await し続けると
// fitViewPending や manualResetInProgress のような単発実行フラグが下りず、以後の
// 操作が全て拒否される。rejectはそのまま伝播させ、「決着しなかった場合」だけを
// 想定時間+猶予で fallback として確定させる。
function withSettleTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function discussionFlowNodeEquivalent(left: DiscussionFlowNode, right: DiscussionFlowNode) {
  const leftData = left.data;
  const rightData = right.data;
  return (
    left.type === right.type &&
    left.selected === right.selected &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.initialWidth === right.initialWidth &&
    left.initialHeight === right.initialHeight &&
    leftData.id === rightData.id &&
    leftData.tag === rightData.tag &&
    leftData.subtype === rightData.subtype &&
    leftData.status === rightData.status &&
    leftData.speaker === rightData.speaker &&
    leftData.label === rightData.label &&
    leftData.description === rightData.description &&
    leftData.momentLabel === rightData.momentLabel &&
    leftData.relatedCount === rightData.relatedCount &&
    leftData.active === rightData.active &&
    leftData.hasChildren === rightData.hasChildren &&
    leftData.childCount === rightData.childCount &&
    leftData.collapsed === rightData.collapsed &&
    leftData.onToggleCollapse === rightData.onToggleCollapse &&
    leftData.dimmed === rightData.dimmed &&
    leftData.recentlyUpdated === rightData.recentlyUpdated &&
    leftData.childKindCounts.length === rightData.childKindCounts.length &&
    leftData.childKindCounts.every(
      (value, index) =>
        value.kind === rightData.childKindCounts[index]?.kind &&
        value.count === rightData.childKindCounts[index]?.count,
    )
  );
}

// 診断ログ用の起点ノードID。親を持たない最初のノード、無ければ先頭ノード。
function discussionTreeRootNodeId(nodes: TreeNodePayload[]) {
  if (nodes.length === 0) {
    return "";
  }
  const ids = new Set(nodes.map((node) => node.id));
  const root = nodes.find((node) => !node.parentId || !ids.has(node.parentId));
  return root?.id ?? nodes[0].id;
}

function diagnosticViewportIsSafe(viewport: { x: number; y: number; zoom: number }) {
  return (
    isFiniteViewport(viewport) &&
    viewport.zoom >= 0.05 &&
    viewport.zoom <= 4 &&
    Math.abs(viewport.x) <= 10_000_000 &&
    Math.abs(viewport.y) <= 10_000_000
  );
}

type VisibilityRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TreeVisibilityMeasurement = {
  viewportBounds: VisibilityRect | null;
  graphBounds: VisibilityRect | null;
  visibleNodeCount: number;
  nodeViewportIntersectionCount: number;
  partiallyVisibleNodeCount: number;
  fullyVisibleNodeCount: number;
  zeroSizeNodeCount: number;
  clippedNodeCount: number;
  hiddenByAncestorNodeCount: number;
  occludedNodeCount: number;
  unoccludedVisibleNodeCount: number;
  partiallyOccludedNodeCount: number;
  staleDomNodeCount: number;
  currentDomNodeCount: number;
  nodeLayerDisplay: string;
  nodeLayerVisibility: string;
  nodeLayerOpacity: number | null;
  nodeLayerTransform: string;
  viewportLayerDisplay: string;
  viewportLayerVisibility: string;
  viewportLayerOpacity: number | null;
  viewportLayerTransform: string;
  rendererDisplay: string;
  rendererVisibility: string;
  rendererOpacity: number | null;
  topOccludingElementTag: string;
  topOccludingElementClass: string;
  topOccludingElementZIndex: string;
  ancestorHidden: boolean;
  nodeLayerHidden: boolean;
  nodeLayerTransparent: boolean;
  nearestNodeDistanceFromViewport: number | null;
  reactFlowTransform: { x: number; y: number; zoom: number };
  nodeCoordinateRange: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null;
};

type TreeVisibilityHealth =
  | "healthy_visible"
  | "empty_tree_expected"
  | "empty_tree_unexpected"
  | "nodes_exist_but_offscreen"
  | "nodes_not_initialized"
  | "nodes_exist_but_fully_occluded"
  | "node_layer_hidden"
  | "node_layer_transparent"
  | "ancestor_hidden"
  | "nodes_clipped"
  | "stale_dom_only"
  | "zero_size_nodes"
  | "invalid_transform"
  | "invalid_node_coordinates"
  | "layout_incomplete"
  | "container_hidden"
  | "container_zero_size"
  | "render_not_committed";

function rectanglesIntersect(left: VisibilityRect, right: VisibilityRect) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function rectangleContains(outer: VisibilityRect, inner: VisibilityRect) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function rectangleDistance(left: VisibilityRect, right: VisibilityRect) {
  const dx = Math.max(left.x - (right.x + right.width), right.x - (left.x + left.width), 0);
  const dy = Math.max(left.y - (right.y + right.height), right.y - (left.y + left.height), 0);
  return Math.hypot(dx, dy);
}

function intersectRectangles(left: VisibilityRect, right: VisibilityRect): VisibilityRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  if (rightEdge <= x || bottomEdge <= y) return null;
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

type VisibilityStyle = {
  display: string;
  visibility: string;
  opacity: number | null;
  transform: string;
  contentVisibility: string;
  overflowX: string;
  overflowY: string;
  zIndex: string;
  clipPath: string;
  filter: string;
  pointerEvents: string;
  position: string;
  backgroundColor: string;
};

function visibilityStyle(element: Element | null): VisibilityStyle {
  if (!element || typeof window === "undefined") {
    return {
      display: "",
      visibility: "",
      opacity: null,
      transform: "",
      contentVisibility: "",
      overflowX: "",
      overflowY: "",
      zIndex: "",
      clipPath: "",
      filter: "",
      pointerEvents: "",
      position: "",
      backgroundColor: "",
    };
  }
  try {
    const style = window.getComputedStyle(element);
    const parsedOpacity = Number.parseFloat(style.opacity);
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: Number.isFinite(parsedOpacity) ? parsedOpacity : null,
      transform: style.transform,
      contentVisibility: style.contentVisibility,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      zIndex: style.zIndex,
      clipPath: style.clipPath,
      filter: style.filter,
      pointerEvents: style.pointerEvents,
      position: style.position,
      backgroundColor: style.backgroundColor,
    };
  } catch {
    return {
      display: "",
      visibility: "",
      opacity: null,
      transform: "",
      contentVisibility: "",
      overflowX: "",
      overflowY: "",
      zIndex: "",
      clipPath: "",
      filter: "",
      pointerEvents: "",
      position: "",
      backgroundColor: "",
    };
  }
}

function styleHidesElement(style: VisibilityStyle) {
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    style.contentVisibility === "hidden" ||
    (style.opacity !== null && style.opacity < PRACTICALLY_INVISIBLE_OPACITY)
  );
}

function discussionFlowPaintReadiness(root: HTMLElement | null) {
  if (!root) return { ready: false, reason: "flow_root_missing" };
  const layers: Array<[string, Element | null]> = [
    ["renderer", root.querySelector(".react-flow__renderer")],
    ["viewport", root.querySelector(".react-flow__viewport")],
    ["node_layer", root.querySelector(".react-flow__nodes")],
  ];
  for (const [name, element] of layers) {
    if (!element) return { ready: false, reason: `${name}_missing` };
    if (styleHidesElement(visibilityStyle(element))) {
      return { ready: false, reason: `${name}_hidden` };
    }
  }
  const nodes = [...root.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")];
  for (const node of nodes) {
    for (
      let current: Element | null = node;
      current && current !== root;
      current = current.parentElement
    ) {
      if (styleHidesElement(visibilityStyle(current))) {
        return { ready: false, reason: "node_ancestor_hidden" };
      }
    }
  }
  // The intentionally transparent outer pending wrapper is above `root` and
  // is therefore excluded; only paint blockers inside this React Flow instance
  // can veto promotion.
  return { ready: true, reason: "" };
}

function safeDiagnosticClassName(element: Element | null) {
  if (!element) return "";
  return [...element.classList]
    .filter((name) => /^[A-Za-z0-9_-]{1,64}$/.test(name))
    .slice(0, 4)
    .join(" ");
}

function representativePoints(rect: VisibilityRect) {
  const insetX = Math.min(12, rect.width * 0.2);
  const insetY = Math.min(12, rect.height * 0.2);
  return [
    [rect.x + rect.width / 2, rect.y + rect.height / 2],
    [rect.x + insetX, rect.y + insetY],
    [rect.x + rect.width - insetX, rect.y + insetY],
    [rect.x + insetX, rect.y + rect.height - insetY],
    [rect.x + rect.width - insetX, rect.y + rect.height - insetY],
  ] as const;
}

function elementOwnedByDiscussionNode(node: HTMLElement, element: Element) {
  if (element === node || node.contains(element)) return true;
  const ownerID = node.dataset.id;
  if (!ownerID) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (current.getAttribute("data-discussion-node-owner-id") === ownerID) return true;
  }
  return false;
}

// modal/dialog/backdrop の典型的なマークアップ。React portalはこのcomponentの
// subtree外(多くは document.body 直下)へ描画されるため、DOM上の親子関係では
// 辿れない。
const PORTAL_OVERLAY_SELECTOR = [
  "dialog",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  "[data-discussion-tree-occluder]",
  '[class*="modal" i]',
  '[class*="overlay" i]',
  '[class*="backdrop" i]',
].join(", ");

// 議論ツリーのパネル外にあり、ツリーを覆い得る外部overlayを列挙する。
// パネル自身とその祖先は「覆う側」ではないので除外する。ノード自身とノードの
// 子孫はパネル内にあるため、この時点で構造的に候補へ入らない。
// 走査はbody直下の兄弟subtreeだけに限る。アプリ本体(=panelを含む子)には
// 立ち入らないので、ノード数が増えても計算量は増えない。
function externalPortalOverlays(panel: HTMLElement | null): HTMLElement[] {
  if (typeof document === "undefined" || !document.body || !panel) return [];
  const overlays: HTMLElement[] = [];
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.contains(panel) || panel.contains(child)) continue;
    overlays.push(child);
    for (const nested of child.querySelectorAll<HTMLElement>(PORTAL_OVERLAY_SELECTOR)) {
      overlays.push(nested);
    }
  }
  return overlays;
}

// 上の候補のうち、実際に画面を覆う見た目を持つものだけ。scriptタグや非表示の
// live regionのような常設要素を「モーダルが開いた」と数えないための絞り込み。
function overlayLikePortalElements(candidates: HTMLElement[]): HTMLElement[] {
  return candidates.filter((element) => {
    const style = visibilityStyle(element);
    if (styleHidesElement(style)) return false;
    if (!/^(?:absolute|fixed|sticky)$/.test(style.position)) return false;
    return element.matches(PORTAL_OVERLAY_SELECTOR) || element.getBoundingClientRect().width > 0;
  });
}

function nonOccludingReactFlowChrome(element: Element) {
  return Boolean(
    element.matches(".react-flow__pane") ||
    element.closest(
      ".react-flow__edge, .react-flow__edges, .react-flow__connection, .react-flow__selection, .react-flow__background",
    ),
  );
}

// elementsFromPoint intentionally omits pointer-events:none overlays. They can
// still hide the graph, so inspect positioned elements in the panel's stacking
// context without changing live DOM styles. body直下へportalされたmodal/backdrop
// も同じ理由で見る。ノード×代表点ごとに走査すると重いので、1回の可視性測定に
// つき一度だけ収集して使い回す。
function passiveOverlayCandidates(panel: HTMLElement | null): HTMLElement[] {
  return [
    ...(panel?.querySelectorAll<HTMLElement>("[data-discussion-tree-occluder]") ?? []),
    ...externalPortalOverlays(panel),
  ];
}

function pointOccluder(
  node: HTMLElement,
  x: number,
  y: number,
  passiveOverlays: HTMLElement[],
): Element | null | undefined {
  if (typeof document.elementsFromPoint !== "function") return undefined;
  const stack = document.elementsFromPoint(x, y);
  if (stack.length === 0) return undefined;
  let nodeInStack = false;
  for (const element of stack) {
    if (elementOwnedByDiscussionNode(node, element)) {
      nodeInStack = true;
      break;
    }
    if (element.contains(node)) continue;
    if (nonOccludingReactFlowChrome(element)) continue;
    if (!styleHidesElement(visibilityStyle(element))) return element;
  }
  for (const element of passiveOverlays) {
    if (
      elementOwnedByDiscussionNode(node, element) ||
      element.contains(node) ||
      nonOccludingReactFlowChrome(element)
    ) {
      continue;
    }
    const style = visibilityStyle(element);
    const paintedBackground =
      style.backgroundColor !== "" &&
      !/^(?:transparent|rgba\([^)]*,\s*0(?:\.0+)?\))$/i.test(style.backgroundColor);
    if (
      style.pointerEvents !== "none" ||
      !/^(?:absolute|fixed|sticky)$/.test(style.position) ||
      styleHidesElement(style) ||
      (!paintedBackground && (!style.filter || style.filter === "none"))
    ) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return element;
  }
  return nodeInStack ? null : (stack[0] ?? undefined);
}

function finiteGraphBounds(bounds: DiscussionRenderFrame["bounds"]): VisibilityRect | null {
  if (
    !bounds ||
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    return null;
  }
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

function measureTreeVisibility(
  root: HTMLElement | null,
  paneWidth: number,
  paneHeight: number,
  viewport: { x: number; y: number; zoom: number },
  graphBounds: DiscussionRenderFrame["bounds"],
  flowNodes: DiscussionFlowNode[],
): TreeVisibilityMeasurement {
  const safeTransform = diagnosticViewportIsSafe(viewport);
  const viewportBounds = safeTransform
    ? {
        x: -viewport.x / viewport.zoom,
        y: -viewport.y / viewport.zoom,
        width: paneWidth / viewport.zoom,
        height: paneHeight / viewport.zoom,
      }
    : null;
  const rootRect = root?.getBoundingClientRect();
  const canvasRect: VisibilityRect = {
    x: Number.isFinite(rootRect?.left) ? (rootRect?.left ?? 0) : 0,
    y: Number.isFinite(rootRect?.top) ? (rootRect?.top ?? 0) : 0,
    width: rootRect && rootRect.width > 0 ? rootRect.width : paneWidth,
    height: rootRect && rootRect.height > 0 ? rootRect.height : paneHeight,
  };
  let intersections = 0;
  let partial = 0;
  let full = 0;
  let zeroSize = 0;
  let clipped = 0;
  let hiddenByAncestor = 0;
  let occluded = 0;
  let unoccluded = 0;
  let partiallyOccluded = 0;
  let nearest = Number.POSITIVE_INFINITY;
  const elements = [...(root?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]") ?? [])];
  const passiveOverlays = passiveOverlayCandidates(
    root?.closest<HTMLElement>("[data-discussion-tree-panel]") ?? null,
  );
  const expectedNodeIDs = new Set(flowNodes.map((node) => node.id));
  const staleElements = elements.filter(
    (element) => !expectedNodeIDs.has(element.dataset.id ?? ""),
  );
  const currentElements = elements.filter((element) =>
    expectedNodeIDs.has(element.dataset.id ?? ""),
  );
  const nodeLayer = root?.querySelector<HTMLElement>(".react-flow__nodes") ?? null;
  const viewportLayer = root?.querySelector<HTMLElement>(".react-flow__viewport") ?? null;
  const renderer = root?.querySelector<HTMLElement>(".react-flow__renderer") ?? null;
  const nodeLayerStyle = visibilityStyle(nodeLayer);
  const viewportLayerStyle = visibilityStyle(viewportLayer);
  const rendererStyle = visibilityStyle(renderer);
  const nodeLayerHidden =
    nodeLayerStyle.display === "none" ||
    nodeLayerStyle.contentVisibility === "hidden" ||
    viewportLayerStyle.display === "none" ||
    rendererStyle.display === "none" ||
    rendererStyle.contentVisibility === "hidden" ||
    ((nodeLayerStyle.visibility === "hidden" || nodeLayerStyle.visibility === "collapse") &&
      viewportLayerStyle.visibility !== "hidden" &&
      viewportLayerStyle.visibility !== "collapse") ||
    ((viewportLayerStyle.visibility === "hidden" || viewportLayerStyle.visibility === "collapse") &&
      rendererStyle.visibility !== "hidden" &&
      rendererStyle.visibility !== "collapse");
  const nodeLayerTransparent = [nodeLayerStyle, viewportLayerStyle, rendererStyle].some(
    (style) => style.opacity !== null && style.opacity < PRACTICALLY_INVISIBLE_OPACITY,
  );
  let outerAncestorHidden = false;
  for (let ancestor: HTMLElement | null = root; ancestor; ancestor = ancestor.parentElement) {
    if (styleHidesElement(visibilityStyle(ancestor))) {
      outerAncestorHidden = true;
      break;
    }
    if (ancestor === document.body) break;
  }
  let ancestorHidden = outerAncestorHidden;
  let topOccluder: Element | null = null;
  for (const element of currentElements) {
    const rect = element.getBoundingClientRect();
    const nodeRect = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    if (
      !Number.isFinite(nodeRect.x) ||
      !Number.isFinite(nodeRect.y) ||
      !Number.isFinite(nodeRect.width) ||
      !Number.isFinite(nodeRect.height) ||
      nodeRect.width <= 0 ||
      nodeRect.height <= 0
    ) {
      zeroSize += 1;
      continue;
    }
    nearest = Math.min(nearest, rectangleDistance(canvasRect, nodeRect));
    if (!rectanglesIntersect(canvasRect, nodeRect)) {
      continue;
    }
    intersections += 1;
    if (rectangleContains(canvasRect, nodeRect)) {
      full += 1;
    } else {
      partial += 1;
    }
    let effectiveRect = intersectRectangles(canvasRect, nodeRect);
    let hidden = outerAncestorHidden || styleHidesElement(visibilityStyle(element));
    for (
      let ancestor = element.parentElement;
      ancestor && ancestor !== root;
      ancestor = ancestor.parentElement
    ) {
      const style = visibilityStyle(ancestor);
      if (styleHidesElement(style)) hidden = true;
      if (
        [style.overflowX, style.overflowY].some((value) =>
          /^(?:hidden|clip|scroll|auto)$/.test(value),
        )
      ) {
        const bounds = ancestor.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0 && effectiveRect) {
          effectiveRect = intersectRectangles(effectiveRect, {
            x: bounds.left,
            y: bounds.top,
            width: bounds.width,
            height: bounds.height,
          });
        }
      }
    }
    if (hidden) {
      hiddenByAncestor += 1;
      ancestorHidden = true;
      continue;
    }
    if (!effectiveRect) {
      clipped += 1;
      continue;
    }
    let checkedPoints = 0;
    let clearPoints = 0;
    for (const [x, y] of representativePoints(effectiveRect)) {
      const occluder = pointOccluder(element, x, y, passiveOverlays);
      if (occluder === undefined) continue;
      checkedPoints += 1;
      if (occluder === null) {
        clearPoints += 1;
      } else if (!topOccluder) {
        topOccluder = occluder;
      }
    }
    const blockedPoints = checkedPoints - clearPoints;
    if (checkedPoints === 0 || blockedPoints <= 1) {
      unoccluded += 1;
    } else if (blockedPoints / checkedPoints >= 0.8) {
      occluded += 1;
    } else {
      partiallyOccluded += 1;
      unoccluded += 1;
    }
  }
  const coordinates = flowNodes.flatMap((node) => [node.position.x, node.position.y]);
  const finiteCoordinates = coordinates.every(Number.isFinite);
  return {
    viewportBounds,
    graphBounds: finiteGraphBounds(graphBounds),
    visibleNodeCount: intersections,
    nodeViewportIntersectionCount: intersections,
    partiallyVisibleNodeCount: partial,
    fullyVisibleNodeCount: full,
    zeroSizeNodeCount: zeroSize,
    clippedNodeCount: clipped,
    hiddenByAncestorNodeCount: hiddenByAncestor,
    occludedNodeCount: occluded,
    unoccludedVisibleNodeCount: unoccluded,
    partiallyOccludedNodeCount: partiallyOccluded,
    staleDomNodeCount: staleElements.length,
    currentDomNodeCount: currentElements.length,
    nodeLayerDisplay: nodeLayerStyle.display,
    nodeLayerVisibility: nodeLayerStyle.visibility,
    nodeLayerOpacity: nodeLayerStyle.opacity,
    nodeLayerTransform: nodeLayerStyle.transform,
    viewportLayerDisplay: viewportLayerStyle.display,
    viewportLayerVisibility: viewportLayerStyle.visibility,
    viewportLayerOpacity: viewportLayerStyle.opacity,
    viewportLayerTransform: viewportLayerStyle.transform,
    rendererDisplay: rendererStyle.display,
    rendererVisibility: rendererStyle.visibility,
    rendererOpacity: rendererStyle.opacity,
    topOccludingElementTag: topOccluder?.tagName.toLowerCase() ?? "",
    topOccludingElementClass: safeDiagnosticClassName(topOccluder),
    topOccludingElementZIndex: visibilityStyle(topOccluder).zIndex,
    ancestorHidden,
    nodeLayerHidden,
    nodeLayerTransparent,
    nearestNodeDistanceFromViewport: Number.isFinite(nearest) ? nearest : null,
    reactFlowTransform: viewport,
    nodeCoordinateRange:
      flowNodes.length > 0 && finiteCoordinates
        ? {
            minX: Math.min(...flowNodes.map((node) => node.position.x)),
            maxX: Math.max(...flowNodes.map((node) => node.position.x)),
            minY: Math.min(...flowNodes.map((node) => node.position.y)),
            maxY: Math.max(...flowNodes.map((node) => node.position.y)),
          }
        : null,
  };
}

function treeVisibilityHealth(input: {
  canonicalNodeCount: number;
  reactFlowNodeCount: number;
  renderedDomNodeCount: number;
  paneWidth: number;
  paneHeight: number;
  panelVisible: boolean;
  layoutCompleted: boolean;
  renderCommitted: boolean;
  // 表示対象nodeが実測済みか。React Flowの集約フラグではなく表示buffer単位の
  // 実測状況を使う(集約フラグはnodesプロップ更新でしか再計算されないため)。
  displayedNodesMeasured: boolean;
  nodesInitializationGraceActive: boolean;
  viewport: { x: number; y: number; zoom: number };
  measurement: TreeVisibilityMeasurement;
}): TreeVisibilityHealth {
  if (input.canonicalNodeCount === 0) return "empty_tree_expected";
  if (input.reactFlowNodeCount === 0) return "empty_tree_unexpected";
  if (!input.panelVisible) return "container_hidden";
  if (input.paneWidth <= 0 || input.paneHeight <= 0) return "container_zero_size";
  if (!input.layoutCompleted) return "layout_incomplete";
  if (!diagnosticViewportIsSafe(input.viewport)) return "invalid_transform";
  if (!input.measurement.graphBounds || !input.measurement.nodeCoordinateRange) {
    return "invalid_node_coordinates";
  }
  if (input.measurement.nodeLayerHidden) return "node_layer_hidden";
  if (input.measurement.nodeLayerTransparent) return "node_layer_transparent";
  if (input.measurement.ancestorHidden) return "ancestor_hidden";
  if (input.measurement.staleDomNodeCount > 0 && input.measurement.currentDomNodeCount === 0) {
    return "stale_dom_only";
  }
  if (!input.renderCommitted) return "render_not_committed";
  if (!input.displayedNodesMeasured) {
    return input.nodesInitializationGraceActive ? "render_not_committed" : "nodes_not_initialized";
  }
  if (
    input.renderedDomNodeCount > 0 &&
    input.measurement.zeroSizeNodeCount === input.renderedDomNodeCount
  ) {
    return "zero_size_nodes";
  }
  if (input.measurement.nodeViewportIntersectionCount === 0) {
    return "nodes_exist_but_offscreen";
  }
  if (
    input.measurement.clippedNodeCount > 0 &&
    input.measurement.unoccludedVisibleNodeCount === 0
  ) {
    return "nodes_clipped";
  }
  if (input.measurement.unoccludedVisibleNodeCount === 0) {
    return "nodes_exist_but_fully_occluded";
  }
  return "healthy_visible";
}

function useDiscussionTreeCanvasSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const update = (width: number, height: number) => {
      const next = {
        width: Number.isFinite(width) ? Math.max(0, width) : 0,
        height: Number.isFinite(height) ? Math.max(0, height) : 0,
      };
      setSize((current) =>
        current?.width === next.width && current.height === next.height ? current : next,
      );
    };
    const initial = element.getBoundingClientRect();
    update(initial.width, initial.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === element);
      if (entry) {
        update(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function DiscussionFlow({
  sessionId = "",
  workspaceId = "",
  nodes,
  edges,
  analysisItems,
  segments,
  onSelectAnalysisItem,
  layoutSignal,
  focusItemRequest,
  treeChanges,
  analysisVersion = null,
  treeVersion = null,
  treeHash,
  observedCanvasSize,
  snapshotRole,
  bufferSlot,
  providerInstanceId,
  snapshotGeneration,
  layoutRevision,
  metadataRevision,
  preservedViewport,
  viewportInteractionActive,
  programmaticViewportMoveActive,
  manualResetActive,
  onPendingReady,
  onPendingFailed,
  onCommittedViewportChange,
  onViewportInteractionChange,
  onProgrammaticViewportMoveChange,
  onManualResetActiveChange,
  hydrationKind,
  selectedId,
  selectionRevision,
  focusedId,
  pendingFocusTargetId,
  selectNode,
  onFocusSettled,
  onPendingFocusTargetConsumed,
  hoveredId,
  setHoveredId,
  autoFollow,
  setAutoFollow,
  collapsed,
  setCollapsed,
  lastManualInteractionAtRef,
  lastAutoFocusAtRef,
  manualResetInProgressRef,
  manualResetRequestIdRef,
  lastManualResetAtRef,
  processedFocusTokenRef,
}: DiscussionTreeProps & {
  observedCanvasSize: { width: number; height: number } | null;
  snapshotRole: DiscussionTreeSnapshotRole;
  bufferSlot: DiscussionTreeBufferSlot;
  providerInstanceId: string;
  snapshotGeneration: number;
  layoutRevision: string;
  metadataRevision: string;
  preservedViewport: { x: number; y: number; zoom: number };
  viewportInteractionActive: boolean;
  programmaticViewportMoveActive: boolean;
  manualResetActive: boolean;
  onPendingReady: (readiness: DiscussionTreeRuntimeReadiness) => boolean;
  onPendingFailed: (
    generation: number,
    reason: string,
    readiness: DiscussionTreeFailureReadiness,
  ) => void;
  onCommittedViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
  onViewportInteractionChange: (active: boolean) => void;
  onProgrammaticViewportMoveChange: (slot: DiscussionTreeBufferSlot, active: boolean) => void;
  onManualResetActiveChange: (active: boolean) => void;
  hydrationKind: DiscussionTreeHydrationKind;
  selectedId: string | null;
  selectionRevision: number;
  focusedId: string | null;
  pendingFocusTargetId: string | null;
  selectNode: (nodeId: string | null, options: { focus: boolean; source: string }) => void;
  onFocusSettled: (nodeId: string, selectionRevision: number) => void;
  onPendingFocusTargetConsumed: (nodeId: string) => void;
  hoveredId: string | null;
  setHoveredId: React.Dispatch<React.SetStateAction<string | null>>;
  autoFollow: boolean;
  setAutoFollow: React.Dispatch<React.SetStateAction<boolean>>;
  collapsed: Set<string>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastManualInteractionAtRef: React.MutableRefObject<number>;
  lastAutoFocusAtRef: React.MutableRefObject<number>;
  manualResetInProgressRef: React.MutableRefObject<boolean>;
  manualResetRequestIdRef: React.MutableRefObject<number>;
  lastManualResetAtRef: React.MutableRefObject<number>;
  processedFocusTokenRef: React.MutableRefObject<number | null>;
}) {
  const committedSnapshot = snapshotRole === "committed";
  const pendingSnapshot = snapshotRole === "pending";
  const committedSnapshotRef = useRef(committedSnapshot);
  committedSnapshotRef.current = committedSnapshot;
  const flowInstanceIdRef = useRef("");
  if (!flowInstanceIdRef.current) {
    discussionFlowInstanceSequence += 1;
    flowInstanceIdRef.current = `${sessionId || "anonymous"}:${discussionFlowInstanceSequence}`;
  }
  const [pendingAutoFocusIds, setPendingAutoFocusIds] = useState<string[]>([]);
  const [queuedAutoFocusIds, setQueuedAutoFocusIds] = useState<string[]>([]);
  const [structuralHighlightIds, setStructuralHighlightIds] = useState<Set<string>>(
    () => new Set(),
  );
  const previousStructuralNodesRef = useRef<TreeNodePayload[] | null>(null);
  const processedTreeChangeRef = useRef<string | null>(null);
  const userInteractionActiveRef = useRef(false);
  const [viewportObservationEpoch, setViewportObservationEpoch] = useState(0);
  const didInitialFitRef = useRef(false);
  const autoMovingRef = useRef(false);
  const structuralHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const automaticRecoveryActiveRef = useRef(false);
  // viewport操作は「開始したら必ず終わる」とは限らない。React Flowがduration付き
  // の移動で返すPromiseはd3-zoomのtransitionに紐づいており、別の移動に割り込まれる
  // と 'end' が発火せず永久にsettleしない。単純な深さカウンタでは、この取りこぼしが
  // 一度でも起きるとactive状態が二度と解除されず、準備済みのpending treeを昇格
  // できなくなる。そのため操作ごとにidとgenerationを持たせ、後発の操作は先行操作を
  // supersedeして即座に退役させ、遅れて届いた完了はstaleとして破棄する。
  const viewportOperationGenerationRef = useRef(0);
  const liveViewportOperationRef = useRef<ViewportOperation | null>(null);
  const viewportOperationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportOperationMountedRef = useRef(true);
  const viewportOperationContextRef = useRef({ treeVersion, layoutRevision });
  viewportOperationContextRef.current = { treeVersion, layoutRevision };
  // focus操作の妥当性判定は選択側の最新値を参照する。propsを直接読むと非同期
  // 完了時点の値が古くなり、別ノードを選択したあとの完了を受理してしまう。
  const selectionStateRef = useRef({ selectedId, selectionRevision });
  selectionStateRef.current = { selectedId, selectionRevision };
  const viewportOperationDiagnosticsRef = useRef({
    sessionId,
    workspaceId,
    analysisVersion,
    nodeCount: nodes.length,
  });
  viewportOperationDiagnosticsRef.current = {
    sessionId,
    workspaceId,
    analysisVersion,
    nodeCount: nodes.length,
  };
  const recordViewportOperationPhase = useCallback(
    (phase: string, operation: ViewportOperation, extra: Record<string, unknown> = {}) => {
      const context = viewportOperationDiagnosticsRef.current;
      recordDiagnosticEvent("tree_render_state", {
        sessionId: context.sessionId,
        workspaceId: context.workspaceId,
        treeVersion: operation.treeVersion,
        analysisVersion: context.analysisVersion,
        nodeCount: context.nodeCount,
        details: {
          phase,
          viewportOperationId: operation.operationId,
          viewportGeneration: operation.generation,
          viewportOperationSource: operation.source,
          viewportOperationTreeVersion: operation.treeVersion,
          viewportOperationLayoutRevision: operation.layoutRevision,
          viewportOperationStartedAt: new Date(operation.startedAt).toISOString(),
          viewportOperationElapsedMs: Math.max(0, Date.now() - operation.startedAt),
          bufferSlot: operation.bufferSlot,
          focusRequestId: operation.focusRequestId,
          focusTargetNodeId: operation.focusTargetNodeId,
          selectionRevision: operation.selectionRevision,
          currentSelectedNodeId: selectionStateRef.current.selectedId,
          currentSelectionRevision: selectionStateRef.current.selectionRevision,
          source: operation.source,
          userViewportInteractionActive: userInteractionActiveRef.current,
          programmaticViewportMoveActive: liveViewportOperationRef.current !== null,
          manualResetActive: manualResetInProgressRef.current,
          automaticRecoveryActive: automaticRecoveryActiveRef.current,
          ...extra,
        },
      });
    },
    [bufferSlot, manualResetInProgressRef],
  );
  const retireViewportOperation = useCallback(
    (operation: ViewportOperation, phase: string, extra: Record<string, unknown> = {}) => {
      if (liveViewportOperationRef.current?.operationId !== operation.operationId) {
        return false;
      }
      liveViewportOperationRef.current = null;
      if (viewportOperationTimerRef.current) {
        clearTimeout(viewportOperationTimerRef.current);
        viewportOperationTimerRef.current = null;
      }
      onProgrammaticViewportMoveChange(bufferSlot, false);
      recordViewportOperationPhase(phase, operation, extra);
      return true;
    },
    [bufferSlot, onProgrammaticViewportMoveChange, recordViewportOperationPhase],
  );
  const beginViewportOperation = useCallback(
    (source: string, expectedDurationMs = 0, focusTargetNodeId: string | null = null) => {
      const superseded = liveViewportOperationRef.current;
      discussionViewportOperationSequence += 1;
      viewportOperationGenerationRef.current += 1;
      if (focusTargetNodeId !== null) {
        discussionFocusRequestSequence += 1;
      }
      const operation: ViewportOperation = {
        operationId: discussionViewportOperationSequence,
        generation: viewportOperationGenerationRef.current,
        source,
        treeVersion: viewportOperationContextRef.current.treeVersion,
        layoutRevision: viewportOperationContextRef.current.layoutRevision,
        startedAt: Date.now(),
        bufferSlot,
        focusRequestId: focusTargetNodeId === null ? null : discussionFocusRequestSequence,
        focusTargetNodeId,
        selectionRevision: selectionStateRef.current.selectionRevision,
      };
      if (viewportOperationTimerRef.current) {
        clearTimeout(viewportOperationTimerRef.current);
        viewportOperationTimerRef.current = null;
      }
      liveViewportOperationRef.current = operation;
      if (superseded) {
        // 先行操作はここで退役済み。以後その完了が届いてもstaleとして無視される。
        recordViewportOperationPhase(
          superseded.focusTargetNodeId === null
            ? "viewport_operation_superseded"
            : "focus_operation_superseded",
          superseded,
          {
            supersededByOperationId: operation.operationId,
            supersededBySource: source,
            supersededByFocusTargetNodeId: focusTargetNodeId,
          },
        );
      }
      // 割り込みで完了通知が失われた操作を、そのid限定で打ち切る安全網。
      // 無条件にfalseへ倒すのではなく、いまなおliveな同一操作だけを退役させる。
      viewportOperationTimerRef.current = setTimeout(
        () => {
          viewportOperationTimerRef.current = null;
          const live = liveViewportOperationRef.current;
          if (!live || live.operationId !== operation.operationId) return;
          retireViewportOperation(
            operation,
            operation.focusTargetNodeId === null
              ? "viewport_operation_cancelled"
              : "focus_operation_cancelled",
            { cancelReason: "settle_timeout" },
          );
        },
        Math.max(0, expectedDurationMs) + VIEWPORT_OPERATION_SETTLE_MARGIN_MS,
      );
      onProgrammaticViewportMoveChange(bufferSlot, true);
      recordViewportOperationPhase(
        operation.focusTargetNodeId === null
          ? "viewport_operation_started"
          : "focus_operation_started",
        operation,
      );
      return operation;
    },
    [
      bufferSlot,
      onProgrammaticViewportMoveChange,
      recordViewportOperationPhase,
      retireViewportOperation,
    ],
  );
  // 共有stateを書き換えてよいかどうか。generation・mount・対象tree/layoutに加え、
  // focus操作は「その操作を始めた選択がいまも現在の選択か」まで満たすときだけ
  // 更新してよい。treeVersionとlayoutRevisionが同じでも対象nodeが違えば別物。
  const viewportOperationIsCurrent = useCallback(
    (operation: ViewportOperation) =>
      viewportOperationMountedRef.current &&
      liveViewportOperationRef.current?.operationId === operation.operationId &&
      operation.generation === viewportOperationGenerationRef.current &&
      operation.treeVersion === viewportOperationContextRef.current.treeVersion &&
      operation.layoutRevision === viewportOperationContextRef.current.layoutRevision &&
      (operation.focusTargetNodeId === null ||
        (operation.focusTargetNodeId === selectionStateRef.current.selectedId &&
          operation.selectionRevision === selectionStateRef.current.selectionRevision)),
    [],
  );
  const completeViewportOperation = useCallback(
    (operation: ViewportOperation, extra: Record<string, unknown> = {}) => {
      if (!viewportOperationIsCurrent(operation)) {
        recordViewportOperationPhase(
          operation.focusTargetNodeId === null
            ? "viewport_operation_stale_completion_ignored"
            : "focus_operation_stale_completion_ignored",
          operation,
          {
            ...extra,
            liveViewportOperationId: liveViewportOperationRef.current?.operationId ?? null,
            currentViewportGeneration: viewportOperationGenerationRef.current,
            currentTreeVersion: viewportOperationContextRef.current.treeVersion,
            mounted: viewportOperationMountedRef.current,
          },
        );
        return false;
      }
      retireViewportOperation(
        operation,
        operation.focusTargetNodeId === null
          ? "viewport_operation_completed"
          : "focus_operation_completed",
        extra,
      );
      return true;
    },
    [recordViewportOperationPhase, retireViewportOperation, viewportOperationIsCurrent],
  );
  // 別ノードを選んだ/選択を解除した時点で、前ノード向けfocus操作は即座に退役
  // させる。以後その完了・reject・timeoutが届いても、現在のviewportや選択には
  // 触れない(completeViewportOperationのcurrency判定で弾かれる)。
  useEffect(() => {
    const live = liveViewportOperationRef.current;
    if (!live || live.focusTargetNodeId === null) {
      return;
    }
    if (live.focusTargetNodeId === selectedId && live.selectionRevision === selectionRevision) {
      return;
    }
    retireViewportOperation(live, "focus_operation_superseded", {
      supersedeReason: selectedId === null ? "selection_cleared" : "selection_changed",
      nextSelectedNodeId: selectedId,
      nextSelectionRevision: selectionRevision,
    });
  }, [retireViewportOperation, selectedId, selectionRevision]);
  useEffect(() => {
    viewportOperationMountedRef.current = true;
    return () => {
      viewportOperationMountedRef.current = false;
      const live = liveViewportOperationRef.current;
      liveViewportOperationRef.current = null;
      if (viewportOperationTimerRef.current) {
        clearTimeout(viewportOperationTimerRef.current);
        viewportOperationTimerRef.current = null;
      }
      // unmount後のcallbackは無視される。activeの持ち越しだけは必ず解除する。
      if (live) onProgrammaticViewportMoveChange(bufferSlot, false);
    };
  }, [bufferSlot, onProgrammaticViewportMoveChange]);
  // 対象treeVersion/layoutRevisionが変わった操作、およびこのbufferがcommitted
  // でなくなったときの操作は、もはや現在の表示に対する操作ではない。
  useEffect(() => {
    const live = liveViewportOperationRef.current;
    if (!live) return;
    if (
      live.treeVersion === treeVersion &&
      live.layoutRevision === layoutRevision &&
      committedSnapshot
    ) {
      return;
    }
    retireViewportOperation(live, "viewport_operation_cancelled", {
      cancelReason: committedSnapshot ? "target_tree_changed" : "buffer_role_changed",
      currentTreeVersion: treeVersion,
    });
  }, [committedSnapshot, layoutRevision, retireViewportOperation, treeVersion]);
  const { fitView, getNode, getViewport, setCenter, setViewport } = useReactFlow();
  const setCenterAndPublishViewport = useCallback(
    async (
      x: number,
      y: number,
      options: { zoom?: number; duration?: number },
    ): Promise<boolean> => {
      try {
        // duration付きのsetCenterはd3のtransitionに紐づき、割り込まれると永久に
        // settleしない。呼び出し側のfinallyを必ず走らせるため上限を設ける。
        const applied = await withSettleTimeout(
          Promise.resolve(setCenter(x, y, options)),
          (options.duration ?? 0) + VIEWPORT_OPERATION_SETTLE_MARGIN_MS,
          false,
        );
        if (!applied || !committedSnapshotRef.current) {
          return Boolean(applied);
        }
        // Programmatic moves report onMoveEnd with event=null. Publish the
        // settled viewport explicitly so the next pending buffer inherits the
        // user's actual focus instead of an older outer-state snapshot.
        const viewport = getViewport();
        if (diagnosticViewportIsSafe(viewport)) {
          onCommittedViewportChange(viewport);
          setViewportObservationEpoch((current) => current + 1);
        }
        return true;
      } catch {
        return false;
      }
    },
    [getViewport, onCommittedViewportChange, setCenter],
  );
  const updateNodeInternals = useUpdateNodeInternals();
  const reactFlowPaneWidth = useStore((state) => state.width);
  const reactFlowPaneHeight = useStore((state) => state.height);
  const reactFlowInternalNodeCount = useStore((state) => state.nodeLookup.size);
  const reactFlowInternalEdgeCount = useStore((state) => state.edgeLookup.size);
  const reactFlowInternalNodeIdSignature = useStore((state) =>
    [...state.nodeLookup.keys()].sort().join("\0"),
  );
  const reactFlowMeasuredNodeIdSignature = useStore((state) =>
    [...state.nodeLookup.entries()]
      .filter(([, node]) => {
        const width = node.measured?.width;
        const height = node.measured?.height;
        return (
          typeof width === "number" &&
          Number.isFinite(width) &&
          width > 0 &&
          typeof height === "number" &&
          Number.isFinite(height) &&
          height > 0
        );
      })
      .map(([id]) => id)
      .sort()
      .join("\0"),
  );
  const reactFlowMeasuredNodeCount = reactFlowMeasuredNodeIdSignature
    ? reactFlowMeasuredNodeIdSignature.split("\0").length
    : 0;
  // Controlled nodes do not receive React Flow's measured dimensions back in
  // internals.userNode. includeHiddenNodes=true inspects that user object and
  // therefore stayed false forever even after the internal nodes were measured.
  // The store-owned default selector is the correct readiness signal here.
  const reactFlowNodesInitialized = useNodesInitialized();
  const [nodesInitializationFrame, setNodesInitializationFrame] = useState(0);
  useEffect(() => {
    if (reactFlowNodesInitialized) {
      setNodesInitializationFrame(NODE_INITIALIZATION_GRACE_FRAMES);
      return;
    }
    let cancelled = false;
    let animationFrame = 0;
    let observedFrames = 0;
    setNodesInitializationFrame(0);
    const observeNextFrame = () => {
      animationFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        observedFrames += 1;
        setNodesInitializationFrame(observedFrames);
        if (observedFrames < NODE_INITIALIZATION_GRACE_FRAMES) observeNextFrame();
      });
    };
    observeNextFrame();
    return () => {
      cancelled = true;
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
    };
  }, [reactFlowInternalNodeIdSignature, reactFlowNodesInitialized]);
  const nodesInitializationGraceActive =
    !reactFlowNodesInitialized && nodesInitializationFrame < NODE_INITIALIZATION_GRACE_FRAMES;
  // React Flow v12は実DOMが0x0でも内部storeへ500x500をfallback設定する。
  // 外側canvasのResizeObserver値を正本にし、未対応環境だけ内部storeへfallbackする。
  const paneWidth = observedCanvasSize?.width ?? reactFlowPaneWidth;
  const paneHeight = observedCanvasSize?.height ?? reactFlowPaneHeight;
  const lastGoodLayoutRef = useRef(new Map<string, { x: number; y: number }>());
  const analysisItemIds = useMemo(
    () => new Set((analysisItems ?? []).map((item) => item.id)),
    [analysisItems],
  );
  const displayTree = useMemo(
    () => stageTentativeTree(nodes, edges, analysisItems ?? []),
    [nodes, edges, analysisItems],
  );
  const propDuplicateNodeIds = useMemo(
    () => uniqueDiscussionTreeNodes(nodes).duplicateNodeIds,
    [nodes],
  );
  const displayNodes = displayTree.nodes;
  const displayEdges = displayTree.edges;

  const treeEdges = useMemo(
    () => normalizeEdges(displayNodes, displayEdges),
    [displayNodes, displayEdges],
  );
  const discussionModel = useMemo(
    () => buildDiscussionTreeModel(displayNodes, treeEdges),
    [displayNodes, treeEdges],
  );

  const momentIndex = useMemo(() => buildMeetingMomentIndex(segments ?? []), [segments]);
  const agendaLabels = useMemo(() => buildAgendaLabelMap(displayNodes), [displayNodes]);

  const recentlyUpdatedIds = useRecentlyUpdatedNodeIds(displayNodes);

  const markManualInteraction = useCallback(() => {
    lastManualInteractionAtRef.current = Date.now();
  }, []);

  const toggleCollapse = useCallback(
    (id: string) => {
      markManualInteraction();
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [markManualInteraction],
  );

  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    for (const node of displayNodes) {
      if (isNodeVisible(discussionModel, collapsed, node.id)) {
        visible.add(node.id);
      }
    }
    return visible;
  }, [displayNodes, discussionModel, collapsed]);

  const visibleNodes = useMemo(
    () => displayNodes.filter((node) => visibleIds.has(node.id)),
    [displayNodes, visibleIds],
  );
  const visibleEdges = useMemo(
    () => treeEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [treeEdges, visibleIds],
  );
  const orderedVisibleNodes = useMemo(
    () => orderDiscussionTreeNodesParentFirst(visibleNodes, visibleEdges),
    [visibleEdges, visibleNodes],
  );

  // フォーカス強調(選択時): 選択ノード自身 + 直接の親 + 直接の子。
  const focusIds = useMemo(() => {
    if (selectedId === null) {
      return null;
    }
    const ids = new Set<string>([selectedId]);
    const parent = discussionModel.parentOf.get(selectedId);
    if (parent) {
      ids.add(parent);
    }
    for (const childId of discussionModel.childrenOf.get(selectedId) ?? []) {
      ids.add(childId);
    }
    return ids;
  }, [selectedId, discussionModel]);

  // 「active」= ノード一覧の末尾(最新)ノード。折りたたみで非表示になっていても
  // 他ノードへ付け替わらないよう、可視ノードに絞る前のidで判定する。
  const lastNodeId = displayNodes.length > 0 ? displayNodes[displayNodes.length - 1].id : null;

  const collapsedLayoutRevision = [...collapsed].sort().join("\0");
  const layoutResult = useMemo(
    () => layoutDiscussionTree(orderedVisibleNodes, visibleEdges, lastGoodLayoutRef.current),
    // Metadata changes do not alter Dagre input. The explicit structural
    // revision and collapse state are the only layout invalidators.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutRevision, collapsedLayoutRevision],
  );
  useEffect(() => {
    if (!layoutResult.usedFallback && layoutResult.outputNodeCount > 0) {
      lastGoodLayoutRef.current = new Map(layoutResult.positions);
    }
  }, [layoutResult]);

  const nextFlowNodes = useMemo<DiscussionFlowNode[]>(() => {
    return orderedVisibleNodes.map((node, index) => {
      const kindCounts = discussionModel.descendantKindCounts.get(node.id) ?? {};
      return {
        id: node.id,
        type: "discussion",
        position: layoutResult.positions.get(node.id) ?? { x: 0, y: index * (NODE_HEIGHT + 24) },
        // Initial dimensions let Dagre/React Flow render deterministically,
        // while `measured` and handleBounds remain owned by the actual DOM
        // measurement lifecycle used by the pending-readiness gate.
        initialWidth: NODE_WIDTH,
        initialHeight: NODE_HEIGHT,
        selected: node.id === selectedId,
        data: {
          id: node.id,
          tag: node.kind ?? "topic",
          subtype: node.subtype ?? "",
          status: node.status ?? "",
          speaker: node.speaker_label ?? "",
          label: humanizeAgendaReferences(node.label ?? node.id, agendaLabels),
          description: humanizeAgendaReferences(node.description ?? "", agendaLabels),
          momentLabel: treeNodeMomentLabel(node, analysisItems ?? [], momentIndex),
          relatedCount: relatedItemIdsForNode(node, analysisItemIds).length,
          active: node.id === lastNodeId,
          hasChildren: (discussionModel.childrenOf.get(node.id) ?? []).length > 0,
          childCount: (discussionModel.childrenOf.get(node.id) ?? []).length,
          collapsed: collapsed.has(node.id),
          onToggleCollapse: toggleCollapse,
          childKindCounts: sortedKindCounts(kindCounts),
          dimmed: focusIds !== null && !focusIds.has(node.id),
          recentlyUpdated: recentlyUpdatedIds.has(node.id) || structuralHighlightIds.has(node.id),
        },
      };
    });
  }, [
    orderedVisibleNodes,
    layoutResult,
    discussionModel,
    selectedId,
    analysisItemIds,
    lastNodeId,
    collapsed,
    toggleCollapse,
    focusIds,
    recentlyUpdatedIds,
    structuralHighlightIds,
    agendaLabels,
    analysisItems,
    momentIndex,
  ]);
  const stableFlowNodesRef = useRef(new Map<string, DiscussionFlowNode>());
  const flowNodes = useMemo(() => {
    const previous = stableFlowNodesRef.current;
    const next = new Map<string, DiscussionFlowNode>();
    const reconciled = nextFlowNodes.map((node) => {
      const prior = previous.get(node.id);
      const stable = prior && discussionFlowNodeEquivalent(prior, node) ? prior : node;
      next.set(node.id, stable);
      return stable;
    });
    stableFlowNodesRef.current = next;
    return reconciled;
  }, [nextFlowNodes]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      visibleEdges.map((edge) => {
        const highlighted =
          selectedId !== null && (edge.source === selectedId || edge.target === selectedId);
        const dimmedEdge = selectedId !== null && !highlighted;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: highlighted,
          style: {
            stroke: highlighted ? "var(--brand)" : "var(--indent-line)",
            strokeWidth: highlighted ? 2 : 1.5,
            opacity: dimmedEdge ? 0.35 : 1,
          },
        };
      }),
    [visibleEdges, selectedId],
  );

  // React Flow is intentionally an edge-only graph: domain parentId feeds
  // normalizeEdges/Dagre but is never copied to the React Flow node.parentId.
  // Dagre positions therefore remain absolute canvas coordinates; no sub-flow
  // relative-coordinate conversion or parent sizing is involved.
  const candidateFrame = useMemo<DiscussionRenderFrame>(() => {
    const signature = [
      treeVersion ?? "none",
      treeHash ?? "no-hash",
      `${paneWidth}x${paneHeight}`,
      flowNodes.map((node) => `${node.id}@${node.position.x},${node.position.y}`).join(","),
      flowEdges.map((edge) => `${edge.source}>${edge.target}`).join(","),
    ].join("|");
    return {
      signature,
      nodes: flowNodes,
      edges: flowEdges,
      bounds: layoutResult.bounds,
      viewport: { x: 0, y: 0, zoom: 1 },
      treeVersion,
      treeHash: treeHash ?? null,
    };
  }, [flowEdges, flowNodes, layoutResult.bounds, paneHeight, paneWidth, treeHash, treeVersion]);
  const missingEdgeEndpointCount = useMemo(() => {
    const ids = new Set(nodes.map((node) => node.id));
    return edges.filter((edge) => !ids.has(edge.source) || !ids.has(edge.target)).length;
  }, [edges, nodes]);
  const candidateFrameInvalidReasons = useMemo(() => {
    const reasons: string[] = [];
    if (layoutResult.layoutError) reasons.push("layout_error");
    if (layoutResult.invalidPositionNodeIds.length > 0) reasons.push("invalid_position");
    if (layoutResult.missingParentNodeIds.length > 0) reasons.push("missing_parent");
    if (layoutResult.unreachableNodeIds.length > 0) reasons.push("unreachable_node");
    if (layoutResult.cycleDetected) reasons.push("cycle");
    if (propDuplicateNodeIds.length > 0) reasons.push("duplicate_node");
    if (missingEdgeEndpointCount > 0) reasons.push("missing_edge_endpoint");
    if (layoutResult.outputNodeCount !== flowNodes.length) reasons.push("node_count_mismatch");
    if (layoutResult.bounds === null) reasons.push("invalid_bounds");
    const rootNodeId = discussionTreeRootNodeId(nodes);
    if (nodes.length > 0 && !displayNodes.some((node) => node.id === rootNodeId)) {
      reasons.push("root_filtered_out");
    }
    if (orderedVisibleNodes.length > 0 && layoutResult.outputNodeCount === 0) {
      reasons.push("layout_output_empty");
    }
    return reasons;
  }, [
    displayNodes,
    flowNodes.length,
    layoutResult,
    missingEdgeEndpointCount,
    nodes,
    orderedVisibleNodes.length,
    propDuplicateNodeIds.length,
  ]);
  const lastGoodRenderFrameRef = useRef<DiscussionRenderFrame | null>(null);
  const lastGoodRenderFrameSessionRef = useRef(sessionId);
  const [syncRejectedSignature, setSyncRejectedSignature] = useState<string | null>(null);
  const flowRootRef = useRef<HTMLDivElement>(null);
  const [renderedDomNodeCount, setRenderedDomNodeCount] = useState(0);
  const renderedDomObservationSignatureRef = useRef("");
  const syncObservationRef = useRef({
    internalNodeCount: reactFlowInternalNodeCount,
    internalEdgeCount: reactFlowInternalEdgeCount,
    nodesInitialized: reactFlowNodesInitialized,
    displayedNodesMeasured: false,
    renderedDomNodeCount,
  });
  const lastHealthyTreeVersionRef = useRef<number | null>(null);
  const lastHealthyRenderRef = useRef<{
    canonicalNodeCount: number;
    reactFlowNodeCount: number;
    renderedDomNodeCount: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);
  const lastHealthyVisibilityRef = useRef<{
    viewport: { x: number; y: number; zoom: number };
    graphBounds: VisibilityRect | null;
    visibleNodeCount: number;
    treeVersion: number | null;
    renderTimestamp: string;
    frameSignature: string;
  } | null>(null);
  const lastVisibilityHealthRef = useRef<TreeVisibilityHealth | null>(null);
  const lastLKGDecisionRef = useRef("not_evaluated");
  const healthyDiagnosticSignatureRef = useRef("");
  const anomalyDiagnosticSignatureRef = useRef("");
  const lastVisibilityDiagnosticStateRef = useRef("");
  const zeroSizeObservedRef = useRef(false);
  const canvasUnavailable = paneWidth <= 0 || paneHeight <= 0;
  const frameRejected =
    candidateFrameInvalidReasons.length > 0 ||
    canvasUnavailable ||
    syncRejectedSignature === candidateFrame.signature;
  const lastGoodRenderFrame =
    lastGoodRenderFrameSessionRef.current === sessionId ? lastGoodRenderFrameRef.current : null;
  const usingLastGoodFrame = Boolean(lastGoodRenderFrame && frameRejected);
  const renderedFrame =
    usingLastGoodFrame && lastGoodRenderFrame ? lastGoodRenderFrame : candidateFrame;
  const renderedFlowNodes = renderedFrame.nodes;
  const renderedFlowEdges = renderedFrame.edges;
  const renderedBounds = renderedFrame.bounds;
  // 実際にReact Flowへ渡した表示対象nodeが計測済みか。React Flowの集約フラグ
  // (nodesInitialized)はnodesプロップ更新でしか再計算されないため、確定した
  // ツリーを表示し続ける画面ではfalseのまま固定される。表示単位のこの判定を
  // 描画健全性・LKG採用の正本にする。
  const renderedNodeIdSignature = useMemo(
    () =>
      renderedFlowNodes
        .map((node) => node.id)
        .sort()
        .join("\0"),
    [renderedFlowNodes],
  );
  const renderedNodesMeasured =
    renderedFlowNodes.length > 0 && reactFlowMeasuredNodeIdSignature === renderedNodeIdSignature;
  syncObservationRef.current = {
    internalNodeCount: reactFlowInternalNodeCount,
    internalEdgeCount: reactFlowInternalEdgeCount,
    nodesInitialized: reactFlowNodesInitialized,
    displayedNodesMeasured: renderedNodesMeasured,
    renderedDomNodeCount,
  };
  const renderDiagnosticDetails = useCallback(
    (
      reason: string,
      observation = syncObservationRef.current,
      viewport = getViewport(),
      renderCommitted = false,
    ) => {
      const root = flowRootRef.current;
      const canvasRect = root?.getBoundingClientRect();
      const panel = root?.closest<HTMLElement>("[data-discussion-tree-panel]") ?? null;
      let cssDisplay = "";
      let cssVisibility = "";
      let cssOpacity = "";
      try {
        const style =
          panel && typeof window !== "undefined" ? window.getComputedStyle(panel) : null;
        cssDisplay = style?.display ?? "";
        cssVisibility = style?.visibility ?? "";
        cssOpacity = style?.opacity ?? "";
      } catch {
        // CSS inspection is diagnostic-only and must never affect rendering.
      }
      const lastHealthy = lastHealthyRenderRef.current;
      const safeViewport = diagnosticViewportIsSafe(viewport);
      const panelVisible =
        cssDisplay !== "none" &&
        cssVisibility !== "hidden" &&
        cssOpacity !== "0" &&
        paneWidth > 0 &&
        paneHeight > 0;
      const visibility = measureTreeVisibility(
        root,
        paneWidth,
        paneHeight,
        viewport,
        renderedBounds,
        renderedFlowNodes,
      );
      const visibilityHealth = treeVisibilityHealth({
        canonicalNodeCount: nodes.length,
        reactFlowNodeCount: renderedFlowNodes.length,
        renderedDomNodeCount: observation.renderedDomNodeCount,
        paneWidth,
        paneHeight,
        panelVisible,
        layoutCompleted: !layoutResult.layoutError,
        renderCommitted:
          renderCommitted &&
          visibility.currentDomNodeCount === renderedFlowNodes.length &&
          visibility.staleDomNodeCount === 0,
        displayedNodesMeasured: observation.displayedNodesMeasured,
        nodesInitializationGraceActive,
        viewport,
        measurement: visibility,
      });
      return {
        component: "tree_render_diagnostics",
        reason,
        canonicalNodeCount: nodes.length,
        storeNodeCount: nodes.length,
        activeNodeCount: nodes.length,
        filteredNodeCount: displayNodes.length,
        layoutInputNodeCount: orderedVisibleNodes.length,
        layoutOutputNodeCount: layoutResult.outputNodeCount,
        reactFlowNodeCount: renderedFlowNodes.length,
        reactFlowEdgeCount: renderedFlowEdges.length,
        reactFlowInternalNodeCount: observation.internalNodeCount,
        reactFlowInternalEdgeCount: observation.internalEdgeCount,
        measuredNodeCount: reactFlowMeasuredNodeCount,
        measuredNodeIdSignature: reactFlowMeasuredNodeIdSignature,
        renderedDomNodeCount: observation.renderedDomNodeCount,
        rootNodeId: discussionTreeRootNodeId(nodes),
        rootPresentInDisplay:
          nodes.length === 0 ||
          displayNodes.some((node) => node.id === discussionTreeRootNodeId(nodes)),
        missingParentCount: layoutResult.missingParentNodeIds.length,
        missingEdgeEndpointCount,
        containerWidth: paneWidth,
        containerHeight: paneHeight,
        canvasWidth: canvasRect?.width ?? observedCanvasSize?.width ?? paneWidth,
        canvasHeight: canvasRect?.height ?? observedCanvasSize?.height ?? paneHeight,
        resizeObserverWidth: observedCanvasSize?.width ?? null,
        resizeObserverHeight: observedCanvasSize?.height ?? null,
        viewportX: safeViewport ? viewport.x : null,
        viewportY: safeViewport ? viewport.y : null,
        zoom: safeViewport ? viewport.zoom : null,
        viewportValid: safeViewport,
        viewportBounds: visibility.viewportBounds,
        graphBounds: visibility.graphBounds,
        visibleNodeCount: visibility.visibleNodeCount,
        nodeViewportIntersectionCount: visibility.nodeViewportIntersectionCount,
        partiallyVisibleNodeCount: visibility.partiallyVisibleNodeCount,
        fullyVisibleNodeCount: visibility.fullyVisibleNodeCount,
        zeroSizeNodeCount: visibility.zeroSizeNodeCount,
        clippedNodeCount: visibility.clippedNodeCount,
        hiddenByAncestorNodeCount: visibility.hiddenByAncestorNodeCount,
        occludedNodeCount: visibility.occludedNodeCount,
        unoccludedVisibleNodeCount: visibility.unoccludedVisibleNodeCount,
        partiallyOccludedNodeCount: visibility.partiallyOccludedNodeCount,
        staleDomNodeCount: visibility.staleDomNodeCount,
        currentDomNodeCount: visibility.currentDomNodeCount,
        nodeLayerDisplay: visibility.nodeLayerDisplay,
        nodeLayerVisibility: visibility.nodeLayerVisibility,
        nodeLayerOpacity: visibility.nodeLayerOpacity,
        nodeLayerTransform: visibility.nodeLayerTransform,
        viewportLayerDisplay: visibility.viewportLayerDisplay,
        viewportLayerVisibility: visibility.viewportLayerVisibility,
        viewportLayerOpacity: visibility.viewportLayerOpacity,
        viewportLayerTransform: visibility.viewportLayerTransform,
        rendererDisplay: visibility.rendererDisplay,
        rendererVisibility: visibility.rendererVisibility,
        rendererOpacity: visibility.rendererOpacity,
        topOccludingElementTag: visibility.topOccludingElementTag,
        topOccludingElementClass: visibility.topOccludingElementClass,
        topOccludingElementZIndex: visibility.topOccludingElementZIndex,
        ancestorHidden: visibility.ancestorHidden,
        nearestNodeDistanceFromViewport: visibility.nearestNodeDistanceFromViewport,
        reactFlowTransform: visibility.reactFlowTransform,
        nodeCoordinateRange: visibility.nodeCoordinateRange,
        visibilityHealth,
        layoutStarted: true,
        layoutCompleted: !layoutResult.layoutError,
        layoutError: layoutResult.layoutError ? "layout_exception" : "",
        usedLayoutFallback: layoutResult.usedFallback,
        renderCommitted,
        nodesInitialized: observation.nodesInitialized,
        displayedNodesMeasured: observation.displayedNodesMeasured,
        nodesInitializedStale: observation.displayedNodesMeasured && !observation.nodesInitialized,
        expectedDisplayedNodeIdsCount: renderedFlowNodes.length,
        measuredNodeIdsCount: reactFlowMeasuredNodeCount,
        hydrationKind,
        componentKey: `${sessionId || "anonymous"}:${bufferSlot}`,
        bufferSlot,
        providerInstanceId,
        reactFlowInstanceId: flowInstanceIdRef.current,
        panelVisible,
        selectedTab: "discussion_tree",
        cssDisplay,
        cssVisibility,
        cssOpacity,
        usingLastKnownGoodFrame: usingLastGoodFrame,
        lastHealthyTreeVersion: lastHealthyTreeVersionRef.current,
        currentTreeVersion: treeVersion,
        previousHealthy: lastHealthy,
        lastHealthyViewport: lastHealthyVisibilityRef.current?.viewport ?? null,
        lastHealthyGraphBounds: lastHealthyVisibilityRef.current?.graphBounds ?? null,
        lastHealthyVisibleNodeCount: lastHealthyVisibilityRef.current?.visibleNodeCount ?? null,
        lastHealthyRenderTimestamp: lastHealthyVisibilityRef.current?.renderTimestamp ?? null,
        userInteractionActive: userInteractionActiveRef.current,
        lastUserViewportInteractionAt:
          lastManualInteractionAtRef.current > 0
            ? new Date(lastManualInteractionAtRef.current).toISOString()
            : null,
      };
    },
    [
      bufferSlot,
      displayNodes,
      getViewport,
      hydrationKind,
      layoutResult,
      missingEdgeEndpointCount,
      nodes,
      nodesInitializationGraceActive,
      observedCanvasSize,
      orderedVisibleNodes.length,
      paneHeight,
      paneWidth,
      providerInstanceId,
      reactFlowMeasuredNodeCount,
      reactFlowMeasuredNodeIdSignature,
      renderedBounds,
      renderedFlowEdges.length,
      renderedFlowNodes.length,
      sessionId,
      treeVersion,
      usingLastGoodFrame,
    ],
  );

  useEffect(() => {
    if (lastGoodRenderFrameSessionRef.current === sessionId) {
      return;
    }
    lastGoodRenderFrameSessionRef.current = sessionId;
    lastGoodRenderFrameRef.current = null;
    restoredLkgSignatureRef.current = "";
    setSyncRejectedSignature(null);
  }, [sessionId]);

  useEffect(() => {
    const root = flowRootRef.current;
    if (!root || typeof MutationObserver === "undefined") {
      return;
    }
    let animationFrame = 0;
    const update = () => {
      const elements = [...root.querySelectorAll<HTMLElement>(".react-flow__node")];
      const count = elements.length;
      const idSignature = elements
        .map((element) => element.dataset.id ?? "")
        .sort()
        .join("\0");
      const zeroSizeSignature = elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width <= 0 || rect.height <= 0;
        })
        .map((element) => element.dataset.id ?? "")
        .sort()
        .join("\0");
      const nodeLayer = root.querySelector<HTMLElement>(".react-flow__nodes");
      const signature = [
        idSignature,
        zeroSizeSignature,
        nodeLayer?.className ?? "",
        nodeLayer?.getAttribute("hidden") ?? "",
        nodeLayer?.getAttribute("style") ?? "",
      ].join("|");
      if (renderedDomObservationSignatureRef.current === signature) {
        return;
      }
      renderedDomObservationSignatureRef.current = signature;
      setRenderedDomNodeCount((current) => (current === count ? current : count));
      setViewportObservationEpoch((current) => current + 1);
    };
    const scheduleUpdate = () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        update();
      });
    };
    scheduleUpdate();
    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  const externalOcclusionObservationSignatureRef = useRef("");
  const portalOverlayCountRef = useRef(0);
  useEffect(() => {
    if (
      !committedSnapshot ||
      typeof document === "undefined" ||
      typeof MutationObserver === "undefined"
    ) {
      return;
    }
    const root = flowRootRef.current;
    const panel = root?.closest<HTMLElement>("[data-discussion-tree-panel]");
    if (!root || !panel) return;
    let animationFrame = 0;
    const update = () => {
      const portalOverlays = externalPortalOverlays(panel);
      const portalSignature = portalOverlays
        .map((element) =>
          [
            element.tagName,
            safeDiagnosticClassName(element),
            element.getAttribute("style") ?? "",
            element.getAttribute("hidden") ?? "",
            element.getAttribute("aria-hidden") ?? "",
            element.getAttribute("open") ?? "",
            element.getAttribute("role") ?? "",
          ].join(":"),
        )
        .join("|");
      const externalSignature = [
        ...panel.querySelectorAll<HTMLElement>(
          "[class], [style], [hidden], [data-discussion-tree-occluder]",
        ),
      ]
        .filter((element) => !root.contains(element) && !element.contains(root))
        .map((element) =>
          [
            element.tagName,
            safeDiagnosticClassName(element),
            element.getAttribute("style") ?? "",
            element.getAttribute("hidden") ?? "",
            element.getAttribute("data-discussion-tree-occluder") ?? "",
          ].join(":"),
        )
        .join("|");
      const ancestorParts: string[] = [];
      for (let element: HTMLElement | null = root; element; element = element.parentElement) {
        const style = visibilityStyle(element);
        ancestorParts.push(
          [
            element.tagName,
            safeDiagnosticClassName(element),
            element.getAttribute("style") ?? "",
            element.getAttribute("hidden") ?? "",
            style.display,
            style.visibility,
            style.opacity ?? "",
            style.contentVisibility,
          ].join(":"),
        );
        if (element === document.body) break;
      }
      const signature = `${externalSignature}||ancestors:${ancestorParts.join(
        "|",
      )}||portals:${portalSignature}`;
      if (externalOcclusionObservationSignatureRef.current === signature) return;
      externalOcclusionObservationSignatureRef.current = signature;
      // 状態が変わった回だけ記録する。フレームごとの再送はしない。
      const visibleOverlays = overlayLikePortalElements(portalOverlays);
      if (visibleOverlays.length !== portalOverlayCountRef.current) {
        const detected = visibleOverlays.length > portalOverlayCountRef.current;
        portalOverlayCountRef.current = visibleOverlays.length;
        const context = viewportOperationDiagnosticsRef.current;
        recordDiagnosticEvent("tree_render_state", {
          sessionId: context.sessionId,
          workspaceId: context.workspaceId,
          treeVersion: viewportOperationContextRef.current.treeVersion,
          analysisVersion: context.analysisVersion,
          nodeCount: context.nodeCount,
          details: {
            phase: detected ? "portal_overlay_detected" : "portal_overlay_removed",
            portalOverlayCount: visibleOverlays.length,
            portalOverlayTags: visibleOverlays.map((element) => element.tagName.toLowerCase()),
            layoutRevision: viewportOperationContextRef.current.layoutRevision,
          },
        });
      }
      setViewportObservationEpoch((current) => current + 1);
    };
    const scheduleUpdate = () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        update();
      });
    };
    update();
    const observer = new MutationObserver((mutations) => {
      const externalChanged = mutations.some((mutation) => {
        if (!root.contains(mutation.target)) return true;
        return [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) => node instanceof Element && !root.contains(node),
        );
      });
      if (externalChanged) scheduleUpdate();
    });
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["class", "hidden", "style", "data-discussion-tree-occluder"],
      childList: true,
      subtree: true,
    });
    for (let ancestor = panel.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor === document.body) break;
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["class", "hidden", "style"],
      });
    }
    // modal/dialogはReact subtree外のportalとして document.body へ現れるため、
    // panelとその祖先の属性監視だけでは出現も消失も検出できない。bodyのsubtree
    // まで見て、開閉と表示切り替えの両方を拾う。単一のobserverへ登録するので
    // Strict Modeの二重mountでもcleanupのdisconnectで確実に解除される。
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "open"],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
    };
  }, [committedSnapshot]);

  const [pendingViewportEpoch, setPendingViewportEpoch] = useState(0);
  const appliedPendingViewportSignatureRef = useRef("");
  useEffect(() => {
    // 進行中の移動が確定した後のviewportを継承させるため、完了まで待ってから
    // 同期する。操作は必ず有限時間で退役するので、ここで滞留し続けることはない。
    if (
      !pendingSnapshot ||
      canvasUnavailable ||
      viewportInteractionActive ||
      programmaticViewportMoveActive ||
      !diagnosticViewportIsSafe(preservedViewport)
    ) {
      return;
    }
    const signature = `${snapshotGeneration}:${preservedViewport.x}:${preservedViewport.y}:${preservedViewport.zoom}`;
    if (appliedPendingViewportSignatureRef.current === signature) {
      return;
    }
    appliedPendingViewportSignatureRef.current = signature;
    let cancelled = false;
    let animationFrame = 0;
    void Promise.resolve(setViewport(preservedViewport, { duration: 0 })).then(() => {
      animationFrame = window.requestAnimationFrame(() => {
        if (!cancelled) setPendingViewportEpoch((current) => current + 1);
      });
    });
    return () => {
      cancelled = true;
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
    };
  }, [
    canvasUnavailable,
    pendingSnapshot,
    preservedViewport,
    programmaticViewportMoveActive,
    setViewport,
    snapshotGeneration,
    viewportInteractionActive,
  ]);

  const pendingReadinessSignatureRef = useRef("");
  const pendingFailureSignatureRef = useRef("");
  const pendingViewportRecoverySignatureRef = useRef("");
  useEffect(() => {
    if (!pendingSnapshot) {
      return;
    }
    const viewport = getViewport();
    const expectedNodeIDs = candidateFrame.nodes
      .map((node) => node.id)
      .sort()
      .join("\0");
    const domElements = [
      ...(flowRootRef.current?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]") ?? []),
    ];
    const domNodeIDs = domElements
      .map((element) => element.dataset.id ?? "")
      .filter(Boolean)
      .sort()
      .join("\0");
    const domMeasuredNodeIDs = domElements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          Number.isFinite(rect.width) &&
          rect.width > 0 &&
          Number.isFinite(rect.height) &&
          rect.height > 0
        );
      })
      .map((element) => element.dataset.id ?? "")
      .filter(Boolean)
      .sort()
      .join("\0");
    const visibleNodeCount = diagnosticViewportIsSafe(viewport)
      ? candidateFrame.nodes.filter((node) => {
          const left = node.position.x * viewport.zoom + viewport.x;
          const top = node.position.y * viewport.zoom + viewport.y;
          const right = left + (node.initialWidth ?? NODE_WIDTH) * viewport.zoom;
          const bottom = top + (node.initialHeight ?? NODE_HEIGHT) * viewport.zoom;
          return right > 0 && bottom > 0 && left < paneWidth && top < paneHeight;
        }).length
      : 0;
    const paintReadiness = discussionFlowPaintReadiness(flowRootRef.current);
    const invalidReason = candidateFrameInvalidReasons[0] ?? "";
    // readyの期待値は「React Flowへ実際に渡した表示対象node」であって、canonical
    // なitem全件数ではない。件数だけでなくID集合で照合する。
    const measurement = discussionTreeMeasurementReadiness({
      expectedNodeCount: candidateFrame.nodes.length,
      expectedNodeIdSignature: expectedNodeIDs,
      expectedEdgeCount: candidateFrame.edges.length,
      internalNodeCount: reactFlowInternalNodeCount,
      internalNodeIdSignature: reactFlowInternalNodeIdSignature,
      internalEdgeCount: reactFlowInternalEdgeCount,
      measuredNodeCount: reactFlowMeasuredNodeCount,
      measuredNodeIdSignature: reactFlowMeasuredNodeIdSignature,
      domNodeCount: renderedDomNodeCount,
      domNodeIdSignature: domNodeIDs,
      domMeasuredNodeIdSignature: domMeasuredNodeIDs,
      nodesInitialized: reactFlowNodesInitialized,
    });
    const readiness: DiscussionTreeRuntimeReadiness = {
      generation: snapshotGeneration,
      bufferSlot,
      providerInstanceId,
      reactFlowInstanceId: flowInstanceIdRef.current,
      componentKey: `${sessionId || "anonymous"}:${bufferSlot}`,
      metadataRevision,
      candidateSignature: candidateFrame.signature,
      layoutRevision,
      internalNodeCount: reactFlowInternalNodeCount,
      internalNodeIdSignature: reactFlowInternalNodeIdSignature,
      domNodeCount: renderedDomNodeCount,
      domNodeIdSignature: domNodeIDs,
      domMeasuredNodeIdSignature: domMeasuredNodeIDs,
      measuredNodeCount: reactFlowMeasuredNodeCount,
      measuredNodeIdSignature: reactFlowMeasuredNodeIdSignature,
      expectedDisplayedNodeIdSignature: expectedNodeIDs,
      expectedDisplayedNodeCount: candidateFrame.nodes.length,
      measurementComplete: measurement.complete,
      measurementBlockingReason: measurement.blockingReason,
      nodesInitialized: reactFlowNodesInitialized,
      nodesInitializedStale: measurement.nodesInitializedStale,
      hydrationKind,
      paintReady: paintReadiness.ready,
      paintBlockingReason: paintReadiness.reason,
      visibleNodeCount,
      viewport,
    };
    if (invalidReason) {
      const signature = `${snapshotGeneration}:${metadataRevision}:${candidateFrame.signature}:${invalidReason}`;
      if (pendingFailureSignatureRef.current !== signature) {
        pendingFailureSignatureRef.current = signature;
        onPendingFailed(snapshotGeneration, invalidReason, readiness);
      }
      return;
    }
    const viewportMatches =
      diagnosticViewportIsSafe(viewport) &&
      Math.abs(viewport.x - preservedViewport.x) < 0.01 &&
      Math.abs(viewport.y - preservedViewport.y) < 0.01 &&
      Math.abs(viewport.zoom - preservedViewport.zoom) < 0.001;
    // 進行中のviewport操作を待つのは、実行中のフォーカス移動を捨てて別treeへ
    // 差し替えないため。待ちが「永久」にならないことは操作側で保証している
    // (後発操作によるsupersede、settle timeout、role/tree変更、unmount)。
    const exactRuntimeReady =
      !canvasUnavailable &&
      !viewportInteractionActive &&
      !programmaticViewportMoveActive &&
      !manualResetActive &&
      measurement.complete &&
      paintReadiness.ready &&
      diagnosticViewportIsSafe(viewport);
    const initialHydration = hydrationKind === "initial";
    const viewportRecoverySignature = `${snapshotGeneration}:${metadataRevision}:${candidateFrame.signature}`;
    if (exactRuntimeReady && visibleNodeCount === 0) {
      if (pendingViewportRecoverySignatureRef.current !== viewportRecoverySignature) {
        pendingViewportRecoverySignatureRef.current = viewportRecoverySignature;
        const rootID = discussionTreeRootNodeId(nodes);
        const rootNode =
          candidateFrame.nodes.find((node) => node.id === rootID) ?? candidateFrame.nodes[0];
        const zoom = preservedViewport.zoom;
        const recoveredViewport = {
          x: paneWidth / 2 - (rootNode.position.x + NODE_WIDTH / 2) * zoom,
          y: paneHeight / 2 - (rootNode.position.y + NODE_HEIGHT / 2) * zoom,
          zoom,
        };
        let cancelled = false;
        let animationFrame = 0;
        void Promise.resolve(setViewport(recoveredViewport, { duration: 0 }))
          .then((applied) => {
            if (!applied || cancelled) {
              if (!cancelled) {
                onPendingFailed(snapshotGeneration, "pending_viewport_recovery_failed", readiness);
              }
              return;
            }
            animationFrame = window.requestAnimationFrame(() => {
              if (!cancelled) setPendingViewportEpoch((current) => current + 1);
            });
          })
          .catch(() => {
            if (!cancelled) {
              onPendingFailed(snapshotGeneration, "pending_viewport_recovery_failed", readiness);
            }
          });
        return () => {
          cancelled = true;
          if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
        };
      }
      // 復旧を一度試しても可視件数が0のままなら、通常updateは旧treeを表示した
      // まま待てばよい。初回hydrateには待てる旧treeが無いので、そのまま昇格して
      // committed側の初回fitに任せる。
      if (!initialHydration) {
        return;
      }
    }
    const viewportAccepted =
      viewportMatches || pendingViewportRecoverySignatureRef.current === viewportRecoverySignature;
    // 初回hydrateには継承すべきユーザーviewportも、表示し続けられる旧treeも無い。
    // viewport一致や可視件数を昇格条件にすると、待っても状況が変わらないまま
    // 全面空白で停止する。commit後にcommitted buffer側の初回fitが必ず走るので、
    // ここでは表示対象nodeの計測完了だけを条件にする。
    const ready =
      exactRuntimeReady && (initialHydration || (visibleNodeCount > 0 && viewportAccepted));
    if (!ready) {
      return;
    }
    const signature = `${snapshotGeneration}:${metadataRevision}:${candidateFrame.signature}:${expectedNodeIDs}:${viewport.x}:${viewport.y}:${viewport.zoom}`;
    if (pendingReadinessSignatureRef.current === signature) {
      return;
    }
    if (snapshotGeneration > 1 && !initialHydration) {
      // This prepared buffer already inherited the user's active viewport.
      // Promotion must not run the first-mount fit path again.
      didInitialFitRef.current = true;
    }
    if (onPendingReady(readiness)) {
      pendingReadinessSignatureRef.current = signature;
    }
  }, [
    candidateFrame,
    bufferSlot,
    candidateFrameInvalidReasons,
    canvasUnavailable,
    hydrationKind,
    pendingSnapshot,
    programmaticViewportMoveActive,
    providerInstanceId,
    getViewport,
    layoutRevision,
    manualResetActive,
    metadataRevision,
    onPendingFailed,
    onPendingReady,
    nodes,
    paneHeight,
    paneWidth,
    pendingViewportEpoch,
    preservedViewport,
    reactFlowInternalEdgeCount,
    reactFlowInternalNodeCount,
    reactFlowInternalNodeIdSignature,
    reactFlowMeasuredNodeCount,
    reactFlowMeasuredNodeIdSignature,
    reactFlowNodesInitialized,
    renderedDomNodeCount,
    setViewport,
    sessionId,
    snapshotGeneration,
    viewportInteractionActive,
    viewportObservationEpoch,
  ]);

  useEffect(() => {
    if (!committedSnapshot) {
      return;
    }
    const viewport = getViewport();
    if (diagnosticViewportIsSafe(viewport)) {
      onCommittedViewportChange(viewport);
    }
  }, [
    candidateFrame.signature,
    committedSnapshot,
    getViewport,
    onCommittedViewportChange,
    viewportObservationEpoch,
  ]);

  // Capture an early LKG only when the exact candidate ID set is committed and
  // the nodes are actually painted. ID/count equality alone previously let an
  // invisible frame replace the last known-good frame.
  useEffect(() => {
    if (
      !committedSnapshot ||
      canvasUnavailable ||
      candidateFrameInvalidReasons.length > 0 ||
      candidateFrame.nodes.length === 0 ||
      usingLastGoodFrame
    ) {
      return;
    }
    const candidateNodeIdSignature = candidateFrame.nodes
      .map((node) => node.id)
      .sort()
      .join("\0");
    const renderedDomNodeIdSignature = [
      ...(flowRootRef.current?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]") ?? []),
    ]
      .map((element) => element.dataset.id ?? "")
      .sort()
      .join("\0");
    const observation = syncObservationRef.current;
    const synchronizationMismatch =
      reactFlowInternalNodeIdSignature !== candidateNodeIdSignature ||
      renderedDomNodeIdSignature !== candidateNodeIdSignature ||
      !observation.displayedNodesMeasured;
    if (synchronizationMismatch) {
      lastLKGDecisionRef.current = "synchronization_mismatch";
      return;
    }
    const viewport = getViewport();
    if (!diagnosticViewportIsSafe(viewport)) {
      lastLKGDecisionRef.current = "invalid_viewport";
      return;
    }
    const details = renderDiagnosticDetails("early_lkg_evaluated", observation, viewport, true);
    if (details.visibilityHealth !== "healthy_visible") {
      lastLKGDecisionRef.current = String(details.visibilityHealth);
      return;
    }
    lastLKGDecisionRef.current = "saved_healthy_visible";
    lastGoodRenderFrameSessionRef.current = sessionId;
    lastGoodRenderFrameRef.current = {
      ...candidateFrame,
      viewport,
    };
  }, [
    candidateFrame,
    candidateFrameInvalidReasons.length,
    canvasUnavailable,
    committedSnapshot,
    getViewport,
    reactFlowInternalNodeIdSignature,
    renderDiagnosticDetails,
    renderedDomNodeCount,
    sessionId,
    usingLastGoodFrame,
  ]);

  // Promote a candidate frame to LKG only after the real React Flow store and
  // DOM have converged. A candidate that still has an internal-count mismatch,
  // zero rendered nodes, or an invalid viewport after the settle window is
  // rejected; the previous positions and viewport remain visible until the
  // next snapshot/resize retry.
  useEffect(() => {
    if (
      !committedSnapshot ||
      candidateFrameInvalidReasons.length > 0 ||
      canvasUnavailable ||
      syncRejectedSignature === candidateFrame.signature
    ) {
      return;
    }
    if (nodesInitializationGraceActive) {
      return;
    }
    let animationFrame = 0;
    let evaluatedFrames = 0;
    const evaluateCommit = () => {
      evaluatedFrames += 1;
      const observation = syncObservationRef.current;
      const viewport = getViewport();
      const synchronized =
        observation.internalNodeCount === candidateFrame.nodes.length &&
        observation.internalEdgeCount === candidateFrame.edges.length &&
        observation.displayedNodesMeasured &&
        observation.renderedDomNodeCount === candidateFrame.nodes.length &&
        isFiniteViewport(viewport);
      const synchronizedDetails = renderDiagnosticDetails(
        "render_commit_evaluated",
        observation,
        viewport,
        synchronized,
      );
      const geometricallyVisible = synchronizedDetails.visibilityHealth === "healthy_visible";
      if (synchronized && geometricallyVisible) {
        lastGoodRenderFrameSessionRef.current = sessionId;
        lastGoodRenderFrameRef.current = {
          ...candidateFrame,
          viewport,
        };
        setSyncRejectedSignature((current) =>
          current === candidateFrame.signature ? null : current,
        );
        lastHealthyTreeVersionRef.current = treeVersion;
        lastHealthyRenderRef.current = {
          canonicalNodeCount: nodes.length,
          reactFlowNodeCount: candidateFrame.nodes.length,
          renderedDomNodeCount: observation.renderedDomNodeCount,
          containerWidth: paneWidth,
          containerHeight: paneHeight,
        };
        if (healthyDiagnosticSignatureRef.current !== candidateFrame.signature) {
          healthyDiagnosticSignatureRef.current = candidateFrame.signature;
          recordDiagnosticEvent("tree_render_state", {
            sessionId,
            workspaceId,
            treeVersion,
            analysisVersion,
            nodeCount: nodes.length,
            rootNodeId: discussionTreeRootNodeId(nodes),
            details: {
              ...synchronizedDetails,
              reason: "render_commit_healthy",
              visibilityHealth: "healthy_visible",
            },
          });
        }

        return;
      }
      // React Flow's store and DOM observers can settle on adjacent frames.
      // Retry by animation frame instead of treating the first pre-commit
      // observation as a failed render or introducing a fixed delay.
      if (!synchronized && evaluatedFrames < NODE_INITIALIZATION_GRACE_FRAMES + 1) {
        animationFrame = window.requestAnimationFrame(evaluateCommit);
        return;
      }
      if (nodes.length > 0) {
        const reason =
          candidateFrame.nodes.length === 0
            ? "react_flow_props_empty"
            : observation.internalNodeCount === 0
              ? "react_flow_store_empty"
              : observation.renderedDomNodeCount === 0
                ? "rendered_dom_empty"
                : !diagnosticViewportIsSafe(viewport)
                  ? "invalid_viewport"
                  : synchronized
                    ? String(synchronizedDetails.visibilityHealth)
                    : "render_commit_timeout";
        const signature = `${candidateFrame.signature}:${reason}`;
        if (anomalyDiagnosticSignatureRef.current !== signature) {
          anomalyDiagnosticSignatureRef.current = signature;
          recordDiagnosticEvent("tree_render_anomaly", {
            sessionId,
            workspaceId,
            treeVersion,
            analysisVersion,
            nodeCount: nodes.length,
            rootNodeId: discussionTreeRootNodeId(nodes),
            details: renderDiagnosticDetails(reason, observation, viewport, false),
          });
        }
      }
      if (!synchronized && lastGoodRenderFrameRef.current) {
        setSyncRejectedSignature(candidateFrame.signature);
      }
    };
    animationFrame = window.requestAnimationFrame(evaluateCommit);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    candidateFrame,
    candidateFrameInvalidReasons.length,
    canvasUnavailable,
    committedSnapshot,
    getViewport,
    analysisVersion,
    nodes,
    nodesInitializationGraceActive,
    paneHeight,
    paneWidth,
    renderDiagnosticDetails,
    sessionId,
    syncRejectedSignature,
    treeVersion,
    treeHash,
    workspaceId,
  ]);

  useEffect(() => {
    if (!committedSnapshot) {
      return;
    }
    if (nodes.length === 0) {
      zeroSizeObservedRef.current = false;
      return;
    }
    if (canvasUnavailable) {
      zeroSizeObservedRef.current = true;
      const signature = `${candidateFrame.signature}:container_zero_size`;
      if (anomalyDiagnosticSignatureRef.current !== signature) {
        anomalyDiagnosticSignatureRef.current = signature;
        recordDiagnosticEvent("tree_render_anomaly", {
          sessionId,
          workspaceId,
          treeVersion,
          analysisVersion,
          nodeCount: nodes.length,
          rootNodeId: discussionTreeRootNodeId(nodes),
          details: renderDiagnosticDetails(
            paneWidth <= 0 && paneHeight <= 0
              ? "container_zero_width_and_height"
              : paneWidth <= 0
                ? "container_zero_width"
                : "container_zero_height",
          ),
        });
      }
      return;
    }
    if (zeroSizeObservedRef.current) {
      zeroSizeObservedRef.current = false;
      recordDiagnosticEvent("tree_render_recovery", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: nodes.length,
        rootNodeId: discussionTreeRootNodeId(nodes),
        details: {
          ...renderDiagnosticDetails("container_size_recovered"),
          recoveryAttempted: true,
          recoveryResult: "fit_view_requeued",
        },
      });
    }
  }, [
    analysisVersion,
    candidateFrame.signature,
    canvasUnavailable,
    committedSnapshot,
    nodes,
    paneHeight,
    paneWidth,
    renderDiagnosticDetails,
    sessionId,
    treeVersion,
    workspaceId,
  ]);

  useEffect(() => {
    if (!committedSnapshot || nodes.length === 0 || candidateFrameInvalidReasons.length === 0) {
      return;
    }
    const reason =
      layoutResult.inputNodeCount > 0 && layoutResult.outputNodeCount === 0
        ? "layout_output_empty"
        : candidateFrameInvalidReasons[0];
    const signature = `${candidateFrame.signature}:${reason}`;
    if (anomalyDiagnosticSignatureRef.current === signature) {
      return;
    }
    anomalyDiagnosticSignatureRef.current = signature;
    recordDiagnosticEvent("tree_render_anomaly", {
      sessionId,
      workspaceId,
      treeVersion,
      analysisVersion,
      nodeCount: nodes.length,
      rootNodeId: discussionTreeRootNodeId(nodes),
      details: renderDiagnosticDetails(reason),
    });
  }, [
    analysisVersion,
    candidateFrame.signature,
    candidateFrameInvalidReasons,
    committedSnapshot,
    layoutResult.inputNodeCount,
    layoutResult.outputNodeCount,
    nodes,
    renderDiagnosticDetails,
    sessionId,
    treeVersion,
    workspaceId,
  ]);

  const restoredLkgSignatureRef = useRef("");
  useEffect(() => {
    if (!committedSnapshot || !usingLastGoodFrame || !lastGoodRenderFrame) {
      return;
    }
    const reason =
      candidateFrameInvalidReasons.join(",") ||
      (canvasUnavailable ? "container_0x0" : "react_flow_sync");
    const signature = `${candidateFrame.signature}:${lastGoodRenderFrame.signature}:${reason}`;
    if (restoredLkgSignatureRef.current === signature) {
      return;
    }
    let animationFrame = 0;
    const completeRecovery = (viewportRestored: boolean, preserveUserViewport: boolean) => {
      restoredLkgSignatureRef.current = signature;
      recordDiagnosticEvent("tree_render_recovery", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: nodes.length,
        rootNodeId: discussionTreeRootNodeId(nodes),
        details: {
          ...renderDiagnosticDetails(reason),
          recoveryAttempted: true,
          recoveryResult: "last_known_good_frame_restored",
          viewportRestored,
          viewportPreservedForUserInteraction: preserveUserViewport,
        },
      });
    };
    if (!isFiniteViewport(lastGoodRenderFrame.viewport)) {
      completeRecovery(false, false);
      return;
    }
    // Defer the viewport mutation by one paint so a pointer interaction that
    // started in the same commit can mark itself first. The retained LKG nodes
    // remain available immediately; only the viewport mutation is suppressed.
    animationFrame = window.requestAnimationFrame(() => {
      const preserveUserViewport =
        userInteractionActiveRef.current ||
        Date.now() - lastManualInteractionAtRef.current < AUTO_FOLLOW_INTERACTION_GRACE_MS;
      if (!preserveUserViewport) {
        const operation = beginViewportOperation("last_known_good_frame_restore");
        void Promise.resolve(setViewport(lastGoodRenderFrame.viewport, { duration: 0 })).finally(
          () => {
            // staleな完了はviewportもrecovery状態も触らずに捨てる。
            if (!completeViewportOperation(operation)) return;
            if (committedSnapshotRef.current) {
              const viewport = getViewport();
              if (diagnosticViewportIsSafe(viewport)) onCommittedViewportChange(viewport);
            }
            completeRecovery(true, false);
          },
        );
        return;
      }
      completeRecovery(false, true);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    analysisVersion,
    beginViewportOperation,
    candidateFrame.signature,
    candidateFrameInvalidReasons,
    canvasUnavailable,
    committedSnapshot,
    completeViewportOperation,
    getViewport,
    lastGoodRenderFrame,
    nodes,
    onCommittedViewportChange,
    renderDiagnosticDetails,
    sessionId,
    setViewport,
    treeVersion,
    usingLastGoodFrame,
    workspaceId,
  ]);

  // 初回(ノードが空→非空になった最初)だけ自動フィットする。0x0のcontainerで
  // fitViewを確定させると、その後も全ノードがviewport外に残り得るため延期する。
  const fitViewPendingRef = useRef(false);
  const deferredFitRequestRef = useRef<{
    reason: string;
    duration: number;
    centerRootIfInvisible: boolean;
    respectUserViewport: boolean;
  } | null>(null);
  const [fitRetryEpoch, setFitRetryEpoch] = useState(0);
  const requestFitView = useCallback(
    (
      reason: string,
      duration: number,
      centerRootIfInvisible = false,
      // 自動的に発生するfit(可視性復旧・外部レイアウト変化)はユーザーのviewport
      // を奪ってはいけない。初回表示とフォーカス由来のfallbackだけが例外。
      respectUserViewport = true,
    ) => {
      if (!committedSnapshot) {
        return false;
      }
      if (manualResetInProgressRef.current) {
        return false;
      }
      // 操作中とgrace period中は自動fitを行わず、保留していた要求も破棄する
      // (あとから再生されると同じことが起きるため)。
      if (
        respectUserViewport &&
        (userInteractionActiveRef.current ||
          Date.now() - lastManualInteractionAtRef.current < AUTO_FOLLOW_INTERACTION_GRACE_MS)
      ) {
        deferredFitRequestRef.current = null;
        return false;
      }
      const deferredRequest = { reason, duration, centerRootIfInvisible, respectUserViewport };
      if (renderedFlowNodes.length === 0 || paneWidth <= 0 || paneHeight <= 0) {
        deferredFitRequestRef.current = deferredRequest;
        return false;
      }
      if (fitViewPendingRef.current) {
        deferredFitRequestRef.current = deferredRequest;
        return false;
      }
      deferredFitRequestRef.current = null;
      fitViewPendingRef.current = true;
      autoMovingRef.current = true;
      // 初回フィットは「試みた」時点で確定させる。完了通知は割り込みで失われうる
      // ので、そこで初めて記録すると同じbufferへ何度も初回フィットが走り、
      // ユーザーのviewportを繰り返し奪ってしまう。実際に開始できなかった場合
      // (0x0など)はここへ到達せず保留されるので、初回フィットは失われない。
      if (reason === "initial") {
        didInitialFitRef.current = true;
      }
      const operation = beginViewportOperation(`fit_view:${reason}`, duration);
      recordDiagnosticEvent("tree_render_state", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: nodes.length,
        rootNodeId: discussionTreeRootNodeId(nodes),
        details: {
          ...renderDiagnosticDetails(reason),
          phase: "fit_view_started",
          fitViewReason: reason,
        },
      });

      const nextFrame = () =>
        new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      void withSettleTimeout(
        fitView({ padding: 0.2, duration }),
        duration + VIEWPORT_OPERATION_SETTLE_MARGIN_MS,
        false,
      )
        .then(async (applied) => {
          await nextFrame();
          // ここから先は現在の可視性を測り直したうえでしか動かさないので、後発の
          // 操作に置き換えられていても継続してよい。共有stateへの反映(viewportの
          // 公開)だけは finally 側の currency 判定で止める。
          if (!viewportOperationMountedRef.current) return;
          let recoveryMethod = "fit_view";
          let after = renderDiagnosticDetails(
            `${reason}_after_fit`,
            syncObservationRef.current,
            getViewport(),
            true,
          );
          const preserveUserViewport =
            userInteractionActiveRef.current ||
            Date.now() - lastManualInteractionAtRef.current < AUTO_FOLLOW_INTERACTION_GRACE_MS;
          if (
            centerRootIfInvisible &&
            !preserveUserViewport &&
            Number(after.unoccludedVisibleNodeCount ?? 0) === 0
          ) {
            const rootID = discussionTreeRootNodeId(displayNodes);
            const rootNode =
              renderedFlowNodes.find((node) => node.id === rootID) ?? renderedFlowNodes[0];
            if (rootNode) {
              recoveryMethod = "fit_view_then_center_root";
              await Promise.resolve(
                setCenter(
                  rootNode.position.x + NODE_WIDTH / 2,
                  rootNode.position.y + NODE_HEIGHT / 2,
                  { zoom: 1, duration: 0 },
                ),
              );
              await nextFrame();
              after = renderDiagnosticDetails(
                `${reason}_after_center_root`,
                syncObservationRef.current,
                getViewport(),
                true,
              );
            }
          }
          const recovered = after.visibilityHealth === "healthy_visible";
          if ((applied || recovered) && reason === "initial") {
            didInitialFitRef.current = true;
          }
          recordDiagnosticEvent(recovered ? "tree_render_recovery" : "tree_render_anomaly", {
            sessionId,
            workspaceId,
            treeVersion,
            analysisVersion,
            nodeCount: nodes.length,
            rootNodeId: discussionTreeRootNodeId(nodes),
            details: {
              ...renderDiagnosticDetails(reason),
              phase: "fit_view_completed",
              fitViewReason: reason,
              recoveryAttempted: true,
              recoveryMethod,
              fitApplied: applied,
              rootCenterSuppressedForUserInteraction:
                centerRootIfInvisible &&
                preserveUserViewport &&
                Number(after.unoccludedVisibleNodeCount ?? 0) === 0,
              recoveryResult: recovered ? "success" : applied ? "still_not_visible" : "not_applied",
              afterHealth: after.visibilityHealth,
              visibleNodeCountAfter: after.unoccludedVisibleNodeCount,
            },
          });
        })
        .catch(() => {
          if (!viewportOperationMountedRef.current) return;
          recordDiagnosticEvent("tree_render_anomaly", {
            sessionId,
            workspaceId,
            treeVersion,
            analysisVersion,
            nodeCount: nodes.length,
            rootNodeId: discussionTreeRootNodeId(nodes),
            details: {
              ...renderDiagnosticDetails(reason),
              phase: "fit_view_failed",
              fitViewReason: reason,
              recoveryAttempted: true,
              recoveryResult: "failed",
            },
          });
          if (
            lastGoodRenderFrameRef.current &&
            lastGoodRenderFrameRef.current.signature !== candidateFrame.signature
          ) {
            setSyncRejectedSignature(candidateFrame.signature);
          }
        })
        .finally(() => {
          // fitViewPendingは自分が立てたフラグなので、staleでも必ず降ろす。
          fitViewPendingRef.current = false;
          autoMovingRef.current = false;
          if (!completeViewportOperation(operation, { fitViewReason: reason })) {
            return;
          }
          if (committedSnapshotRef.current) {
            const viewport = getViewport();
            if (diagnosticViewportIsSafe(viewport)) {
              onCommittedViewportChange(viewport);
            }
          }
          setViewportObservationEpoch((current) => current + 1);
          if (deferredFitRequestRef.current) {
            setFitRetryEpoch((current) => current + 1);
          }
        });
      return true;
    },
    [
      analysisVersion,
      candidateFrame.signature,
      committedSnapshot,
      displayNodes,
      fitView,
      getViewport,
      lastManualInteractionAtRef,
      manualResetInProgressRef,
      nodes,
      onCommittedViewportChange,
      beginViewportOperation,
      paneHeight,
      paneWidth,
      renderDiagnosticDetails,
      renderedFlowNodes,
      sessionId,
      setCenter,
      completeViewportOperation,
      treeVersion,
      workspaceId,
    ],
  );
  useEffect(() => {
    if (!committedSnapshot) return;
    const deferred = deferredFitRequestRef.current;
    if (deferred) {
      requestFitView(
        deferred.reason,
        deferred.duration,
        deferred.centerRootIfInvisible,
        deferred.respectUserViewport,
      );
    }
  }, [committedSnapshot, fitRetryEpoch, requestFitView]);
  useEffect(() => {
    if (committedSnapshot && !didInitialFitRef.current) {
      // 初回表示だけは、直前の操作有無にかかわらず一度フィットさせる。
      requestFitView("initial", 300, false, false);
    }
  }, [committedSnapshot, requestFitView]);

  // 外部(AIアシスタントのカードクリック)からのフォーカス要求は、同じcommitの
  // 可視性復旧判定より先にユーザー操作として記録する。対象ノードを特定し、
  // 折りたたみで隠れていれば祖先を展開してから選択状態にする。選択とfocus対象は
  // session単位で一元管理し、後発の選択が先行のfocus操作を必ずsupersedeする。
  useEffect(() => {
    if (
      !committedSnapshot ||
      !focusItemRequest ||
      processedFocusTokenRef.current === focusItemRequest.token
    ) {
      return;
    }

    markManualInteraction();
    processedFocusTokenRef.current = focusItemRequest.token;
    const targetId = findNodeIdForAnalysisItem(displayNodes, focusItemRequest.itemId);
    if (!targetId) {
      return;
    }
    setHoveredId(null);
    setCollapsed((current) => withAncestorsExpanded(current, discussionModel, targetId));
    selectNode(targetId, { focus: true, source: "focus_item_request" });
  }, [
    committedSnapshot,
    focusItemRequest,
    displayNodes,
    discussionModel,
    markManualInteraction,
    selectNode,
    setCollapsed,
    setHoveredId,
  ]);

  const visibilityRecoveryRef = useRef({
    signature: "",
    consecutiveAttempts: 0,
    lastAttemptAt: 0,
    recovering: false,
  });
  const visibilityRecoveryMountedRef = useRef(true);
  useEffect(() => {
    visibilityRecoveryMountedRef.current = true;
    return () => {
      visibilityRecoveryMountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!committedSnapshot || renderedFlowNodes.length === 0 || paneWidth <= 0 || paneHeight <= 0) {
      return;
    }
    const viewport = getViewport();
    const observation = syncObservationRef.current;
    const renderCommitted =
      observation.internalNodeCount === renderedFlowNodes.length &&
      observation.renderedDomNodeCount === renderedFlowNodes.length &&
      reactFlowInternalNodeIdSignature ===
        renderedFlowNodes
          .map((node) => node.id)
          .sort()
          .join("\0");
    const details = renderDiagnosticDetails(
      "visibility_evaluated",
      observation,
      viewport,
      renderCommitted,
    );
    const health = details.visibilityHealth as TreeVisibilityHealth;
    const beforeHealth = lastVisibilityHealthRef.current;
    lastVisibilityHealthRef.current = health;
    const domNodeIdSignature = [
      ...(flowRootRef.current?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]") ?? []),
    ]
      .map((element) => element.dataset.id ?? "")
      .filter(Boolean)
      .sort()
      .join("\0");
    const diagnosticSignature = [
      reactFlowInternalNodeIdSignature,
      domNodeIdSignature,
      reactFlowNodesInitialized ? "initialized" : "not_initialized",
      reactFlowMeasuredNodeIdSignature,
      candidateFrameInvalidReasons.join(","),
    ].join("|");
    const visibilityDiagnosticState = [
      sessionId,
      treeVersion ?? "none",
      layoutRevision,
      health,
      diagnosticSignature,
    ].join("|");
    const visibilityStateChanged =
      lastVisibilityDiagnosticStateRef.current !== visibilityDiagnosticState;
    lastVisibilityDiagnosticStateRef.current = visibilityDiagnosticState;
    if (health === "healthy_visible") {
      lastHealthyTreeVersionRef.current = treeVersion;
      lastHealthyVisibilityRef.current = {
        viewport,
        graphBounds: (details.graphBounds as VisibilityRect | null) ?? null,
        visibleNodeCount: Number(details.visibleNodeCount ?? 0),
        treeVersion,
        renderTimestamp: new Date().toISOString(),
        frameSignature: candidateFrame.signature,
      };
      visibilityRecoveryRef.current = {
        signature: "",
        consecutiveAttempts: 0,
        lastAttemptAt: 0,
        recovering: false,
      };
      if (beforeHealth && beforeHealth !== "healthy_visible") {
        recordDiagnosticEvent("tree_visibility_recovered", {
          sessionId,
          workspaceId,
          treeVersion,
          analysisVersion,
          nodeCount: nodes.length,
          rootNodeId: discussionTreeRootNodeId(nodes),
          details: {
            ...details,
            beforeReason: beforeHealth,
            recoveryMethod: "event_driven_visibility_recheck",
            visibleNodeCountAfter: details.visibleNodeCount,
            viewportAfter: viewport,
          },
        });
      }
      return;
    }
    const recentlyManipulated =
      Date.now() - lastManualInteractionAtRef.current < AUTO_FOLLOW_INTERACTION_GRACE_MS;
    const lastHealthy = lastHealthyVisibilityRef.current;
    const structuralDrift =
      !lastHealthy ||
      lastHealthy.frameSignature !== candidateFrame.signature ||
      lastHealthy.treeVersion !== treeVersion;
    const hasNoActuallyVisibleNodes = Number(details.unoccludedVisibleNodeCount ?? 0) === 0;
    const recoverable =
      !userInteractionActiveRef.current &&
      !manualResetInProgressRef.current &&
      !recentlyManipulated &&
      hasNoActuallyVisibleNodes &&
      health !== "container_hidden" &&
      health !== "container_zero_size" &&
      health !== "empty_tree_expected" &&
      health !== "empty_tree_unexpected" &&
      health !== "layout_incomplete" &&
      health !== "invalid_node_coordinates" &&
      health !== "render_not_committed";
    let recoveryMethod = "none";
    if (
      recoverable &&
      (health === "node_layer_hidden" ||
        health === "node_layer_transparent" ||
        health === "ancestor_hidden" ||
        health === "nodes_exist_but_fully_occluded")
    ) {
      recoveryMethod = "layer_state_recheck";
    } else if (recoverable && (health === "nodes_not_initialized" || health === "stale_dom_only")) {
      recoveryMethod = "update_node_internals";
    } else if (
      recoverable &&
      lastHealthy &&
      lastHealthy.treeVersion === treeVersion &&
      diagnosticViewportIsSafe(lastHealthy.viewport)
    ) {
      recoveryMethod = "last_known_good_viewport";
    } else if (recoverable) {
      recoveryMethod = "fit_view";
    }
    const signature = [
      treeVersion ?? "none",
      candidateFrame.signature,
      paneWidth,
      paneHeight,
      renderedFlowNodes.length,
      details.graphBounds ? JSON.stringify(details.graphBounds) : "none",
    ].join(":");
    const recoveryState = visibilityRecoveryRef.current;
    if (recoveryState.signature !== signature) {
      recoveryState.signature = signature;
      recoveryState.consecutiveAttempts = 0;
      recoveryState.lastAttemptAt = 0;
      recoveryState.recovering = false;
    }
    const recoveryCooldownActive =
      recoveryState.lastAttemptAt > 0 &&
      Date.now() - recoveryState.lastAttemptAt < VISIBILITY_RECOVERY_COOLDOWN_MS;
    const recoveryLimitReached =
      recoveryState.consecutiveAttempts >= MAX_CONSECUTIVE_VISIBILITY_RECOVERIES;
    const recoveryAllowed =
      recoverable &&
      recoveryMethod !== "none" &&
      !recoveryState.recovering &&
      !recoveryCooldownActive &&
      !recoveryLimitReached;
    if (visibilityStateChanged) {
      recordDiagnosticEvent("tree_visibility_unhealthy", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: nodes.length,
        rootNodeId: discussionTreeRootNodeId(nodes),
        details: {
          ...details,
          reason: health,
          layoutRevision,
          diagnosticSignature,
          userInteractionActive: userInteractionActiveRef.current,
          lastUserViewportInteractionAt:
            lastManualInteractionAtRef.current > 0
              ? new Date(lastManualInteractionAtRef.current).toISOString()
              : null,
          recoveryAttempted: recoveryAllowed,
          recoveryMethod,
          recoverySucceeded: false,
          recoveryCooldownActive,
          recoveryAttempt: recoveryState.consecutiveAttempts + 1,
          recoveryLimitReached,
        },
      });
    }
    if (!recoveryAllowed) {
      return;
    }
    recoveryState.recovering = true;
    recoveryState.lastAttemptAt = Date.now();
    recoveryState.consecutiveAttempts += 1;
    const finishRecovery = () => {
      if (!visibilityRecoveryMountedRef.current) return;
      recoveryState.recovering = false;
      setViewportObservationEpoch((current) => current + 1);
    };
    if (recoveryMethod === "layer_state_recheck") {
      window.requestAnimationFrame(finishRecovery);
      return;
    }
    if (recoveryMethod === "update_node_internals") {
      updateNodeInternals(renderedFlowNodes.map((node) => node.id));
      window.requestAnimationFrame(finishRecovery);
      return;
    }
    if (recoveryMethod === "last_known_good_viewport" && lastHealthy) {
      const animationFrame = window.requestAnimationFrame(() => {
        const preserveUserViewport =
          userInteractionActiveRef.current ||
          Date.now() - lastManualInteractionAtRef.current < AUTO_FOLLOW_INTERACTION_GRACE_MS;
        if (preserveUserViewport) {
          recoveryState.consecutiveAttempts = Math.max(0, recoveryState.consecutiveAttempts - 1);
          recoveryState.lastAttemptAt = 0;
          finishRecovery();
          return;
        }
        autoMovingRef.current = true;
        automaticRecoveryActiveRef.current = true;
        const operation = beginViewportOperation("visibility_recovery_last_known_good_viewport");
        void Promise.resolve(setViewport(lastHealthy.viewport, { duration: 0 })).finally(() => {
          autoMovingRef.current = false;
          automaticRecoveryActiveRef.current = false;
          if (!completeViewportOperation(operation)) return;
          if (committedSnapshotRef.current) {
            const viewport = getViewport();
            if (diagnosticViewportIsSafe(viewport)) onCommittedViewportChange(viewport);
          }
          if (!visibilityRecoveryMountedRef.current) return;
          finishRecovery();
        });
      });
      return () => window.cancelAnimationFrame(animationFrame);
    }
    automaticRecoveryActiveRef.current = true;
    requestFitView(health, 200, true);
    automaticRecoveryActiveRef.current = false;
    recoveryState.recovering = false;
  }, [
    analysisVersion,
    beginViewportOperation,
    candidateFrame.signature,
    candidateFrameInvalidReasons,
    committedSnapshot,
    completeViewportOperation,
    renderedFlowNodes,
    getViewport,
    layoutRevision,
    paneHeight,
    paneWidth,
    reactFlowInternalNodeIdSignature,
    reactFlowMeasuredNodeIdSignature,
    reactFlowNodesInitialized,
    nodes,
    onCommittedViewportChange,
    renderDiagnosticDetails,
    requestFitView,
    sessionId,
    setViewport,
    treeVersion,
    updateNodeInternals,
    // pan/zoomの開始と終了はviewportを変える。操作が終わった直後は、ノードが
    // 画面外へ出ていないかを必ず測り直す(復旧するかどうかは別途grace periodで
    // 判断する)。
    viewportInteractionActive,
    viewportObservationEpoch,
    workspaceId,
  ]);

  // layoutSignal(タイムライン列の開閉など、このパネル自身のライブ更新とは
  // 無関係な外部要因による表示幅の変化)が変わったときだけ、一度だけ再フィットする。
  // 初回フィットが済む前の変化は上のuseEffectに任せるため無視する。
  const previousLayoutSignalRef = useRef(layoutSignal);
  useEffect(() => {
    const previous = previousLayoutSignalRef.current;
    previousLayoutSignalRef.current = layoutSignal;
    if (!committedSnapshot) return;
    if (!didInitialFitRef.current || layoutSignal === previous) {
      return;
    }
    requestFitView("layout_signal", 200);
  }, [committedSnapshot, layoutSignal, requestFitView]);

  const queueStructuralFocus = useCallback(
    (targetIds: string[]) => {
      setCollapsed((current) => {
        let next = current;
        for (const targetId of targetIds) {
          next = withAncestorsExpanded(next, discussionModel, targetId);
        }
        return next;
      });
      setQueuedAutoFocusIds(targetIds);
    },
    [discussionModel],
  );

  // First render establishes a baseline only. Later versions use the
  // server-provided structural diff when present, with a local comparison as
  // a compatibility fallback for old payloads.
  useEffect(() => {
    if (snapshotRole === "standby") {
      previousStructuralNodesRef.current = displayNodes;
      setQueuedAutoFocusIds([]);
      return;
    }
    if (!committedSnapshot) {
      // Pending layout/measurement must inherit the committed viewport exactly.
      // Structural focus is evaluated only after this same slot is promoted.
      return;
    }
    const previous = previousStructuralNodesRef.current;
    previousStructuralNodesRef.current = displayNodes;
    if (previous === null) {
      return;
    }
    const changes = deriveTreeChanges(previous, displayNodes, treeChanges);
    const signature = treeChangeSignature(changes);
    if (processedTreeChangeRef.current === signature) {
      return;
    }
    const targetIds = focusTargetIds(changes, displayNodes);
    if (targetIds.length === 0) {
      return;
    }
    processedTreeChangeRef.current = signature;

    setStructuralHighlightIds(new Set(targetIds));
    if (structuralHighlightTimerRef.current) {
      clearTimeout(structuralHighlightTimerRef.current);
    }
    structuralHighlightTimerRef.current = setTimeout(
      () => setStructuralHighlightIds(new Set()),
      STRUCTURAL_HIGHLIGHT_MS,
    );

    const now = Date.now();
    if (
      shouldDeferTreeFocus({
        autoFollow,
        selected: selectedId !== null,
        hovered: hoveredId !== null,
        now,
        lastManualInteractionAt: lastManualInteractionAtRef.current,
        interactionGraceMs: AUTO_FOLLOW_INTERACTION_GRACE_MS,
        lastAutoFocusAt: lastAutoFocusAtRef.current,
        cooldownMs: AUTO_FOLLOW_COOLDOWN_MS,
      })
    ) {
      setPendingAutoFocusIds(targetIds);
      return;
    }
    setPendingAutoFocusIds([]);
    queueStructuralFocus(targetIds);
  }, [
    autoFollow,
    committedSnapshot,
    hoveredId,
    displayNodes,
    queueStructuralFocus,
    selectedId,
    snapshotRole,
    treeChanges,
  ]);

  useEffect(() => {
    if (!committedSnapshot || queuedAutoFocusIds.length === 0) {
      return;
    }
    const targets = queuedAutoFocusIds
      .map((id) => renderedFlowNodes.find((node) => node.id === id))
      .filter((node): node is DiscussionFlowNode => node !== undefined);
    if (targets.length !== queuedAutoFocusIds.length) {
      return;
    }
    if (paneWidth <= 0 || paneHeight <= 0) {
      return;
    }
    setQueuedAutoFocusIds([]);
    const viewport = getViewport();
    if (!isFiniteViewport(viewport)) {
      requestFitView("invalid_viewport_before_focus", 0, false, false);
      return;
    }
    if (
      allTargetsVisible(
        targets.map((node) => node.position),
        viewport,
        { width: paneWidth, height: paneHeight },
        { width: NODE_WIDTH, height: NODE_HEIGHT },
      )
    ) {
      lastAutoFocusAtRef.current = Date.now();
      return;
    }

    const targetParentIds = new Set(
      targets.map((node) => discussionModel.parentOf.get(node.id)).filter(Boolean),
    );
    const framingNodes = [...targets];
    if (targets.length > 1 && targetParentIds.size === 1) {
      const parentId = [...targetParentIds][0];
      const parent = parentId ? renderedFlowNodes.find((node) => node.id === parentId) : undefined;
      if (parent) {
        framingNodes.push(parent);
      }
    }
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = focusAnimationDuration(Boolean(reduceMotion));
    if (targets.length === 1) {
      const [{ position }] = targets;
      autoMovingRef.current = true;
      const operation = beginViewportOperation("structural_auto_focus_single", duration);
      void setCenterAndPublishViewport(position.x + NODE_WIDTH / 2, position.y + NODE_HEIGHT / 2, {
        zoom: viewport.zoom,
        duration,
      }).finally(() => {
        autoMovingRef.current = false;
        completeViewportOperation(operation);
      });
    } else {
      const left = Math.min(...framingNodes.map((node) => node.position.x));
      const top = Math.min(...framingNodes.map((node) => node.position.y));
      const right = Math.max(...framingNodes.map((node) => node.position.x + NODE_WIDTH));
      const bottom = Math.max(...framingNodes.map((node) => node.position.y + NODE_HEIGHT));
      const boundsWidth = right - left;
      const boundsHeight = bottom - top;
      if (
        ![left, top, right, bottom, boundsWidth, boundsHeight].every(Number.isFinite) ||
        boundsWidth < 0 ||
        boundsHeight < 0
      ) {
        requestFitView("invalid_focus_bounds", 0, false, false);
        return;
      }
      const widthZoom = paneWidth > 0 ? (paneWidth * 0.75) / boundsWidth : viewport.zoom;
      const heightZoom = paneHeight > 0 ? (paneHeight * 0.75) / boundsHeight : viewport.zoom;
      const targetZoom = Math.max(0.2, Math.min(viewport.zoom, widthZoom, heightZoom, 1));
      if (!Number.isFinite(targetZoom)) {
        requestFitView("invalid_focus_zoom", 0, false, false);
        return;
      }
      autoMovingRef.current = true;
      const operation = beginViewportOperation("structural_auto_focus_bounds", duration);
      void setCenterAndPublishViewport(left + boundsWidth / 2, top + boundsHeight / 2, {
        zoom: targetZoom,
        duration,
      }).finally(() => {
        autoMovingRef.current = false;
        completeViewportOperation(operation);
      });
    }
    lastAutoFocusAtRef.current = Date.now();
  }, [
    committedSnapshot,
    discussionModel,
    renderedFlowNodes,
    getViewport,
    lastAutoFocusAtRef,
    paneHeight,
    paneWidth,
    beginViewportOperation,
    queuedAutoFocusIds,
    requestFitView,
    completeViewportOperation,
    setCenterAndPublishViewport,
  ]);

  useEffect(
    () => () => {
      if (structuralHighlightTimerRef.current) {
        clearTimeout(structuralHighlightTimerRef.current);
      }
    },
    [],
  );

  // ノード選択で右上に NodeDetailCard が開くため、単純なビューポート中央だと
  // ノードがカードに隠れたり視覚的に右へ寄って見えたりする。パネル幅に余裕が
  // あるときは、詳細カードを除いた可視領域の中央にノードが来るよう補正する。
  const centerNodeBesideDetailCard = useCallback(
    (targetNodeId: string, position: { x: number; y: number }) => {
      const zoom = 1;
      const hasRoomForOffset =
        paneWidth - NODE_DETAIL_OVERLAY_WIDTH >= MIN_VISIBLE_WIDTH_FOR_OVERLAY_OFFSET;
      // setCenter は指定したflow座標をビューポート中央に置くので、ノード中心より
      // 右の点を渡すことでノード自体は詳細カードぶんだけ左に表示される。
      const offsetX = hasRoomForOffset ? NODE_DETAIL_OVERLAY_WIDTH / 2 / zoom : 0;
      autoMovingRef.current = true;
      const operation = beginViewportOperation("selected_node_center", 400, targetNodeId);
      void setCenterAndPublishViewport(
        position.x + NODE_WIDTH / 2 + offsetX,
        position.y + NODE_HEIGHT / 2,
        {
          zoom,
          duration: 400,
        },
      ).finally(() => {
        autoMovingRef.current = false;
        // 完了を適用できるのは、この操作がいまも現在の選択に対する操作である
        // 場合だけ。別ノードを選んだあとに届いた完了はここで捨てられ、
        // focusedNodeId も viewport の active 状態も書き換えない。
        if (completeViewportOperation(operation, { focusTargetNodeId: targetNodeId })) {
          onFocusSettled(targetNodeId, operation.selectionRevision);
        }
      });
    },
    [
      beginViewportOperation,
      completeViewportOperation,
      onFocusSettled,
      paneWidth,
      setCenterAndPublishViewport,
    ],
  );

  // 詳細パネルの関連ノードリンクなど、明示的なフォーカス要求。
  const focusNode = useCallback(
    (id: string) => {
      setHoveredId(null);
      selectNode(id, { focus: true, source: "detail_card_related_node" });
    },
    [selectNode, setHoveredId],
  );

  // 「いま移動すべき対象」が決まったら、この committed buffer でだけ移動を開始する。
  // 別ノードが選ばれた時点で pendingFocusTargetId は入れ替わるので、
  // 前ノード向けの移動が後から始まることはない。
  useEffect(() => {
    if (!committedSnapshot || !pendingFocusTargetId) {
      return;
    }
    const node = renderedFlowNodes.find((flowNode) => flowNode.id === pendingFocusTargetId);
    if (!node) {
      return;
    }
    const targetId = pendingFocusTargetId;
    onPendingFocusTargetConsumed(targetId);
    centerNodeBesideDetailCard(targetId, node.position);
  }, [
    committedSnapshot,
    pendingFocusTargetId,
    renderedFlowNodes,
    reactFlowInternalNodeCount,
    centerNodeBesideDetailCard,
    onPendingFocusTargetConsumed,
    sessionId,
    treeVersion,
  ]);

  const detailNodeId = selectedId ?? hoveredId;
  const selectedNode = detailNodeId
    ? (displayNodes.find((node) => node.id === detailNodeId) ?? null)
    : null;

  const resetTreeView = useCallback(() => {
    if (!committedSnapshot) return;
    const requestedAt = Date.now();
    const duplicateReason = manualResetInProgressRef.current
      ? "request_in_progress"
      : requestedAt - lastManualResetAtRef.current < MANUAL_RESET_DUPLICATE_WINDOW_MS
        ? "duplicate_window"
        : "";
    if (duplicateReason) {
      recordDiagnosticEvent("tree_manual_reset_ignored_duplicate", {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: nodes.length,
        rootNodeId: discussionTreeRootNodeId(nodes),
        details: {
          manualResetRequestId: manualResetRequestIdRef.current,
          reason: duplicateReason,
          committedNodeCount: renderedFlowNodes.length,
          internalNodeCount: syncObservationRef.current.internalNodeCount,
          domNodeCount: syncObservationRef.current.renderedDomNodeCount,
          measuredNodeCount: reactFlowMeasuredNodeCount,
          nodesInitialized: syncObservationRef.current.nodesInitialized,
        },
      });
      return;
    }

    manualResetInProgressRef.current = true;
    onManualResetActiveChange(true);
    lastManualResetAtRef.current = requestedAt;
    manualResetRequestIdRef.current += 1;
    const requestId = manualResetRequestIdRef.current;
    markManualInteraction();
    const observation = syncObservationRef.current;
    const viewportBefore = getViewport();
    const committedBefore =
      observation.internalNodeCount === renderedFlowNodes.length &&
      observation.renderedDomNodeCount === renderedFlowNodes.length;
    const before = renderDiagnosticDetails(
      "manual_view_reset_before",
      observation,
      viewportBefore,
      committedBefore,
    );
    const visibleNodeCountBefore = Number(before.unoccludedVisibleNodeCount ?? 0);
    const lastHealthy = lastHealthyVisibilityRef.current;
    const lastHealthyViewport = lastHealthy?.viewport;
    const safeLastHealthyViewport =
      lastHealthyViewport &&
      lastHealthy?.treeVersion === treeVersion &&
      lastHealthy?.frameSignature === candidateFrame.signature &&
      diagnosticViewportIsSafe(lastHealthyViewport)
        ? lastHealthyViewport
        : null;
    const rollbackViewport =
      safeLastHealthyViewport ??
      (diagnosticViewportIsSafe(viewportBefore) ? viewportBefore : { x: 0, y: 0, zoom: 1 });
    const rollbackViewportSource = safeLastHealthyViewport
      ? "last_known_good"
      : diagnosticViewportIsSafe(viewportBefore)
        ? "viewport_before"
        : "default";
    autoMovingRef.current = true;
    const nextFrame = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    const emitCompleted = (details: Record<string, unknown>) => {
      const input = {
        sessionId,
        workspaceId,
        treeVersion,
        analysisVersion,
        nodeCount: nodes.length,
        rootNodeId: discussionTreeRootNodeId(nodes),
        details,
      };
      recordDiagnosticEvent("tree_manual_reset_completed", input);
      // Keep the existing event as a compatibility summary for deployed log
      // consumers. It is emitted once per accepted request.
      recordDiagnosticEvent("tree_manual_view_reset", input);
    };
    recordDiagnosticEvent("tree_manual_reset_started", {
      sessionId,
      workspaceId,
      treeVersion,
      analysisVersion,
      nodeCount: nodes.length,
      rootNodeId: discussionTreeRootNodeId(nodes),
      details: {
        manualResetRequestId: requestId,
        visibilityHealthBefore: before.visibilityHealth,
        visibleNodeCountBefore,
        viewportBefore,
        committedNodeCount: renderedFlowNodes.length,
        internalNodeCount: observation.internalNodeCount,
        domNodeCount: observation.renderedDomNodeCount,
        measuredNodeCount: reactFlowMeasuredNodeCount,
        nodesInitialized: observation.nodesInitialized,
      },
    });
    const manualResetOperation = beginViewportOperation("manual_view_reset", 200);
    void (async () => {
      try {
        const fitApplied = await withSettleTimeout(
          Promise.resolve(fitView({ padding: 0.2, duration: 200 })),
          200 + VIEWPORT_OPERATION_SETTLE_MARGIN_MS,
          false,
        );
        await nextFrame();
        let viewportAfter = getViewport();
        let afterObservation = syncObservationRef.current;
        let renderCommittedAfter =
          afterObservation.internalNodeCount === renderedFlowNodes.length &&
          afterObservation.renderedDomNodeCount === renderedFlowNodes.length &&
          afterObservation.displayedNodesMeasured;
        let after = renderDiagnosticDetails(
          "manual_view_reset_after_fit",
          afterObservation,
          viewportAfter,
          renderCommittedAfter,
        );
        let recoveryMethod = "fit_view";
        if (Number(after.unoccludedVisibleNodeCount ?? 0) === 0) {
          const rootID = discussionTreeRootNodeId(displayNodes);
          const rootNode =
            renderedFlowNodes.find((node) => node.id === rootID) ?? renderedFlowNodes[0];
          if (rootNode) {
            recoveryMethod = "fit_view_then_center_root";
            await Promise.resolve(
              setCenter(
                rootNode.position.x + NODE_WIDTH / 2,
                rootNode.position.y + NODE_HEIGHT / 2,
                { zoom: 1, duration: 0 },
              ),
            );
            await nextFrame();
            viewportAfter = getViewport();
            afterObservation = syncObservationRef.current;
            renderCommittedAfter =
              afterObservation.internalNodeCount === renderedFlowNodes.length &&
              afterObservation.renderedDomNodeCount === renderedFlowNodes.length &&
              afterObservation.displayedNodesMeasured;
            after = renderDiagnosticDetails(
              "manual_view_reset_after_center",
              afterObservation,
              viewportAfter,
              renderCommittedAfter,
            );
          }
        }
        let visibleNodeCountAfter = Number(after.unoccludedVisibleNodeCount ?? 0);
        let succeeded =
          renderCommittedAfter &&
          after.visibilityHealth === "healthy_visible" &&
          visibleNodeCountAfter >= visibleNodeCountBefore;
        let rolledBack = false;
        if (!succeeded) {
          recoveryMethod = `${recoveryMethod}_then_rollback`;
          await Promise.resolve(setViewport(rollbackViewport, { duration: 0 }));
          await nextFrame();
          rolledBack = true;
          viewportAfter = getViewport();
          afterObservation = syncObservationRef.current;
          renderCommittedAfter =
            afterObservation.internalNodeCount === renderedFlowNodes.length &&
            afterObservation.renderedDomNodeCount === renderedFlowNodes.length &&
            afterObservation.displayedNodesMeasured;
          after = renderDiagnosticDetails(
            "manual_view_reset_after_rollback",
            afterObservation,
            viewportAfter,
            renderCommittedAfter,
          );
          visibleNodeCountAfter = Number(after.unoccludedVisibleNodeCount ?? 0);
          succeeded = false;
        }
        visibilityRecoveryRef.current = {
          signature: "",
          consecutiveAttempts: 0,
          lastAttemptAt: 0,
          recovering: false,
        };
        emitCompleted({
          manualResetRequestId: requestId,
          beforeHealth: before.visibilityHealth,
          visibilityHealthBefore: before.visibilityHealth,
          visibleNodeCountBefore,
          occludedNodeCountBefore: before.occludedNodeCount,
          viewportBefore,
          recoveryAttempted: true,
          recoveryMethod,
          fitApplied,
          afterHealth: after.visibilityHealth,
          visibleNodeCountAfter,
          viewportAfter,
          rolledBack,
          rollbackViewportSource,
          succeeded,
          committedNodeCount: renderedFlowNodes.length,
          internalNodeCount: afterObservation.internalNodeCount,
          domNodeCount: afterObservation.renderedDomNodeCount,
          measuredNodeCount: reactFlowMeasuredNodeCount,
          nodesInitialized: afterObservation.nodesInitialized,
          durationMs: Math.max(0, Date.now() - requestedAt),
        });
      } catch {
        await Promise.resolve(setViewport(rollbackViewport, { duration: 0 })).catch(() => false);
        await nextFrame();
        const viewportAfter = getViewport();
        const afterObservation = syncObservationRef.current;
        emitCompleted({
          manualResetRequestId: requestId,
          beforeHealth: before.visibilityHealth,
          visibilityHealthBefore: before.visibilityHealth,
          visibleNodeCountBefore,
          occludedNodeCountBefore: before.occludedNodeCount,
          viewportBefore,
          recoveryAttempted: true,
          recoveryMethod: "fit_view_failed_then_rollback",
          afterHealth: "fit_view_failed",
          visibleNodeCountAfter: Number(
            renderDiagnosticDetails(
              "manual_view_reset_failed_after_rollback",
              afterObservation,
              viewportAfter,
              false,
            ).unoccludedVisibleNodeCount ?? 0,
          ),
          viewportAfter,
          rolledBack: true,
          rollbackViewportSource,
          succeeded: false,
          committedNodeCount: renderedFlowNodes.length,
          internalNodeCount: afterObservation.internalNodeCount,
          domNodeCount: afterObservation.renderedDomNodeCount,
          measuredNodeCount: reactFlowMeasuredNodeCount,
          nodesInitialized: afterObservation.nodesInitialized,
          durationMs: Math.max(0, Date.now() - requestedAt),
        });
      } finally {
        // 単発実行の解除と操作の退役は、staleでもunmount後でも必ず行う。
        if (manualResetRequestIdRef.current === requestId) {
          manualResetInProgressRef.current = false;
          onManualResetActiveChange(false);
        }
        completeViewportOperation(manualResetOperation, { manualResetRequestId: requestId });
        if (!visibilityRecoveryMountedRef.current) return;
        autoMovingRef.current = false;
        setViewportObservationEpoch((current) => current + 1);
      }
    })();
  }, [
    analysisVersion,
    beginViewportOperation,
    candidateFrame.signature,
    committedSnapshot,
    completeViewportOperation,
    displayNodes,
    fitView,
    getViewport,
    lastManualResetAtRef,
    manualResetInProgressRef,
    manualResetRequestIdRef,
    markManualInteraction,
    nodes,
    onManualResetActiveChange,
    reactFlowMeasuredNodeCount,
    renderDiagnosticDetails,
    renderedFlowNodes,
    sessionId,
    setCenter,
    setViewport,
    treeVersion,
    workspaceId,
  ]);

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {structuralHighlightIds.size > 0
          ? `議論ツリーに${structuralHighlightIds.size}件の重要な更新があります`
          : ""}
      </div>
      <div
        ref={flowRootRef}
        className="relative h-full w-full"
        data-discussion-flow-instance-id={flowInstanceIdRef.current}
        data-discussion-provider-instance-id={providerInstanceId}
        data-discussion-buffer-slot={bufferSlot}
        data-discussion-component-key={`${sessionId || "anonymous"}:${bufferSlot}`}
        data-discussion-snapshot-role={snapshotRole}
        data-discussion-snapshot-generation={snapshotGeneration}
        data-discussion-layout-revision={layoutRevision}
        data-discussion-tree-version={renderedFrame.treeVersion ?? "none"}
        data-discussion-tree-hash={treeHash ?? ""}
        data-discussion-lkg-retained={usingLastGoodFrame ? "true" : "false"}
        data-discussion-lkg-available={lastGoodRenderFrame ? "true" : "false"}
        data-discussion-nodes-initialized={reactFlowNodesInitialized ? "true" : "false"}
        data-discussion-displayed-nodes-measured={renderedNodesMeasured ? "true" : "false"}
        data-discussion-hydration-kind={hydrationKind}
        data-discussion-selected-node-id={selectedId ?? ""}
        data-discussion-focused-node-id={focusedId ?? ""}
        data-discussion-canvas-unavailable={canvasUnavailable ? "true" : "false"}
        data-discussion-frame-invalid-reasons={candidateFrameInvalidReasons.join(",")}
        data-discussion-candidate-node-count={candidateFrame.nodes.length}
        data-discussion-internal-node-count={reactFlowInternalNodeCount}
        data-discussion-measured-node-count={reactFlowMeasuredNodeCount}
        data-discussion-rendered-dom-node-count={renderedDomNodeCount}
        data-discussion-lkg-decision={lastLKGDecisionRef.current}
        data-discussion-coordinate-strategy="edge-only-absolute"
      >
        <ReactFlow
          nodes={renderedFlowNodes}
          edges={renderedFlowEdges}
          nodeTypes={nodeTypes}
          minZoom={0.2}
          maxZoom={1.25}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          onMoveStart={(event) => {
            if (event) {
              userInteractionActiveRef.current = true;
              onViewportInteractionChange(true);
              markManualInteraction();
            }
          }}
          onMoveEnd={(event) => {
            if (event) {
              userInteractionActiveRef.current = false;
              onViewportInteractionChange(false);
              markManualInteraction();
              const viewport = getViewport();
              if (committedSnapshot && diagnosticViewportIsSafe(viewport)) {
                onCommittedViewportChange(viewport);
              }
              setViewportObservationEpoch((current) => current + 1);
            }
          }}
          onNodeClick={(_, node) => {
            markManualInteraction();
            // 同じノードの再クリックは「選択を維持したまま再フォーカス」に統一する
            // (選択解除にはしない)。空白クリックが唯一の選択解除操作。
            selectNode(node.id, { focus: true, source: "node_click" });
            const selectedNode = displayNodes.find((candidate) => candidate.id === node.id);
            const itemId = selectedNode
              ? relatedItemIdsForNode(selectedNode, analysisItemIds)[0]
              : undefined;
            if (itemId) {
              onSelectAnalysisItem?.(itemId);
            }
          }}
          onNodeMouseEnter={(_, node) => {
            markManualInteraction();
            setHoveredId(node.id);
          }}
          onNodeMouseLeave={(_, node) =>
            setHoveredId((current) => (current === node.id ? null : current))
          }
          onPaneClick={() => {
            markManualInteraction();
            selectNode(null, { focus: false, source: "pane_click" });
            setHoveredId(null);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} color="var(--node-border)" />
          <Controls showInteractive={false} position="bottom-left" />
          {(layoutResult.usedFallback || usingLastGoodFrame) && (
            <Panel position="top-left">
              <span
                className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
                style={{
                  background: "var(--ds-surface)",
                  borderColor: "var(--ds-border)",
                  color: "var(--text-sub)",
                }}
              >
                {usingLastGoodFrame
                  ? "直前の安全な表示を維持しています"
                  : "配置を安全な表示へ復旧しました"}
              </span>
            </Panel>
          )}
          <Panel position="top-right" className="flex max-w-[80%] flex-wrap justify-end gap-1">
            {pendingAutoFocusIds.length > 0 && (
              <button
                type="button"
                className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
                style={{
                  background: "var(--brand-light)",
                  borderColor: "var(--brand)",
                  color: "var(--brand)",
                }}
                aria-live="polite"
                onClick={() => {
                  markManualInteraction();
                  const targets = pendingAutoFocusIds;
                  setPendingAutoFocusIds([]);
                  queueStructuralFocus(targets);
                }}
              >
                変化を表示 ({pendingAutoFocusIds.length})
              </button>
            )}
            <button
              type="button"
              className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
              style={{
                background: "var(--ds-surface)",
                borderColor: "var(--ds-border)",
                color: "var(--text-sub)",
              }}
              onClick={resetTreeView}
            >
              表示をリセット
            </button>
            <button
              type="button"
              className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
              style={{
                background: autoFollow ? "var(--brand-light)" : "var(--ds-surface)",
                borderColor: autoFollow ? "var(--brand)" : "var(--ds-border)",
                color: autoFollow ? "var(--brand)" : "var(--text-sub)",
              }}
              aria-pressed={autoFollow}
              onClick={() => {
                markManualInteraction();
                setAutoFollow((current) => !current);
              }}
            >
              自動追従 {autoFollow ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
              style={{
                background: "var(--ds-surface)",
                borderColor: "var(--ds-border)",
                color: "var(--text-sub)",
              }}
              onClick={() => {
                markManualInteraction();
                setCollapsed(new Set());
              }}
            >
              全展開
            </button>
            <button
              type="button"
              className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
              style={{
                background: "var(--ds-surface)",
                borderColor: "var(--ds-border)",
                color: "var(--text-sub)",
              }}
              onClick={() => {
                markManualInteraction();
                setCollapsed(collapsibleNodeIds(discussionModel));
              }}
            >
              全折りたたみ
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {selectedNode && (
        <NodeDetailCard
          node={selectedNode}
          nodes={displayNodes}
          edges={treeEdges}
          analysisItems={analysisItems ?? []}
          momentIndex={momentIndex}
          agendaLabels={agendaLabels}
          onSelectAnalysisItem={onSelectAnalysisItem}
          onClose={() => {
            // 詳細パネルを閉じる = 選択解除。focus状態も同時に解除する。
            selectNode(null, { focus: false, source: "detail_card_closed" });
            setHoveredId(null);
          }}
          onFocusNode={focusNode}
        />
      )}
    </>
  );
}

// バックエンドがtentative itemの受け皿として合成する「追加論点」topicの安定ID。
// candidate段階のitemはツリーへ表示しないため、この受け皿も子が残らない限り
// 表示しない(会議開始直後から空のplaceholderが見える問題の修正)。
const UNCLASSIFIED_TOPIC_ID = "topic-unclassified";

// Tentative items stay in the API payload for audit/promotion, but are not
// full React Flow nodes. Promotion changes classificationStatus to assigned,
// so the same canonical id appears exactly once on the next render.
export function stageTentativeTree(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
  analysisItems: AnalysisItem[],
): { nodes: TreeNodePayload[]; edges: TreeEdgePayload[] } {
  // React keyとlayout graphのIDを一意に保つ。API normalize経路は既にdedupeするが、
  // 旧runtime eventや壊れたfixtureが直接渡されても一つの重複で全描画を壊さない。
  const uniqueNodes = uniqueDiscussionTreeNodes(nodes).nodes;
  const uniqueNodeIds = new Set(uniqueNodes.map((node) => node.id));
  const validEdges = edges.filter(
    (edge) => uniqueNodeIds.has(edge.source) && uniqueNodeIds.has(edge.target),
  );
  const hiddenIds = new Set(
    analysisItems
      .filter((item) => item.classificationStatus === "tentative")
      .map((item) => item.id),
  );
  for (const node of uniqueNodes) {
    if (node.agendaRole === "action_summary") {
      hiddenIds.add(node.id);
    }
  }

  // Legacy payloads may still contain the old fixed agenda skeleton. An
  // agenda-origin/materialized topic with no visible child carries no meeting
  // information, so keep it out of both the canvas and the displayed count.
  let agendaTopicRemoved = true;
  while (agendaTopicRemoved) {
    agendaTopicRemoved = false;
    for (const node of uniqueNodes) {
      const agendaTopic =
        node.kind === "topic" &&
        node.id !== "root" &&
        (node.origin === "agenda" ||
          node.materialized === true ||
          (node.agendaRefs?.length ?? 0) > 0);
      if (!agendaTopic || hiddenIds.has(node.id)) {
        continue;
      }
      const hasVisibleChild = uniqueNodes.some((candidate) => {
        if (hiddenIds.has(candidate.id)) {
          return false;
        }
        return (
          candidate.parentId === node.id ||
          validEdges.some((edge) => edge.source === node.id && edge.target === candidate.id)
        );
      });
      if (!hasVisibleChild) {
        hiddenIds.add(node.id);
        agendaTopicRemoved = true;
      }
    }
  }
  // 「追加論点」(topic-unclassified)は、tentative item除外後に表示できる子が
  // 一つも無ければ表示しない。実アジェンダだけがroot直下に並ぶ状態を保つ。
  const hasUnclassified = uniqueNodes.some((node) => node.id === UNCLASSIFIED_TOPIC_ID);
  if (hasUnclassified) {
    const edgeChildIds = new Set(
      validEdges.filter((edge) => edge.source === UNCLASSIFIED_TOPIC_ID).map((edge) => edge.target),
    );
    const hasVisibleChild = uniqueNodes.some(
      (node) =>
        (node.parentId === UNCLASSIFIED_TOPIC_ID || edgeChildIds.has(node.id)) &&
        !hiddenIds.has(node.id),
    );
    if (!hasVisibleChild) {
      hiddenIds.add(UNCLASSIFIED_TOPIC_ID);
    }
  }
  if (hiddenIds.size === 0) {
    return { nodes: uniqueNodes, edges: validEdges };
  }
  return {
    nodes: uniqueNodes.filter((node) => !hiddenIds.has(node.id)),
    edges: validEdges.filter((edge) => !hiddenIds.has(edge.source) && !hiddenIds.has(edge.target)),
  };
}

export function visibleDiscussionTreeNodeCount(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
  analysisItems: AnalysisItem[],
) {
  return stageTentativeTree(nodes, edges, analysisItems).nodes.length;
}

// signature = label|description|status。新規idまたはsignature変化idを
// 「直近更新」として約3000ms保持する。ビューポートは動かさない。
function useRecentlyUpdatedNodeIds(nodes: TreeNodePayload[]): Set<string> {
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());
  const signaturesRef = useRef<Map<string, string>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const previousSignatures = signaturesRef.current;
    const nextSignatures = new Map<string, string>();
    const changedIds: string[] = [];

    for (const node of nodes) {
      const signature = `${node.label ?? ""}|${node.description ?? ""}|${node.status ?? ""}`;
      nextSignatures.set(node.id, signature);
      if (previousSignatures.get(node.id) !== signature) {
        changedIds.push(node.id);
      }
    }
    signaturesRef.current = nextSignatures;

    if (changedIds.length === 0) {
      return;
    }

    setRecentlyUpdated((current) => {
      const next = new Set(current);
      changedIds.forEach((id) => next.add(id));
      return next;
    });

    changedIds.forEach((id) => {
      const existingTimer = timersRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setRecentlyUpdated((current) => {
          if (!current.has(id)) {
            return current;
          }
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }, 3000);
      timersRef.current.set(id, timer);
    });
  }, [nodes]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return recentlyUpdated;
}

function sortedKindCounts(counts: Record<string, number>): Array<{ kind: string; count: number }> {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([kindA], [kindB]) => {
      const rankA = KIND_ORDER.indexOf(kindA);
      const rankB = KIND_ORDER.indexOf(kindB);
      const orderA = rankA === -1 ? KIND_ORDER.length : rankA;
      const orderB = rankB === -1 ? KIND_ORDER.length : rankB;
      return orderA !== orderB ? orderA - orderB : kindA.localeCompare(kindB);
    })
    .map(([kind, count]) => ({ kind, count }));
}

// 分析itemに対応するツリーノードを探す。ノードidがitemidと一致するものを優先し、
// 無ければ relatedItemIds に含むノードを使う(relatedItemIdsForNode の逆引き)。
function findNodeIdForAnalysisItem(nodes: TreeNodePayload[], itemId: string): string | null {
  const direct = nodes.find((node) => node.id === itemId);
  if (direct) {
    return direct.id;
  }
  const related = nodes.find((node) => (node.relatedItemIds ?? []).includes(itemId));
  return related?.id ?? null;
}

// 対象ノードが見えるように、collapsed 集合から祖先ノードを取り除いた集合を返す。
// 変化が無ければ同じ参照を返して不要な再レンダを避ける。
function withAncestorsExpanded(
  collapsed: Set<string>,
  model: DiscussionTreeModel,
  nodeId: string,
): Set<string> {
  let next: Set<string> | null = null;
  let ancestor = model.parentOf.get(nodeId) ?? null;
  while (ancestor !== null) {
    if ((next ?? collapsed).has(ancestor)) {
      next = next ?? new Set(collapsed);
      next.delete(ancestor);
    }
    ancestor = model.parentOf.get(ancestor) ?? null;
  }
  return next ?? collapsed;
}

function relatedItemIdsForNode(node: TreeNodePayload, itemIds: Set<string>) {
  const ids = node.relatedItemIds ?? [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!id || !itemIds.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  };
  add(node.id);
  ids.forEach(add);
  return normalized;
}
