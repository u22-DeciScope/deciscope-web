import { useCallback } from "react";

import { DsButton } from "~/components/DsButton";
import {
  downloadDiagnosticsLog,
  isDiagnosticsDownloadEnabled,
} from "~/utils/clientDiagnostics/clientDiagnostics";

type DiagnosticsDownloadButtonProps = {
  sessionId: string;
  sessionStatus: string | null;
  websocketStatus: string;
  discussionTree: Record<string, unknown>;
};

// 開発環境限定の「診断ログをダウンロード」。本番ビルドでは何も描画しない。
export function DiagnosticsDownloadButton({
  sessionId,
  sessionStatus,
  websocketStatus,
  discussionTree,
}: DiagnosticsDownloadButtonProps) {
  const handleDownload = useCallback(() => {
    downloadDiagnosticsLog({ sessionId, sessionStatus, websocketStatus, discussionTree });
  }, [discussionTree, sessionId, sessionStatus, websocketStatus]);

  if (!isDiagnosticsDownloadEnabled()) {
    return null;
  }
  return (
    <DsButton
      type="button"
      variant="secondary"
      onClick={handleDownload}
      data-testid="diagnostics-download-button"
    >
      診断ログをダウンロード
    </DsButton>
  );
}
