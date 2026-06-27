import { useCallback, useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

const tagStyle: Record<string, { bg: string; fg: string }> = {
  topic: { bg: "var(--tag-topic-bg)", fg: "var(--tag-topic-fg)" },
  claim: { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  evidence: { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  question: { bg: "var(--tag-counter-bg)", fg: "var(--tag-counter-fg)" },
  risk: { bg: "var(--tag-concern-bg)", fg: "var(--tag-concern-fg)" },
  decision: { bg: "var(--tag-policy-bg)", fg: "var(--tag-policy-fg)" },
  todo: { bg: "var(--tag-policy-bg)", fg: "var(--tag-policy-fg)" },
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 90;

type DiscussionNodeData = {
  tag: string;
  speaker: string;
  label: string;
  active: boolean;
};

type DiscussionFlowNode = Node<DiscussionNodeData, "discussion">;

type DiscussionTreeProps = {
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
};

export function DiscussionTree({ nodes, edges }: DiscussionTreeProps) {
  return (
    <div
      className="flex min-h-80 min-w-0 flex-col overflow-hidden rounded-(--ds-radius-panel) border md:min-h-0"
      style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
    >
      <div
        className="flex h-11 shrink-0 items-center border-b px-4"
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
        <span
          className="rounded-full px-2 py-1 text-[10px] font-bold"
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
            <DiscussionFlow nodes={nodes} edges={edges} />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}

function DiscussionFlow({ nodes, edges }: DiscussionTreeProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { fitView, getNode, setCenter } = useReactFlow();

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
        speaker: node.speaker_label ?? "",
        label: node.label ?? node.id,
        active: index === nodes.length - 1,
      },
    }));
  }, [nodes, treeEdges, selectedId]);

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

  useEffect(() => {
    if (selectedId === null) {
      void fitView({ padding: 0.2, duration: 300 });
    }
  }, [nodes.length, selectedId, fitView]);

  const focusNode = useCallback(
    (id: string) => {
      setSelectedId(id);
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

  const selectedNode = selectedId ? (nodes.find((node) => node.id === selectedId) ?? null) : null;

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
        onPaneClick={() => setSelectedId(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} color="var(--node-border)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      {selectedNode && (
        <NodeDetailCard
          node={selectedNode}
          nodes={nodes}
          edges={treeEdges}
          onClose={() => setSelectedId(null)}
          onFocusNode={focusNode}
        />
      )}
    </>
  );
}

