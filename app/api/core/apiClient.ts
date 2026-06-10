import { getCurrentIdToken } from "~/api/firebase/firebaseAuthClient";
import { apiBaseUrl } from "~/api/core/apiConfig";

type ApiRequestOptions = RequestInit & {
  auth?: boolean;
};

export async function requestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await requestRaw(path, options);
  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) {
    throw new Error(responseErrorMessage(response, text, payload));
  }
  return payload as T;
}

export async function requestText(path: string, options: ApiRequestOptions = {}): Promise<string> {
  const response = await requestRaw(path, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(responseErrorMessage(response, text, parseJson(text)));
  }
  return text;
}

async function requestRaw(path: string, options: ApiRequestOptions) {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth) {
    const token = await getCurrentIdToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const requestUrl = `${apiBaseUrl()}${path}`;

  try {
    return await fetch(requestUrl, {
      ...options,
      headers,
    });
  } catch (error) {
    const resolvedUrl =
      typeof window === "undefined"
        ? requestUrl
        : new URL(requestUrl, window.location.origin).toString();
    throw new Error(
      `バックエンドに接続できませんでした。接続先: ${resolvedUrl}。開発サーバーとAPIサーバーが起動しているか確認してください。`,
      { cause: error },
    );
  }
}

function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function responseErrorMessage(response: Response, text: string, payload: unknown) {
  if (payload && typeof payload === "object") {
    const body = payload as {
      error?: { message?: unknown };
      message?: unknown;
    };
    if (typeof body.error?.message === "string") {
      return body.error.message;
    }
    if (typeof body.message === "string") {
      return body.message;
    }
  }

  return text.trim() || `${response.status} ${response.statusText}`.trim();
}
