export const WORKSPACE_ROUTE_SEGMENT = "w";
export const WORKSPACE_ROUTE_BASE = `/${WORKSPACE_ROUTE_SEGMENT}`;
export const WORKSPACE_ROUTE_PATH = `${WORKSPACE_ROUTE_SEGMENT}/:workspaceId`;
export const WORKSPACE_ROUTE_PATTERN = `${WORKSPACE_ROUTE_BASE}/:workspaceId`;
export const WORKSPACE_ROUTE_SPLAT_PATTERN = `${WORKSPACE_ROUTE_PATTERN}/*`;

const workspacePathPrefixRegex = new RegExp(`^/${WORKSPACE_ROUTE_SEGMENT}/([^/]+)`);

export function workspacePath(workspaceId: string, path = "") {
  const normalizedPath = path === "" || path.startsWith("/") ? path : `/${path}`;
  return `${WORKSPACE_ROUTE_BASE}/${encodeURIComponent(workspaceId)}${normalizedPath}`;
}

export function workspaceIdSegmentFromPath(pathname: string) {
  return pathname.match(workspacePathPrefixRegex)?.[1] ?? null;
}

export function workspaceMeetingPath(workspaceId: string, meetingId: string) {
  return workspacePath(workspaceId, `/meetings/${encodeURIComponent(meetingId)}`);
}

export function workspaceMeetingSummaryPath(workspaceId: string, meetingId: string) {
  return `${workspaceMeetingPath(workspaceId, meetingId)}/summary`;
}