function DiscussionNodeView({ data, selected }: NodeProps<DiscussionFlowNode>) {
  const style = tagStyle[data.tag] ?? tagStyle.topic;
  const emphasized = selected || data.active;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-(--ds-radius-control) border px-3 py-2.5"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        // バッジ(タグ色そのまま)が埋もれないよう、カード背景は同系色の薄いトーンにする
        background: `color-mix(in srgb, ${style.bg} 55%, var(--node-bg))`,
        borderColor: emphasized ? style.fg : `color-mix(in srgb, ${style.fg} 35%, transparent)`,
        borderWidth: emphasized ? "1.5px" : "1px",
        boxShadow: selected
          ? `0 0 0 2.5px color-mix(in srgb, ${style.fg} 30%, transparent)`
          : undefined,
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-center gap-1.5">
        <span
          className="shrink-0 rounded-sm px-1.25 py-0.75 text-[9px] font-semibold leading-none"
          style={{ background: style.bg, color: style.fg }}
        >
          {data.tag}
        </span>
        {data.speaker && (
          <span className="truncate text-[10px] font-medium" style={{ color: "var(--text-sub)" }}>
            {data.speaker}
          </span>
        )}
      </div>
      <span
        className="line-clamp-2 text-[13px] font-semibold leading-5"
        style={{ color: "var(--text-main)" }}
      >
        {data.label}
      </span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { discussion: DiscussionNodeView };

function NodeDetailCard({
  node,
  nodes,
  edges,
  onClose,
  onFocusNode,
}: {
  node: TreeNodePayload;
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  onClose: () => void;
  onFocusNode: (id: string) => void;
}) {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const parents = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => nodeById.get(edge.source))
    .filter((item): item is TreeNodePayload => item !== undefined);
  const children = edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => nodeById.get(edge.target))
    .filter((item): item is TreeNodePayload => item !== undefined);
  const style = tagStyle[node.kind ?? "topic"] ?? tagStyle.topic;

  return (
    <div
      className="absolute right-2 top-2 z-10 flex w-72 max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-(--ds-radius-panel) border"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--node-border)",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      <header
        className="flex h-9 shrink-0 items-center gap-1.5 border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="shrink-0 rounded-sm px-1.25 py-0.75 text-[9px] font-semibold leading-none"
          style={{ background: style.bg, color: style.fg }}
        >
          {node.kind ?? "topic"}
        </span>
        <span
          className="flex-1 truncate text-[11px] font-semibold"
          style={{ color: "var(--text-main)" }}
        >
          ノード詳細
        </span>
        <button
          type="button"
          className="text-[14px] leading-none"
          style={{ color: "var(--text-muted)" }}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="min-h-0 space-y-3 overflow-y-auto p-3">
        {node.speaker_label && (
          <p className="text-[10px] font-semibold" style={{ color: "var(--text-sub)" }}>
            {node.speaker_label}
          </p>
        )}
        <p className="text-[12px] leading-normal" style={{ color: "var(--text-main)" }}>
          {node.label ?? node.id}
        </p>

        <RelatedNodeList title="親ノード" items={parents} onFocusNode={onFocusNode} />
        <RelatedNodeList title="子ノード" items={children} onFocusNode={onFocusNode} />
      </div>
    </div>
  );
}

function RelatedNodeList({
  title,
  items,
  onFocusNode,
}: {
  title: string;
  items: TreeNodePayload[];
  onFocusNode: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="mb-1 text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <div className="space-y-1">
        {items.map((item) => {
          const style = tagStyle[item.kind ?? "topic"] ?? tagStyle.topic;
          return (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-1.5 rounded-(--ds-radius-control) border px-2 py-1.5 text-left"
              style={{
                background: `color-mix(in srgb, ${style.bg} 55%, var(--node-bg))`,
                borderColor: `color-mix(in srgb, ${style.fg} 35%, transparent)`,
              }}
              onClick={() => onFocusNode(item.id)}
            >
              <span
                className="shrink-0 rounded-sm px-1.25 py-0.75 text-[9px] font-semibold leading-none"
                style={{ background: style.bg, color: style.fg }}
              >
                {item.kind ?? "topic"}
              </span>
              <span className="truncate text-[11px]" style={{ color: "var(--text-main)" }}>
                {item.label ?? item.id}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// edges が空のフィクスチャでは、topic 以外のノードを直前の topic にぶら下げて
// 旧インデント表示と同じ親子関係を再現する。
function normalizeEdges(nodes: TreeNodePayload[], edges: TreeEdgePayload[]): TreeEdgePayload[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  if (validEdges.length > 0) {
    return validEdges;
  }

  const fallback: TreeEdgePayload[] = [];
  let lastTopicId: string | null = null;
  for (const node of nodes) {
    if ((node.kind ?? "topic") === "topic") {
      lastTopicId = node.id;
    } else if (lastTopicId) {
      fallback.push({
        id: `${lastTopicId}->${node.id}`,
        source: lastTopicId,
        target: node.id,
      });
    }
  }
  return fallback;
}

function layoutPositions(nodes: TreeNodePayload[], edges: TreeEdgePayload[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 72 });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const laidOut = graph.node(node.id);
    positions.set(node.id, {
      x: laidOut.x - NODE_WIDTH / 2,
      y: laidOut.y - NODE_HEIGHT / 2,
    });
  }
  return positions;
}
