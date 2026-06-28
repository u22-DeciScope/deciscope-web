import { Navigate, useLocation } from "react-router";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

export default function Workspace() {
  const { hash, pathname, search } = useLocation();
  const currentPath = `${pathname}${search}${hash}`;
  meetingStartDebug("workspace-route", "redirecting to meetings index", {
    source: "workspace-route",
    reason: "workspace_index",
    currentPath,
    targetPath: "meetings",
  });
  return <Navigate to="meetings" replace />;
}
