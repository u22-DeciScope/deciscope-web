import { apiBaseUrl } from "~/api/core/apiConfig";

type ApiRequestOptions = RequestInit;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await requestRaw(path, options);
  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) {
    handleUnauthorized(response);
    throw new ApiError(responseErrorMessage(response, text, payload), response.status);
  }
  return payload as T;
}

function handleUnauthorized(response: Response) {
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("deciscope:unauthorized"));
  }
}

async function requestRaw(path: string, options: ApiRequestOptions) {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const requestUrl = `${apiBaseUrl()}${path}`;

  try {
    return await fetch(requestUrl, {
      ...options,
      headers,
      credentials: "include",
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
