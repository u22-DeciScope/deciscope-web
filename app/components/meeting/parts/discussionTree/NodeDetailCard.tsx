import type { TreeEdgePayload, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

import { tagStyle } from "./discussionTags";

export function NodeDetailCard({
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
