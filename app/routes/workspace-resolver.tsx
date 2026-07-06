import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { fetchMe } from "~/api/auth/authApi";
import { WorkspaceStatus } from "~/components/shared/layout/WorkspaceStatus";
import { workspacePath } from "~/routing/workspacePaths";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

export default function WorkspaceResolver() {
  const [destination, setDestination] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { hash, pathname, search } = useLocation();
  const currentPath = `${pathname}${search}${hash}`;

  useEffect(() => {
    fetchMe()
      .then((session) => {
        const workspaceId =
          session.workspaces.find((item) => item.id === session.current_workspace_id)?.id ??
          session.workspaces[0]?.id;
        // 所属ワークスペースがない場合は一覧画面の空状態(作成導線)へ誘導する。
        setDestination(workspaceId ? workspacePath(workspaceId, "/meetings") : "/workspaces");
      })
      .catch((cause) => {
        meetingStartDebug("workspace-resolver", "workspace fetch failed", {
          source: "workspace-resolver",
          reason: "fetch_me_failed",
          currentPath,
          targetPath: "/login",
          message: cause instanceof Error ? cause.message : String(cause),
        });
        setFailed(true);
      });
  }, [currentPath]);

  if (failed) {
    meetingStartDebug("workspace-resolver", "redirecting to login", {
      source: "workspace-resolver",
      reason: "fetch_me_failed",
      currentPath,
      targetPath: "/login",
    });
    return <Navigate to="/login" replace />;
  }
  if (destination) {
    meetingStartDebug("workspace-resolver", "redirecting to workspace", {
      source: "workspace-resolver",
      reason: "workspace_resolved",
      currentPath,
      targetPath: destination,
    });
    return <Navigate to={destination} replace />;
  }
  return <WorkspaceStatus message="Workspaceを確認しています..." />;
}
