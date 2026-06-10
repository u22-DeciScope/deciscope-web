import { requestJson } from "~/api/core/apiClient";

export type BackendJobDto = {
  id: string;
  type: string;
  status: string;
  meeting_id?: string;
  result?: Record<string, unknown>;
  error?: string;
  created_at: string;
  updated_at: string;
};

export async function getJob(jobId: string) {
  return requestJson<BackendJobDto>(`/v1/jobs/${encodeURIComponent(jobId)}`);
}
