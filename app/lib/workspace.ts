export const DEMO_WORKSPACE_ID = "dummy-workspace";

export function workspacePath(workspaceId: string, path = "") {
  const normalizedPath = path === "" || path.startsWith("/") ? path : `/${path}`;
  return `/w/${encodeURIComponent(workspaceId)}${normalizedPath}`;
}

export function demoWorkspacePath(path = "") {
  return workspacePath(DEMO_WORKSPACE_ID, path);
}

export function workspaceIdFromPath(pathname: string) {
  const match = /^\/w\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function workspaceMeetingPath(workspaceId: string, meetingId: string) {
  return workspacePath(workspaceId, `/meetings/${encodeURIComponent(meetingId)}`);
}

export function workspaceMeetingSummaryPath(workspaceId: string, meetingId: string) {
  return `${workspaceMeetingPath(workspaceId, meetingId)}/summary`;
}
