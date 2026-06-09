import { requestJson } from "~/api/core/apiClient";

export type BackendLoginResponseDto = {
  status: string;
  uid?: string;
  id?: number;
  email?: string;
  name?: string;
  auth_provider?: string;
  user_store?: string;
};

export async function syncAuthLogin(idToken: string) {
  return requestJson<BackendLoginResponseDto>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

export async function fetchMe() {
  return requestJson<Record<string, unknown>>("/v1/auth/me", {
    auth: true,
  });
}

export async function fetchAuthHealth() {
  return requestJson<Record<string, unknown>>("/v1/auth/health", {
    auth: true,
  });
}
