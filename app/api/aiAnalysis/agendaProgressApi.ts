import { requestJson } from "~/api/core/apiClient";
import {
  normalizeAgendaProgress,
  type AgendaProgressPayload,
  type AgendaProgressStatus,
} from "~/api/aiAnalysis/aiAnalysisApi";

// アジェンダ進捗の手動override操作。いずれか1操作のみ(組み合わせ禁止)。
// manualStatus: null / manualCurrentTopicId: null は「自動判定に戻す」を意味する。
export type AgendaProgressOverrideInput =
  | { entryId: string; manualStatus: AgendaProgressStatus | null }
  | { manualCurrentTopicId: string | null };

const workspaceMeetingSessionsPath = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId.trim())}/meeting-sessions`;

export async function updateAgendaProgressOverride(
  workspaceId: string,
  sessionId: string,
  input: AgendaProgressOverrideInput,
): Promise<AgendaProgressPayload | null> {
  const payload = await requestJson<unknown>(
    `${workspaceMeetingSessionsPath(workspaceId)}/${encodeURIComponent(sessionId.trim())}/agenda-progress`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const source = payload as Record<string, unknown>;
  return normalizeAgendaProgress(source.agendaProgress) ?? null;
}
