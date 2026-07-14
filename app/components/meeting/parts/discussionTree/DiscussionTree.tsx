import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  AnalysisItem,
  TreeChangesPayload,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";

import { type DiscussionFlowNode, nodeTypes } from "./DiscussionNodeView";
import { NODE_HEIGHT, NODE_WIDTH, layoutPositions, normalizeEdges } from "./discussionTreeLayout";
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

// AIアシスタントのカードクリックなど、外部から「この分析itemに対応するノードへ
// フォーカスしてほしい」という要求。同じitemIdを連続でクリックしても再フォーカス
// できるよう、要求ごとに増えるtokenを持つ。
export type DiscussionTreeFocusRequest = {
  itemId: string;
  token: number;
};

type DiscussionTreeProps = {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems?: AnalysisItem[];
  onSelectAnalysisItem?: (id: string) => void;
  updateStatus?: React.ReactNode;
  // 隣接カラム(タイムライン)の開閉など、外部要因でこのパネルの表示幅が
  // 変わったことを知らせるシグナル。値が変化した回だけ一度だけ再fitViewする。
  layoutSignal?: boolean;
  focusItemRequest?: DiscussionTreeFocusRequest | null;
  treeChanges?: TreeChangesPayload;
};

export function DiscussionTree({
  nodes,
  edges,
  analysisItems,
  onSelectAnalysisItem,
  updateStatus,
  layoutSignal,
  focusItemRequest,
  treeChanges,
}: DiscussionTreeProps) {
  return (
    <div
      className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-(--ds-radius-panel) border md:min-h-0"
      style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="flex min-h-11 shrink-0 items-center border-b px-4 py-1"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_0_4px_var(--brand-light)]"
          style={{ background: "var(--brand)" }}
        />
        <div className="ml-2 min-w-0 flex-1">
          <p className="text-[12px] font-bold" style={{ color: "var(--text-main)" }}>
            議論ツリー
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            論点・リスク・決定事項の関係
          </p>
        </div>
        {updateStatus && <span className="mr-2 min-w-0 shrink">{updateStatus}</span>}
        <span
          className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ background: "var(--brand-light)", color: "var(--brand)" }}
        >
          {nodes.length}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {nodes.length === 0 ? (
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
            <DiscussionFlow
              nodes={nodes}
              edges={edges}
              analysisItems={analysisItems}
              onSelectAnalysisItem={onSelectAnalysisItem}
              layoutSignal={layoutSignal}
              focusItemRequest={focusItemRequest}
              treeChanges={treeChanges}
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}

function DiscussionFlow({
  nodes,
  edges,
  analysisItems,
  onSelectAnalysisItem,
  layoutSignal,
  focusItemRequest,
  treeChanges,
}: DiscussionTreeProps) {
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
  const focusMetricsRef = useRef({ focused: 0, suppressed: 0, alreadyVisible: 0 });
  const { fitView, getNode, getViewport, setCenter } = useReactFlow();
  const analysisItemIds = useMemo(
    () => new Set((analysisItems ?? []).map((item) => item.id)),
    [analysisItems],
  );
  const displayTree = useMemo(
    () => addCrossCuttingAgendaReferences(nodes, edges, analysisItems ?? []),
    [nodes, edges, analysisItems],
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
  const lastNodeId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;

  const flowNodes = useMemo<DiscussionFlowNode[]>(() => {
    const laidOut = layoutPositions(visibleNodes, visibleEdges);
    return visibleNodes.map((node, index) => {
      const kindCounts = discussionModel.descendantKindCounts.get(node.id) ?? {};
      return {
        id: node.id,
        type: "discussion",
        position: laidOut.get(node.id) ?? { x: 0, y: index * (NODE_HEIGHT + 24) },
        selected: node.id === selectedId,
        data: {
          id: node.id,
          tag: node.kind ?? "topic",
          status: node.status ?? "",
          speaker: node.speaker_label ?? "",
          label: node.label ?? node.id,
          description: node.description ?? "",
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
    visibleNodes,
    visibleEdges,
    discussionModel,
    selectedId,
    analysisItemIds,
    lastNodeId,
    collapsed,
    toggleCollapse,
    focusIds,
    recentlyUpdatedIds,
    structuralHighlightIds,
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

  // 初回(ノードが空→非空になった最初)だけ自動フィットする。以降のライブ更新・
  // 展開/折りたたみでは自動フィットしない(手動フィットは既存のControlsで可能)。
  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (didInitialFitRef.current || flowNodes.length === 0) {
      return;
    }
    didInitialFitRef.current = true;
    void fitView({ padding: 0.2, duration: 300 });
  }, [flowNodes, fitView]);

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
    void fitView({ padding: 0.2, duration: 200 });
  }, [layoutSignal, fitView]);

  // パネルの実描画幅(React Flowが計測した値)。詳細カードを避ける補正に使う。
  const paneWidth = useStore((state) => state.width);
  const paneHeight = useStore((state) => state.height);

  const recordFocusMetric = useCallback(
    (outcome: "focused" | "suppressed" | "alreadyVisible", targetCount: number) => {
      focusMetricsRef.current[outcome] += 1;
      console.debug("Discussion tree structural focus.", {
        outcome,
        targetCount,
        counters: { ...focusMetricsRef.current },
      });
    },
    [],
  );

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
    previousStructuralNodesRef.current = nodes;
    if (previous === null) {
      return;
    }
    const changes = deriveTreeChanges(previous, nodes, treeChanges);
    const signature = treeChangeSignature(changes);
    if (processedTreeChangeRef.current === signature) {
      return;
    }
    const targetIds = focusTargetIds(changes, nodes);
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
      recordFocusMetric("suppressed", targetIds.length);
      return;
    }
    setPendingAutoFocusIds([]);
    queueStructuralFocus(targetIds);
  }, [
    autoFollow,
    hoveredId,
    nodes,
    queueStructuralFocus,
    recordFocusMetric,
    selectedId,
    treeChanges,
  ]);

  useEffect(() => {
    if (queuedAutoFocusIds.length === 0) {
      return;
    }
    const targets = queuedAutoFocusIds
      .map((id) => flowNodes.find((node) => node.id === id))
      .filter((node): node is DiscussionFlowNode => node !== undefined);
    if (targets.length !== queuedAutoFocusIds.length) {
      return;
    }
    setQueuedAutoFocusIds([]);
    const viewport = getViewport();
    if (
      allTargetsVisible(
        targets.map((node) => node.position),
        viewport,
        { width: paneWidth, height: paneHeight },
        { width: NODE_WIDTH, height: NODE_HEIGHT },
      )
    ) {
      lastAutoFocusAtRef.current = Date.now();
      recordFocusMetric("alreadyVisible", targets.length);
      return;
    }

    const targetParentIds = new Set(
      targets.map((node) => discussionModel.parentOf.get(node.id)).filter(Boolean),
    );
    const framingNodes = [...targets];
    if (targets.length > 1 && targetParentIds.size === 1) {
      const parentId = [...targetParentIds][0];
      const parent = parentId ? flowNodes.find((node) => node.id === parentId) : undefined;
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
      const widthZoom = paneWidth > 0 ? (paneWidth * 0.75) / boundsWidth : viewport.zoom;
      const heightZoom = paneHeight > 0 ? (paneHeight * 0.75) / boundsHeight : viewport.zoom;
      const targetZoom = Math.max(0.2, Math.min(viewport.zoom, widthZoom, heightZoom, 1));
      void setCenter(left + boundsWidth / 2, top + boundsHeight / 2, {
        zoom: targetZoom,
        duration,
      });
    }
    lastAutoFocusAtRef.current = Date.now();
    recordFocusMetric("focused", targets.length);
    if (autoMoveTimerRef.current) {
      clearTimeout(autoMoveTimerRef.current);
    }
    autoMoveTimerRef.current = setTimeout(() => {
      autoMovingRef.current = false;
    }, duration + 50);
  }, [
    discussionModel,
    flowNodes,
    getViewport,
    paneHeight,
    paneWidth,
    queuedAutoFocusIds,
    recordFocusMetric,
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
  }, [focusItemRequest, displayNodes, discussionModel, markManualInteraction]);

  useEffect(() => {
    if (!pendingFocusNodeId) {
      return;
    }
    const node = flowNodes.find((flowNode) => flowNode.id === pendingFocusNodeId);
    if (!node) {
      return;
    }
    setPendingFocusNodeId(null);
    centerNodeBesideDetailCard(node.position);
  }, [pendingFocusNodeId, flowNodes, centerNodeBesideDetailCard]);

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
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.25}
        proOptions={{ hideAttribution: false }}
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

      {selectedNode && (
        <NodeDetailCard
          node={selectedNode}
          nodes={displayNodes}
          edges={treeEdges}
          analysisItems={analysisItems ?? []}
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

// Cross-cutting agendas render deterministic reference nodes while keeping
// the canonical item node and parent untouched. The virtual node points back
// through relatedItemIds, so hover/click and assistant-card navigation resolve
// to the same canonical AnalysisItem.
export function addCrossCuttingAgendaReferences(
  nodes: TreeNodePayload[],
  edges: TreeEdgePayload[],
  analysisItems: AnalysisItem[],
): { nodes: TreeNodePayload[]; edges: TreeEdgePayload[] } {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const referenceNodes: TreeNodePayload[] = [];
  const referenceEdges: TreeEdgePayload[] = [];
  const seen = new Set<string>();

  for (const item of analysisItems) {
    if (!nodeIds.has(item.id)) {
      continue;
    }
    for (const agendaId of item.relatedAgendaIds ?? []) {
      if (!nodeIds.has(agendaId)) {
        continue;
      }
      const id = `agenda-reference:${agendaId}:${item.id}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      referenceNodes.push({
        id,
        kind: item.kind,
        parentId: agendaId,
        label: item.title,
        status: item.status,
        description: item.body,
        relatedItemIds: [item.id],
        origin: "reference",
      });
      referenceEdges.push({
        id: `${agendaId}->${id}`,
        source: agendaId,
        target: id,
        kind: "reference",
      });
    }
  }

  return {
    nodes: referenceNodes.length > 0 ? [...nodes, ...referenceNodes] : nodes,
    edges: referenceEdges.length > 0 ? [...edges, ...referenceEdges] : edges,
  };
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
