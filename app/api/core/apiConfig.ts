export function apiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL ?? "/api");
}

export function websocketBaseUrl() {
  const configured = String(import.meta.env.VITE_WS_BASE_URL ?? "/ws").trim() || "/ws";
  const url = new URL(configured, browserOrigin());
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    url.protocol = defaultWebSocketProtocol();
  }
  return url.toString().replace(/\/$/, "");
}

function browserOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:5193";
}

function defaultWebSocketProtocol() {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return "wss:";
  }
  return "ws:";
}
