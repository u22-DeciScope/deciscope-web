import { Handle, Position, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import { HiCheck } from "react-icons/hi2";

import {
  analysisKindLabel,
  dimmedColor,
  resolvedBadgeColor,
} from "~/components/meeting/parts/analysisKindPalette";

import { tagStyle } from "./discussionTags";
import { NODE_HEIGHT, NODE_WIDTH } from "./discussionTreeLayout";

export type DiscussionNodeData = {
  tag: string;
  status: string;
  speaker: string;
  label: string;
  description: string;
  relatedCount: number;
  active: boolean;
};

export type DiscussionFlowNode = Node<DiscussionNodeData, "discussion">;

export function DiscussionNodeView({ data, selected }: NodeProps<DiscussionFlowNode>) {
  const style = tagStyle[data.tag] ?? tagStyle.topic;
  const emphasized = selected || data.active;
  const resolved = data.status === "resolved";
  // バッジ(タグ色そのまま)が埋もれないよう、カード背景は同系色の薄いトーンにする。
  // resolved時は色相を保ったまま背景・枠線だけをさらに減衰させ(本文テキストは
  // 減衰しない)、選択/強調時は減衰前の枠線強度をそのまま使う。
  const baseBackground = `color-mix(in srgb, ${style.bg} 55%, var(--node-bg))`;
  const baseBorder = `color-mix(in srgb, ${style.fg} 35%, transparent)`;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-(--ds-radius-control) border px-3 py-2.5"
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: resolved ? dimmedColor(baseBackground, 45) : baseBackground,
        borderColor: emphasized
          ? style.fg
          : resolved
            ? dimmedColor(baseBorder, 45)
            : baseBorder,
        borderWidth: emphasized ? "1.5px" : "1px",
        // resolved時は色(減衰)に加えて破線枠にすることで、色覚多様性があっても
        // 「解決済」であることを判別できるようにする。
        borderStyle: resolved ? "dashed" : undefined,
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
          {analysisKindLabel(data.tag)}
        </span>
        {resolved && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.25 py-0.5 text-[9px] font-bold leading-none"
            style={{ background: resolvedBadgeColor.bg, color: resolvedBadgeColor.fg }}
          >
            <HiCheck className="h-2.5 w-2.5" />
            解決済
          </span>
        )}
        {data.speaker && (
          <span className="truncate text-[10px] font-medium" style={{ color: "var(--text-sub)" }}>
            {data.speaker}
          </span>
        )}
        {data.relatedCount > 0 && (
          <span className="ml-auto shrink-0 text-[9px] font-semibold" style={{ color: style.fg }}>
            関連カード{data.relatedCount}
          </span>
        )}
      </div>
      <span
        className="line-clamp-1 text-[13px] font-semibold leading-5"
        style={{ color: "var(--text-main)" }}
      >
        {data.label}
      </span>
      {data.description && (
        <span className="line-clamp-1 text-[11px] leading-4" style={{ color: "var(--text-sub)" }}>
          {data.description}
        </span>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

export const nodeTypes: NodeTypes = { discussion: DiscussionNodeView };
