import { apiBaseUrl } from "~/api/core/apiConfig";
import type { DiagnosticBatch } from "~/utils/clientDiagnostics/diagnosticsTypes";

export const CLIENT_DIAGNOSTICS_PATH = "/internal/client-diagnostics";

// DiagnosticsTransport は1バッチの送信結果を返す。true なら送信できたとみなし、
// false なら呼び出し側がブラウザ内バッファへ差し戻す。
export type DiagnosticsTransport = {
  send: (batch: DiagnosticBatch) => Promise<boolean>;
  // sendSync は pagehide / beforeunload 等、非同期を待てない場面で使う。
  sendSync: (batch: DiagnosticBatch) => boolean;
};

function diagnosticsUrl() {
  return `${apiBaseUrl()}${CLIENT_DIAGNOSTICS_PATH}`;
}

// httpDiagnosticsTransport は通常のバッチ送信と、退避時の sendBeacon を担う。
// どの失敗も例外にせず false を返す。
export const httpDiagnosticsTransport: DiagnosticsTransport = {
  async send(batch) {
    if (typeof fetch !== "function") {
      return false;
    }
    try {
      const response = await fetch(diagnosticsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        credentials: "include",
        // タブが閉じられる途中でも送信が中断されないようにする。
        keepalive: true,
      });
      return response.ok;
    } catch {
      return false;
    }
  },

  sendSync(batch) {
    const payload = JSON.stringify(batch);
    // sendBeacon は Blob の type をそのまま Content-Type にするため、APIの
    // application/json 制限を満たせる。dev proxy 経由の同一オリジン送信なので
    // preflight は発生しない。
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon(diagnosticsUrl(), blob)) {
          return true;
        }
      } catch {
        // sendBeacon が使えない場合は下の keepalive fetch へ落ちる。
      }
    }
    if (typeof fetch !== "function") {
      return false;
    }
    try {
      void fetch(diagnosticsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        credentials: "include",
        keepalive: true,
      }).catch(() => false);
      return true;
    } catch {
      return false;
    }
  },
};
