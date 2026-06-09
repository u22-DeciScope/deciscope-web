import { requestJson } from "~/api/core/apiClient";
import type { BackendJobDto } from "~/api/jobs/jobsApi";

export type BackendUploadDto = {
  id: string;
  filename: string;
  media_type: string;
  path: string;
  job_id: string;
  created_at: string;
};

export async function uploadFile(file: File) {
  const form = new FormData();
  form.set("file", file);
  return requestJson<{ upload: BackendUploadDto; job: BackendJobDto }>("/v1/uploads", {
    method: "POST",
    body: form,
  });
}
