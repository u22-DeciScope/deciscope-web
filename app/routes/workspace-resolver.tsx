import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { fetchMe } from "~/api/auth/authApi";
import { WorkspaceStatus } from "~/components/shared/layout/WorkspaceStatus";
import { workspacePath } from "~/routing/workspacePaths";

export default function WorkspaceResolver() {
  const [destination, setDestination] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchMe()
      .then((session) => {
        const workspaceId =
          session.workspaces.find((item) => item.id === session.current_workspace_id)?.id ??
          session.workspaces[0]?.id;
        setDestination(workspaceId ? workspacePath(workspaceId, "/meetings") : "/login");
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <Navigate to="/login" replace />;
  if (destination) return <Navigate to={destination} replace />;
  return <WorkspaceStatus message="Workspaceを確認しています..." />;
}
