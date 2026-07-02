import { Handle, Position, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";

import { tagStyle } from "./discussionTags";
import { NODE_HEIGHT, NODE_WIDTH } from "./discussionTreeLayout";

export type DiscussionNodeData = {
  tag: string;
  speaker: string;
  label: string;
  active: boolean;
};

export type DiscussionFlowNode = Node<DiscussionNodeData, "discussion">;

export function DiscussionNodeView({ data, selected }: NodeProps<DiscussionFlowNode>) {
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

export const nodeTypes: NodeTypes = { discussion: DiscussionNodeView };
