import { Component, type ErrorInfo, type ReactNode } from "react";

import { recordDiagnosticEvent, truncateStack } from "~/utils/clientDiagnostics/clientDiagnostics";

type MeetingDiagnosticsBoundaryProps = {
  children: ReactNode;
  sessionId: string;
  workspaceId: string;
  treeVersion: number | null;
  nodeCount: number;
  // resetKey が変わると再描画を試みる。ツリー更新で自然に復帰できるようにする。
  resetKey: string;
};

type MeetingDiagnosticsBoundaryState = {
  error: Error | null;
  resetKey: string;
};

// 会議画面全体の描画例外を react_error_captured として記録する境界。
// 議論ツリー内部の例外は DiscussionTreeErrorBoundary が先に捕捉するため、
// ここへ来るのはツリー外(ヘッダー・タイムライン・アシスタント等)の例外。
export class MeetingDiagnosticsBoundary extends Component<
  MeetingDiagnosticsBoundaryProps,
  MeetingDiagnosticsBoundaryState
> {
  state: MeetingDiagnosticsBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<MeetingDiagnosticsBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: MeetingDiagnosticsBoundaryProps,
    state: MeetingDiagnosticsBoundaryState,
  ): Partial<MeetingDiagnosticsBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDiagnosticEvent("react_error_captured", {
      sessionId: this.props.sessionId,
      workspaceId: this.props.workspaceId,
      treeVersion: this.props.treeVersion,
      nodeCount: this.props.nodeCount,
      details: {
        boundary: "meeting_page",
        errorName: error.name,
        // 機密混入の可能性を考慮し、メッセージとスタックにサイズ制限を設ける。
        errorMessage: truncateStack(error.message),
        componentStack: truncateStack(info.componentStack),
      },
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div
        className="flex h-full min-h-40 flex-col items-start justify-center gap-2 rounded-(--ds-radius-panel) border p-4 text-[12px]"
        role="alert"
        data-testid="meeting-render-fallback"
        style={{
          background: "var(--ds-surface-muted)",
          borderColor: "var(--ds-border)",
          color: "var(--text-sub)",
        }}
      >
        <p className="font-semibold" style={{ color: "var(--text-main)" }}>
          会議画面の一部を表示できませんでした
        </p>
        <p>文字起こしと議論ツリーの受信は継続しています。ページを再読み込みしてください。</p>
      </div>
    );
  }
}
