import { Component, type ErrorInfo, type ReactNode } from "react";

import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import { isMeetingStartDebugEnabled, meetingStartDebug } from "~/utils/meetingStartDebug";

type DiscussionTreeErrorBoundaryProps = {
  children: ReactNode;
  nodes: TreeNodePayload[];
  sessionId: string;
  treeVersion: number | null;
  resetKey: string;
};

type DiscussionTreeErrorBoundaryState = {
  error: Error | null;
  resetKey: string;
};

export class DiscussionTreeErrorBoundary extends Component<
  DiscussionTreeErrorBoundaryProps,
  DiscussionTreeErrorBoundaryState
> {
  state: DiscussionTreeErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: Error): Partial<DiscussionTreeErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: DiscussionTreeErrorBoundaryProps,
    state: DiscussionTreeErrorBoundaryState,
  ): Partial<DiscussionTreeErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    meetingStartDebug("meeting-page", "Discussion tree render error", {
      sessionId: this.props.sessionId || null,
      treeVersion: this.props.treeVersion,
      propNodeCount: this.props.nodes.length,
      error: error.message,
      componentStack: info.componentStack ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    const debug = isMeetingStartDebugEnabled();
    const fallbackNodes = Array.from(
      new Map(this.props.nodes.map((node) => [node.id, node])).values(),
    );
    return (
      <div
        className="h-full min-h-80 overflow-auto p-4"
        role="alert"
        data-testid="discussion-tree-render-fallback"
      >
        <div
          className="rounded-(--ds-radius-control) border px-4 py-3 text-[12px]"
          style={{
            background: "var(--ds-surface-muted)",
            borderColor: "var(--ds-border)",
            color: "var(--text-sub)",
          }}
        >
          <p className="font-semibold" style={{ color: "var(--text-main)" }}>
            議論ツリーを簡易表示しています
          </p>
          <p className="mt-1">配置処理を完了できなかったため、論点を一覧で保持しています。</p>
          {debug && (
            <p className="mt-1 font-mono text-[10px]">
              treeVersion: {this.props.treeVersion ?? "-"} / inputNodes: {this.props.nodes.length} /
              reason: {this.state.error.message}
            </p>
          )}
          <ul className="mt-3 space-y-1">
            {fallbackNodes.map((node) => (
              <li
                key={node.id}
                className="rounded px-2 py-1"
                style={{ background: "var(--ds-surface)" }}
              >
                {node.label || node.id}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
}
