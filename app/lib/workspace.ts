export const DUMMY_WORKSPACE_ID = "dummy-workspace";

export function workspacePath(path = "") {
  const normalizedPath = path === "" || path.startsWith("/") ? path : `/${path}`;
  return `/w/${DUMMY_WORKSPACE_ID}${normalizedPath}`;
}

export const WORKSPACE_MEETINGS_PATH = workspacePath("/meetings");

export function workspaceMeetingPath(meetingId: string) {
  return workspacePath(`/meetings/${meetingId}`);
}

export function workspaceMeetingSummaryPath(meetingId: string) {
  return `${workspaceMeetingPath(meetingId)}/summary`;
}
