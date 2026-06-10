import { DEMO_WORKSPACE_ID } from "~/config/demoWorkspace";

export function workspacePath(workspaceId: string, path = "") {
  const normalizedPath = path === "" || path.startsWith("/") ? path : `/${path}`;
  return `/w/${encodeURIComponent(workspaceId)}${normalizedPath}`;
}

export function demoWorkspacePath(path = "") {
  return workspacePath(DEMO_WORKSPACE_ID, path);
}

export function workspaceMeetingPath(workspaceId: string, meetingId: string) {
  return workspacePath(workspaceId, `/meetings/${encodeURIComponent(meetingId)}`);
}

export function workspaceMeetingSummaryPath(workspaceId: string, meetingId: string) {
  return `${workspaceMeetingPath(workspaceId, meetingId)}/summary`;
}
