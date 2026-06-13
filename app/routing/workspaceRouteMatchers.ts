import { matchPath } from "react-router";
import { WORKSPACE_ROUTE_PATTERN, WORKSPACE_ROUTE_SPLAT_PATTERN } from "~/routing/workspacePaths";

export function workspaceIdFromPath(pathname: string) {
  const match =
    matchPath(WORKSPACE_ROUTE_SPLAT_PATTERN, pathname) ??
    matchPath(WORKSPACE_ROUTE_PATTERN, pathname);
  return match?.params.workspaceId ?? null;
}
