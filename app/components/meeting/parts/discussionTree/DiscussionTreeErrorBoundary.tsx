import { Component, type ErrorInfo, type ReactNode } from "react";

import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import { recordDiagnosticEvent, truncateStack } from "~/utils/clientDiagnostics/clientDiagnostics";

type DiscussionTreeErrorBoundaryProps = {
  children: ReactNode;
  nodes: TreeNodePayload[];
  sessionId: string;
  workspaceId?: string;
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
    recordDiagnosticEvent("react_error_captured", {
      sessionId: this.props.sessionId,
      workspaceId: this.props.workspaceId ?? "",
      treeVersion: this.props.treeVersion,
      nodeCount: this.props.nodes.length,
      details: {
        boundary: "discussion_tree",
        errorName: error.name,
        // メッセージ・スタックは機密混入の可能性を考慮して上限を設ける。
        errorMessage: truncateStack(error.message),
        componentStack: truncateStack(info.componentStack),
      },
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
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
