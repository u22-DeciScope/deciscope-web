import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { fetchMe, type BackendSession } from "~/api/auth/authApi";
import { WorkspaceStatus } from "~/components/shared/layout/WorkspaceStatus";
import { loadLastWorkspaceId } from "~/routing/lastWorkspace";
import { workspacePath } from "~/routing/workspacePaths";

// ログイン後の遷移優先順位:
// 1. returnTo (招待リンク等) は LoginPage 側で処理済み (このリゾルバに来ない)
// 2. 所属0件 → /workspaces/new
// 3. lastWorkspaceId (localStorage) に所属している → そのワークスペース
// 4. 所属1件 → そのワークスペース
// 5. 複数 → current_workspace_id があればそこへ、なければ一覧
function resolveDestination(session: BackendSession): string {
  const workspaces = session.workspaces ?? [];
  if (workspaces.length === 0) {
    return "/workspaces/new";
  }
  const lastWorkspaceId = loadLastWorkspaceId();
  if (lastWorkspaceId && workspaces.some((item) => item.id === lastWorkspaceId)) {
    return workspacePath(lastWorkspaceId, "/meetings");
  }
  if (workspaces.length === 1) {
    return workspacePath(workspaces[0].id, "/meetings");
  }
  const current = workspaces.find((item) => item.id === session.current_workspace_id);
  if (current) {
    return workspacePath(current.id, "/meetings");
  }
  return "/workspaces";
}

export default function WorkspaceResolver() {
  const [destination, setDestination] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchMe()
      .then((session) => {
        setDestination(resolveDestination(session));
      })
      .catch(() => {
        setFailed(true);
      });
  }, []);

  if (failed) {
    return <Navigate to="/login" replace />;
  }
  if (destination) {
    return <Navigate to={destination} replace />;
  }
  return <WorkspaceStatus message="Workspaceを確認しています..." />;
}
