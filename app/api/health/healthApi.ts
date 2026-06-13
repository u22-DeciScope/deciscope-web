import { requestJson } from "~/api/core/apiClient";

export type HealthResponseDto = {
  status: string;
  time?: string;
};

export async function fetchV1Health() {
  return requestJson<HealthResponseDto>("/v1/health");
}
