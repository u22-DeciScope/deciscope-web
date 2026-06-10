import { matchPath } from "react-router";

export function workspaceIdFromPath(pathname: string) {
  const match = matchPath("/w/:workspaceId/*", pathname) ?? matchPath("/w/:workspaceId", pathname);
  return match?.params.workspaceId ?? null;
}
