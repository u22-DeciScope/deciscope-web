export function apiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL ?? "/api");
}

export function websocketBaseUrl() {
  const configured = String(import.meta.env.VITE_WS_BASE_URL ?? "/ws");
  if (/^wss?:\/\//.test(configured) || typeof window === "undefined") {
    return configured;
  }

  const url = new URL(configured, window.location.origin);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString().replace(/\/$/, "");
}
