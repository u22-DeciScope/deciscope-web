import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
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
import { NodeDetailCard } from "./NodeDetailCard";

type DiscussionTreeProps = {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems?: AnalysisItem[];
  onSelectAnalysisItem?: (id: string) => void;
  updateStatus?: React.ReactNode;
};

export function DiscussionTree({
  nodes,
  edges,
  analysisItems,
  onSelectAnalysisItem,
  updateStatus,
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
}: DiscussionTreeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { fitView, getNode, setCenter } = useReactFlow();
  const analysisItemIds = useMemo(
    () => new Set((analysisItems ?? []).map((item) => item.id)),
    [analysisItems],
  );

  const treeEdges = useMemo(() => normalizeEdges(nodes, edges), [nodes, edges]);

  const flowNodes = useMemo<DiscussionFlowNode[]>(() => {
    const laidOut = layoutPositions(nodes, treeEdges);
    return nodes.map((node, index) => ({
      id: node.id,
      type: "discussion",
      position: laidOut.get(node.id) ?? { x: 0, y: index * (NODE_HEIGHT + 24) },
      selected: node.id === selectedId,
      data: {
        tag: node.kind ?? "topic",
        status: node.status ?? "",
        speaker: node.speaker_label ?? "",
        label: node.label ?? node.id,
        description: node.description ?? "",
        relatedCount: relatedItemIdsForNode(node, analysisItemIds).length,
        active: index === nodes.length - 1,
      },
    }));
  }, [analysisItemIds, nodes, treeEdges, selectedId]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      treeEdges.map((edge) => {
        const highlighted =
          selectedId !== null && (edge.source === selectedId || edge.target === selectedId);
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: highlighted,
          style: {
            stroke: highlighted ? "var(--brand)" : "var(--indent-line)",
            strokeWidth: highlighted ? 2 : 1.5,
          },
        };
      }),
    [treeEdges, selectedId],
  );

  // ノード数が同じでも構造が変わったら再フィットできるよう、id署名を依存にする。
  const nodeIdSignature = useMemo(() => nodes.map((node) => node.id).join("|"), [nodes]);

  useEffect(() => {
    if (selectedId === null) {
      void fitView({ padding: 0.2, duration: 300 });
    }
  }, [nodeIdSignature, selectedId, fitView]);

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
