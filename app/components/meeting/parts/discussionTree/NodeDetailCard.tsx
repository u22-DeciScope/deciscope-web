import { HiCheck } from "react-icons/hi2";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import {
  analysisKindLabel,
  dimmedColor,
  issueSubtypeLabel,
  resolvedBadgeColor,
} from "~/components/meeting/parts/analysisKindPalette";

import { tagStyle } from "./discussionTags";

// resolved(解決済)を示す共通バッジ。ヘッダー・関連カード・関連ノードの各チップで
// 同じ見た目(緑系の塗り背景+チェックマーク)を使い回す。
function ResolvedBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.25 py-0.5 text-[9px] font-bold leading-none"
      style={{ background: resolvedBadgeColor.bg, color: resolvedBadgeColor.fg }}
    >
      <HiCheck className="h-2.5 w-2.5" />
      解決済
    </span>
  );
}

export function NodeDetailCard({
  node,
  nodes,
  edges,
  analysisItems,
  onSelectAnalysisItem,
  onClose,
  onFocusNode,
}: {
  node: TreeNodePayload;
  nodes: TreeNodePayload[];
  edges: TreeEdgePayload[];
  analysisItems: AnalysisItem[];
  onSelectAnalysisItem?: (id: string) => void;
  onClose: () => void;
  onFocusNode: (id: string) => void;
}) {
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const analysisItemById = new Map(analysisItems.map((item) => [item.id, item]));
  const parents = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => nodeById.get(edge.source))
    .filter((item): item is TreeNodePayload => item !== undefined);
  const children = edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => nodeById.get(edge.target))
    .filter((item): item is TreeNodePayload => item !== undefined);
  const relatedAnalysisItems = relatedItemIdsForNode(node, analysisItemById)
    .map((id) => analysisItemById.get(id))
    .filter((item): item is AnalysisItem => item !== undefined);
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
          {node.kind === "issue"
            ? issueSubtypeLabel(node.subtype)
            : analysisKindLabel(node.kind ?? "topic")}
        </span>
        {node.status === "resolved" && <ResolvedBadge />}
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
        {node.description && (
          <p className="text-[11px] leading-5" style={{ color: "var(--text-sub)" }}>
            {node.description}
          </p>
        )}

        <RelatedAnalysisItemList
          items={relatedAnalysisItems}
          onSelectAnalysisItem={onSelectAnalysisItem}
        />
        <RelatedNodeList title="親ノード" items={parents} onFocusNode={onFocusNode} />
        <RelatedNodeList title="子ノード" items={children} onFocusNode={onFocusNode} />
      </div>
    </div>
  );
}

function relatedItemIdsForNode(node: TreeNodePayload, analysisItemById: Map<string, AnalysisItem>) {
  const ids = node.relatedItemIds ?? [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!id || !analysisItemById.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  };
  add(node.id);
  ids.forEach(add);
  return normalized;
}

function RelatedAnalysisItemList({
  items,
  onSelectAnalysisItem,
}: {
  items: AnalysisItem[];
  onSelectAnalysisItem?: (id: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="mb-1 text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
        関連カード
      </h3>
      <div className="space-y-1">
        {items.map((item) => {
          const style = tagStyle[item.kind] ?? tagStyle.topic;
          const resolved = item.status === "resolved";
          const baseBackground = `color-mix(in srgb, ${style.bg} 55%, var(--node-bg))`;
          const baseBorder = `color-mix(in srgb, ${style.fg} 35%, transparent)`;
          return (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-1.5 rounded-(--ds-radius-control) border px-2 py-1.5 text-left"
              style={{
                background: resolved ? dimmedColor(baseBackground, 45) : baseBackground,
                borderColor: resolved ? dimmedColor(baseBorder, 45) : baseBorder,
                borderStyle: resolved ? "dashed" : undefined,
              }}
              onClick={() => onSelectAnalysisItem?.(item.id)}
            >
              <span
                className="shrink-0 rounded-sm px-1.25 py-0.75 text-[9px] font-semibold leading-none"
                style={{ background: style.bg, color: style.fg }}
              >
                {analysisKindLabel(item.kind)}
              </span>
              <span className="truncate text-[11px]" style={{ color: "var(--text-main)" }}>
                {item.title || item.id}
              </span>
              {resolved && (
                <span className="ml-auto shrink-0">
                  <ResolvedBadge />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
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
          const resolved = item.status === "resolved";
          const baseBackground = `color-mix(in srgb, ${style.bg} 55%, var(--node-bg))`;
          const baseBorder = `color-mix(in srgb, ${style.fg} 35%, transparent)`;
          return (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-1.5 rounded-(--ds-radius-control) border px-2 py-1.5 text-left"
              style={{
                background: resolved ? dimmedColor(baseBackground, 45) : baseBackground,
                borderColor: resolved ? dimmedColor(baseBorder, 45) : baseBorder,
                borderStyle: resolved ? "dashed" : undefined,
              }}
              onClick={() => onFocusNode(item.id)}
            >
              <span
                className="shrink-0 rounded-sm px-1.25 py-0.75 text-[9px] font-semibold leading-none"
                style={{ background: style.bg, color: style.fg }}
              >
                {analysisKindLabel(item.kind ?? "topic")}
              </span>
              <span className="truncate text-[11px]" style={{ color: "var(--text-main)" }}>
                {item.label ?? item.id}
              </span>
              {resolved && (
                <span className="ml-auto shrink-0">
                  <ResolvedBadge />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
