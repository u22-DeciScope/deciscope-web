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
  anyTargetVisible,
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
const FLOW_SYNC_SETTLE_MS = 350;
let discussionFlowInstanceSequence = 0;

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

export function DiscussionTree({
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
  const displayedNodeCount = useMemo(
    () => visibleDiscussionTreeNodeCount(nodes, edges, analysisItems ?? []),
    [analysisItems, edges, nodes],
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
        {updateStatus && <span className="mr-2 min-w-0 shrink">{updateStatus}</span>}
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ background: "var(--brand-light)", color: "var(--brand)" }}
        >
          {displayedNodeCount}
        </span>
      </div>

      <div ref={canvasRef} className="relative min-h-0 flex-1" data-testid="discussion-tree-canvas">
        {displayedNodeCount === 0 ? (
          <div className="p-4">
            <div
              className="rounded-(--ds-radius-control) border px-4 py-5 text-[12px]"
              style={{
                background: "var(--ds-surface-muted)",
                borderColor: "var(--ds-border)",
                color: "var(--text-muted)",
              }}
            >
              <p className="font-semibold" style={{ color: "var(--text-main)" }}>
                議論構造を待っています
              </p>
              <p className="mt-1 leading-5">
                分析イベントが届くと、React Flow上に論点のつながりが表示されます。
              </p>
            </div>
          </div>
        ) : (
          <ReactFlowProvider>
            <DiscussionTreeErrorBoundary
              nodes={nodes}
              sessionId={sessionId}
              workspaceId={workspaceId}
              treeVersion={treeVersion}
              resetKey={`${treeVersion ?? "none"}:${nodes.length}:${edges.length}`}
            >
              <DiscussionFlow
                sessionId={sessionId}
                nodes={nodes}
                edges={edges}
                analysisItems={analysisItems}
                segments={segments}
                onSelectAnalysisItem={onSelectAnalysisItem}
                layoutSignal={layoutSignal}
                focusItemRequest={focusItemRequest}
                treeChanges={treeChanges}
                treeVersion={treeVersion}
                treeHash={treeHash}
                observedCanvasSize={observedCanvasSize}
              />
            </DiscussionTreeErrorBoundary>
          </ReactFlowProvider>
        )}
      </div>
    </div>
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
  nodes,
  edges,
  analysisItems,
  segments,
  onSelectAnalysisItem,
  layoutSignal,
  focusItemRequest,
  treeChanges,
  treeVersion = null,
  treeHash,
  observedCanvasSize,
}: DiscussionTreeProps & {
  observedCanvasSize: { width: number; height: number } | null;
}) {
  const flowInstanceIdRef = useRef("");
  if (!flowInstanceIdRef.current) {
    discussionFlowInstanceSequence += 1;
    flowInstanceIdRef.current = `${sessionId || "anonymous"}:${discussionFlowInstanceSequence}`;
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [pendingAutoFocusIds, setPendingAutoFocusIds] = useState<string[]>([]);
  const [queuedAutoFocusIds, setQueuedAutoFocusIds] = useState<string[]>([]);
  const [structuralHighlightIds, setStructuralHighlightIds] = useState<Set<string>>(
    () => new Set(),
  );
  const previousStructuralNodesRef = useRef<TreeNodePayload[] | null>(null);
  const processedTreeChangeRef = useRef<string | null>(null);
  const lastManualInteractionAtRef = useRef(0);
  const lastAutoFocusAtRef = useRef(0);
  const autoMovingRef = useRef(false);
  const structuralHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fitView, getNode, getViewport, setCenter, setViewport } = useReactFlow();
  const reactFlowPaneWidth = useStore((state) => state.width);
  const reactFlowPaneHeight = useStore((state) => state.height);
  const reactFlowInternalNodeCount = useStore((state) => state.nodeLookup.size);
  const reactFlowInternalEdgeCount = useStore((state) => state.edgeLookup.size);
  const reactFlowNodesInitialized = useNodesInitialized({ includeHiddenNodes: true });
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

  // 折りたたみ状態。初期値は空集合(全展開)にし、全体像がまず見える状態にする。
  // 「全折りたたみ」ボタンで collapsibleNodeIds() の集合(root以外で子を持つ
  // 全ノード)へ一括切り替えできる。
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

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

  const layoutResult = useMemo(
    () => layoutDiscussionTree(orderedVisibleNodes, visibleEdges, lastGoodLayoutRef.current),
    [visibleEdges, orderedVisibleNodes],
  );
  useEffect(() => {
    if (!layoutResult.usedFallback && layoutResult.outputNodeCount > 0) {
      lastGoodLayoutRef.current = new Map(layoutResult.positions);
    }
  }, [layoutResult]);

  const flowNodes = useMemo<DiscussionFlowNode[]>(() => {
    return orderedVisibleNodes.map((node, index) => {
      const kindCounts = discussionModel.descendantKindCounts.get(node.id) ?? {};
      return {
        id: node.id,
        type: "discussion",
        position: layoutResult.positions.get(node.id) ?? { x: 0, y: index * (NODE_HEIGHT + 24) },
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
  const candidateFrameInvalidReasons = useMemo(() => {
    const reasons: string[] = [];
    if (layoutResult.layoutError) reasons.push("layout_error");
    if (layoutResult.invalidPositionNodeIds.length > 0) reasons.push("invalid_position");
    if (layoutResult.missingParentNodeIds.length > 0) reasons.push("missing_parent");
    if (layoutResult.unreachableNodeIds.length > 0) reasons.push("unreachable_node");
    if (layoutResult.cycleDetected) reasons.push("cycle");
    if (propDuplicateNodeIds.length > 0) reasons.push("duplicate_node");
    if (layoutResult.outputNodeCount !== flowNodes.length) reasons.push("node_count_mismatch");
    if (layoutResult.bounds === null) reasons.push("invalid_bounds");
    return reasons;
  }, [flowNodes.length, layoutResult, propDuplicateNodeIds.length]);
  const lastGoodRenderFrameRef = useRef<DiscussionRenderFrame | null>(null);
  const lastGoodRenderFrameSessionRef = useRef(sessionId);
  const [syncRejectedSignature, setSyncRejectedSignature] = useState<string | null>(null);
  const flowRootRef = useRef<HTMLDivElement>(null);
  const [renderedDomNodeCount, setRenderedDomNodeCount] = useState(0);
  const syncObservationRef = useRef({
    internalNodeCount: reactFlowInternalNodeCount,
    internalEdgeCount: reactFlowInternalEdgeCount,
    nodesInitialized: reactFlowNodesInitialized,
    renderedDomNodeCount,
  });
  syncObservationRef.current = {
    internalNodeCount: reactFlowInternalNodeCount,
    internalEdgeCount: reactFlowInternalEdgeCount,
    nodesInitialized: reactFlowNodesInitialized,
    renderedDomNodeCount,
  };

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
    const update = () => {
      const count = root.querySelectorAll(".react-flow__node").length;
      setRenderedDomNodeCount((current) => (current === count ? current : count));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Promote a candidate frame to LKG only after the real React Flow store and
  // DOM have converged. A candidate that still has an internal-count mismatch,
  // zero rendered nodes, or an invalid viewport after the settle window is
  // rejected; the previous positions and viewport remain visible until the
  // next snapshot/resize retry.
  useEffect(() => {
    if (
      candidateFrameInvalidReasons.length > 0 ||
      canvasUnavailable ||
      syncRejectedSignature === candidateFrame.signature
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const observation = syncObservationRef.current;
      const viewport = getViewport();
      // nodesInitialized can lag (and stays false in jsdom because there is no
      // layout engine), while a complete DOM + store count proves that every
      // node has already been materialized. Accept either signal.
      const nodesReady =
        observation.nodesInitialized ||
        observation.renderedDomNodeCount === candidateFrame.nodes.length;
      const synchronized =
        observation.internalNodeCount === candidateFrame.nodes.length &&
        observation.internalEdgeCount === candidateFrame.edges.length &&
        nodesReady &&
        observation.renderedDomNodeCount === candidateFrame.nodes.length &&
        isFiniteViewport(viewport);
      if (synchronized) {
        lastGoodRenderFrameSessionRef.current = sessionId;
        lastGoodRenderFrameRef.current = {
          ...candidateFrame,
          viewport,
        };
        setSyncRejectedSignature((current) =>
          current === candidateFrame.signature ? null : current,
        );

        return;
      }
      if (lastGoodRenderFrameRef.current) {
        setSyncRejectedSignature(candidateFrame.signature);
      }
    }, FLOW_SYNC_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [
    candidateFrame,
    candidateFrameInvalidReasons.length,
    canvasUnavailable,
    getViewport,
    sessionId,
    syncRejectedSignature,
    treeVersion,
    treeHash,
  ]);

  const restoredLkgSignatureRef = useRef("");
  useEffect(() => {
    if (!usingLastGoodFrame || !lastGoodRenderFrame) {
      return;
    }
    const reason =
      candidateFrameInvalidReasons.join(",") ||
      (canvasUnavailable ? "container_0x0" : "react_flow_sync");
    const signature = `${candidateFrame.signature}:${lastGoodRenderFrame.signature}:${reason}`;
    if (restoredLkgSignatureRef.current === signature) {
      return;
    }
    restoredLkgSignatureRef.current = signature;
    if (isFiniteViewport(lastGoodRenderFrame.viewport)) {
      void setViewport(lastGoodRenderFrame.viewport, { duration: 0 });
    }
  }, [
    candidateFrame.signature,
    candidateFrameInvalidReasons,
    canvasUnavailable,
    lastGoodRenderFrame,
    sessionId,
    setViewport,
    treeVersion,
    usingLastGoodFrame,
  ]);

  // 初回(ノードが空→非空になった最初)だけ自動フィットする。0x0のcontainerで
  // fitViewを確定させると、その後も全ノードがviewport外に残り得るため延期する。
  const didInitialFitRef = useRef(false);
  const fitViewPendingRef = useRef(false);
  const deferredFitRequestRef = useRef<{ reason: string; duration: number } | null>(null);
  const [fitRetryEpoch, setFitRetryEpoch] = useState(0);
  const requestFitView = useCallback(
    (reason: string, duration: number) => {
      if (renderedFlowNodes.length === 0 || paneWidth <= 0 || paneHeight <= 0) {
        deferredFitRequestRef.current = { reason, duration };
        return false;
      }
      if (fitViewPendingRef.current) {
        deferredFitRequestRef.current = { reason, duration };
        return false;
      }
      deferredFitRequestRef.current = null;
      fitViewPendingRef.current = true;

      void fitView({ padding: 0.2, duration })
        .then((applied) => {
          if (applied && reason === "initial") {
            didInitialFitRef.current = true;
          }
        })
        .catch(() => {
          if (
            lastGoodRenderFrameRef.current &&
            lastGoodRenderFrameRef.current.signature !== candidateFrame.signature
          ) {
            setSyncRejectedSignature(candidateFrame.signature);
          }
        })
        .finally(() => {
          fitViewPendingRef.current = false;
          if (deferredFitRequestRef.current) {
            setFitRetryEpoch((current) => current + 1);
          }
        });
      return true;
    },
    [fitView, candidateFrame.signature, paneHeight, paneWidth, renderedFlowNodes.length],
  );
  useEffect(() => {
    const deferred = deferredFitRequestRef.current;
    if (deferred) {
      requestFitView(deferred.reason, deferred.duration);
    }
  }, [fitRetryEpoch, requestFitView]);
  useEffect(() => {
    if (!didInitialFitRef.current) {
      requestFitView("initial", 300);
    }
  }, [requestFitView]);

  const viewportRecoverySignatureRef = useRef("");
  useEffect(() => {
    if (renderedFlowNodes.length === 0 || paneWidth <= 0 || paneHeight <= 0) {
      return;
    }
    const viewport = getViewport();
    const invalidViewport = !isFiniteViewport(viewport) || renderedBounds === null;
    const allNodesOutside = !anyTargetVisible(
      renderedFlowNodes.map((node) => node.position),
      viewport,
      { width: paneWidth, height: paneHeight },
      { width: NODE_WIDTH, height: NODE_HEIGHT },
    );
    const recentlyManipulated =
      Date.now() - lastManualInteractionAtRef.current < AUTO_FOLLOW_INTERACTION_GRACE_MS;
    const reason = invalidViewport
      ? "invalid_viewport"
      : allNodesOutside && !recentlyManipulated
        ? "all_nodes_outside"
        : null;
    if (!reason) {
      return;
    }
    const signature = `${reason}:${treeVersion ?? "none"}:${renderedFlowNodes.length}`;
    if (viewportRecoverySignatureRef.current === signature) {
      return;
    }
    viewportRecoverySignatureRef.current = signature;
    requestFitView(reason, 200);
  }, [
    renderedFlowNodes,
    getViewport,
    renderedBounds,
    paneHeight,
    paneWidth,
    requestFitView,
    treeVersion,
  ]);

  // layoutSignal(タイムライン列の開閉など、このパネル自身のライブ更新とは
  // 無関係な外部要因による表示幅の変化)が変わったときだけ、一度だけ再フィットする。
  // 初回フィットが済む前の変化は上のuseEffectに任せるため無視する。
  const previousLayoutSignalRef = useRef(layoutSignal);
  useEffect(() => {
    const previous = previousLayoutSignalRef.current;
    previousLayoutSignalRef.current = layoutSignal;
    if (!didInitialFitRef.current || layoutSignal === previous) {
      return;
    }
    requestFitView("layout_signal", 200);
  }, [layoutSignal, requestFitView]);

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
  }, [autoFollow, hoveredId, displayNodes, queueStructuralFocus, selectedId, treeChanges]);

  useEffect(() => {
    if (queuedAutoFocusIds.length === 0) {
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
      requestFitView("invalid_viewport_before_focus", 0);
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
    autoMovingRef.current = true;
    if (targets.length === 1) {
      const [{ position }] = targets;
      void setCenter(position.x + NODE_WIDTH / 2, position.y + NODE_HEIGHT / 2, {
        zoom: viewport.zoom,
        duration,
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
        requestFitView("invalid_focus_bounds", 0);
        return;
      }
      const widthZoom = paneWidth > 0 ? (paneWidth * 0.75) / boundsWidth : viewport.zoom;
      const heightZoom = paneHeight > 0 ? (paneHeight * 0.75) / boundsHeight : viewport.zoom;
      const targetZoom = Math.max(0.2, Math.min(viewport.zoom, widthZoom, heightZoom, 1));
      if (!Number.isFinite(targetZoom)) {
        requestFitView("invalid_focus_zoom", 0);
        return;
      }
      void setCenter(left + boundsWidth / 2, top + boundsHeight / 2, {
        zoom: targetZoom,
        duration,
      });
    }
    lastAutoFocusAtRef.current = Date.now();
    if (autoMoveTimerRef.current) {
      clearTimeout(autoMoveTimerRef.current);
    }
    autoMoveTimerRef.current = setTimeout(() => {
      autoMovingRef.current = false;
    }, duration + 50);
  }, [
    discussionModel,
    renderedFlowNodes,
    getViewport,
    paneHeight,
    paneWidth,
    queuedAutoFocusIds,
    requestFitView,
    setCenter,
  ]);

  useEffect(
    () => () => {
      if (structuralHighlightTimerRef.current) {
        clearTimeout(structuralHighlightTimerRef.current);
      }
      if (autoMoveTimerRef.current) {
        clearTimeout(autoMoveTimerRef.current);
      }
    },
    [],
  );

  // ノード選択で右上に NodeDetailCard が開くため、単純なビューポート中央だと
  // ノードがカードに隠れたり視覚的に右へ寄って見えたりする。パネル幅に余裕が
  // あるときは、詳細カードを除いた可視領域の中央にノードが来るよう補正する。
  const centerNodeBesideDetailCard = useCallback(
    (position: { x: number; y: number }) => {
      const zoom = 1;
      const hasRoomForOffset =
        paneWidth - NODE_DETAIL_OVERLAY_WIDTH >= MIN_VISIBLE_WIDTH_FOR_OVERLAY_OFFSET;
      // setCenter は指定したflow座標をビューポート中央に置くので、ノード中心より
      // 右の点を渡すことでノード自体は詳細カードぶんだけ左に表示される。
      const offsetX = hasRoomForOffset ? NODE_DETAIL_OVERLAY_WIDTH / 2 / zoom : 0;
      void setCenter(position.x + NODE_WIDTH / 2 + offsetX, position.y + NODE_HEIGHT / 2, {
        zoom,
        duration: 400,
      });
    },
    [paneWidth, setCenter],
  );

  const focusNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      setHoveredId(null);
      const node = getNode(id);
      if (node) {
        centerNodeBesideDetailCard(node.position);
      }
    },
    [getNode, centerNodeBesideDetailCard],
  );

  // 外部(AIアシスタントのカードクリック)からのフォーカス要求。対象ノードを
  // 特定し、折りたたみで隠れていれば祖先を展開してから選択状態にする。実際の
  // 中央移動は、展開後の再レイアウトが済んだ flowNodes を使う下のuseEffectで行う。
  const processedFocusTokenRef = useRef<number | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusItemRequest || processedFocusTokenRef.current === focusItemRequest.token) {
      return;
    }

    markManualInteraction();
    processedFocusTokenRef.current = focusItemRequest.token;
    const targetId = findNodeIdForAnalysisItem(displayNodes, focusItemRequest.itemId);
    if (!targetId) {
      return;
    }
    setSelectedId(targetId);
    setHoveredId(null);
    setCollapsed((current) => withAncestorsExpanded(current, discussionModel, targetId));
    setPendingFocusNodeId(targetId);
  }, [
    focusItemRequest,
    displayNodes,
    discussionModel,
    markManualInteraction,
    sessionId,
    treeVersion,
  ]);

  useEffect(() => {
    if (!pendingFocusNodeId) {
      return;
    }
    const node = renderedFlowNodes.find((flowNode) => flowNode.id === pendingFocusNodeId);
    if (!node) {
      return;
    }
    setPendingFocusNodeId(null);
    centerNodeBesideDetailCard(node.position);
  }, [
    pendingFocusNodeId,
    renderedFlowNodes,
    reactFlowInternalNodeCount,
    centerNodeBesideDetailCard,
    sessionId,
    treeVersion,
  ]);

  const detailNodeId = selectedId ?? hoveredId;
  const selectedNode = detailNodeId
    ? (displayNodes.find((node) => node.id === detailNodeId) ?? null)
    : null;

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
        data-discussion-tree-version={renderedFrame.treeVersion ?? "none"}
        data-discussion-tree-hash={treeHash ?? ""}
        data-discussion-lkg-retained={usingLastGoodFrame ? "true" : "false"}
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
            if (event && !autoMovingRef.current) {
              markManualInteraction();
            }
          }}
          onNodeClick={(_, node) => {
            markManualInteraction();
            setSelectedId(node.id);
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
            setSelectedId(null);
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
            setSelectedId(null);
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
