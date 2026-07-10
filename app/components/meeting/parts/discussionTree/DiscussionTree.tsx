import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";

import { type DiscussionFlowNode, nodeTypes } from "./DiscussionNodeView";
import { NODE_HEIGHT, NODE_WIDTH, layoutPositions, normalizeEdges } from "./discussionTreeLayout";
import { buildDiscussionTreeModel, collapsibleNodeIds, isNodeVisible } from "./discussionTreeModel";
import { NodeDetailCard } from "./NodeDetailCard";

// バッジ表示・件数バッジの種別の並び順(安定した順序で見比べやすくする)。
const KIND_ORDER = ["issue", "question", "risk", "decision", "todo", "topic"];

type DiscussionTreeProps = {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems?: AnalysisItem[];
  onSelectAnalysisItem?: (id: string) => void;
  updateStatus?: React.ReactNode;
  // 隣接カラム(タイムライン)の開閉など、外部要因でこのパネルの表示幅が
  // 変わったことを知らせるシグナル。値が変化した回だけ一度だけ再fitViewする。
  layoutSignal?: boolean;
};

export function DiscussionTree({
  nodes,
  edges,
  analysisItems,
  onSelectAnalysisItem,
  updateStatus,
  layoutSignal,
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
}: DiscussionTreeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { fitView, getNode, setCenter } = useReactFlow();
  const analysisItemIds = useMemo(
    () => new Set((analysisItems ?? []).map((item) => item.id)),
    [analysisItems],
  );

  const treeEdges = useMemo(() => normalizeEdges(nodes, edges), [nodes, edges]);
  const discussionModel = useMemo(
    () => buildDiscussionTreeModel(nodes, treeEdges),
    [nodes, treeEdges],
  );

  // 折りたたみ状態。初期値は空集合(全展開)にし、全体像がまず見える状態にする。
  // 「全折りたたみ」ボタンで collapsibleNodeIds() の集合(root以外で子を持つ
  // 全ノード)へ一括切り替えできる。
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const recentlyUpdatedIds = useRecentlyUpdatedNodeIds(nodes);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const visibleIds = useMemo(() => {
    const visible = new Set<string>();
    for (const node of nodes) {
      if (isNodeVisible(discussionModel, collapsed, node.id)) {
        visible.add(node.id);
      }
    }
    return visible;
  }, [nodes, discussionModel, collapsed]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => visibleIds.has(node.id)),
    [nodes, visibleIds],
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
          recentlyUpdated: recentlyUpdatedIds.has(node.id),
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

  const focusNode = useCallback(
    (id: string) => {
      setSelectedId(id);
      setHoveredId(null);
      const node = getNode(id);
      if (node) {
        void setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, {
          zoom: 1,
          duration: 400,
        });
      }
    },
    [getNode, setCenter],
  );

  const detailNodeId = selectedId ?? hoveredId;
  const selectedNode = detailNodeId
    ? (nodes.find((node) => node.id === detailNodeId) ?? null)
    : null;

  return (
    <>
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
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
        onNodeMouseLeave={(_, node) =>
          setHoveredId((current) => (current === node.id ? null : current))
        }
        onPaneClick={() => {
          setSelectedId(null);
          setHoveredId(null);
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} color="var(--node-border)" />
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="top-right" className="flex gap-1">
          <button
            type="button"
            className="rounded-(--ds-radius-control) border px-2 py-1 text-[10px] font-semibold"
            style={{
              background: "var(--ds-surface)",
              borderColor: "var(--ds-border)",
              color: "var(--text-sub)",
            }}
            onClick={() => setCollapsed(new Set())}
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
            onClick={() => setCollapsed(collapsibleNodeIds(discussionModel))}
          >
            全折りたたみ
          </button>
        </Panel>
      </ReactFlow>

      {selectedNode && (
        <NodeDetailCard
          node={selectedNode}
          nodes={nodes}
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
