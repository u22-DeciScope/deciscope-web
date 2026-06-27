import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { HiBolt, HiNoSymbol, HiPlay, HiSignal, HiStop, HiTrash } from "react-icons/hi2";

import {
  buildTranscriptWebSocketUrl,
  fetchTranscriptSegmentHistory,
  maskWebSocketUrl,
  parseTranscriptWebSocketEvent,
  transcriptSegmentKey,
  transcriptWebSocketToken,
  type TranscriptSubscriptionFilters,
  type TranscriptSegment,
} from "~/api/transcripts/transcriptSegmentsApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

const RECONNECT_DELAYS_MS = [1000, 2000, 5000];

export default function TranscriptTestPage() {
  const [searchParams] = useSearchParams();
  const [callId, setCallId] = useState(() => searchParams.get("callId") ?? "");
  const [sessionId, setSessionId] = useState(() => searchParams.get("sessionId") ?? "");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [activeUrl, setActiveUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const lastCallIdRef = useRef("");
  const lastSessionIdRef = useRef("");
  const historyRequestIdRef = useRef(0);
  const seenKeysRef = useRef(new Set<string>());

  const latestSegment = segments[0] ?? null;
  const token = transcriptWebSocketToken();
  const canConnect = status === "disconnected" || status === "error";
  const canDisconnect =
    status === "connecting" ||
    status === "connected" ||
    status === "reconnecting" ||
    status === "error";

  const appendSegments = useCallback((incoming: TranscriptSegment[]) => {
    const accepted: TranscriptSegment[] = [];
    for (const segment of incoming) {
      if (!segment.text.trim()) {
        continue;
      }
      const key = transcriptSegmentKey(segment);
      if (seenKeysRef.current.has(key)) {
        continue;
      }
      seenKeysRef.current.add(key);
      accepted.push(segment);
    }

    if (accepted.length === 0) {
      return;
    }

    setSegments((current) => sortSegments([...accepted, ...current]));
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(
    async (filters: TranscriptSubscriptionFilters) => {
      const requestId = historyRequestIdRef.current + 1;
      historyRequestIdRef.current = requestId;
      setHistoryMessage("履歴を取得しています...");

      try {
        const result = await fetchTranscriptSegmentHistory(filters, 100);
        if (historyRequestIdRef.current !== requestId) {
          return;
        }
        appendSegments(
          result.segments.filter((segment) => segmentMatchesFilters(segment, filters)),
        );
        setHistoryMessage(
          result.unavailable
            ? "履歴取得APIはまだ利用できない可能性があります。WebSocket受信は継続します。"
            : `履歴 ${result.segments.length} 件を確認しました。`,
        );
      } catch (error) {
        if (historyRequestIdRef.current !== requestId) {
          return;
        }
        setHistoryMessage(
          `履歴を取得できませんでした: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    },
    [appendSegments],
  );

  const openSocket = useCallback(
    (filters: TranscriptSubscriptionFilters, reconnecting = false) => {
      clearReconnectTimer();
      socketRef.current?.close();

      const url = buildTranscriptWebSocketUrl(filters, token);
      const socket = new WebSocket(url);
      socketRef.current = socket;
      lastCallIdRef.current = filters.callId ?? "";
      lastSessionIdRef.current = filters.sessionId ?? "";
      manualDisconnectRef.current = false;
      setActiveUrl(url);
      setStatus(reconnecting ? "reconnecting" : "connecting");
      setMessage(null);

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          return;
        }
        reconnectAttemptRef.current = 0;
        setStatus("connected");
        setMessage("WebSocketに接続しました。");
      };

      socket.onmessage = (event) => {
        try {
          const parsed = parseTranscriptWebSocketEvent(String(event.data));
          setLastEventType(parsed.type);
          if (parsed.sessionStatus) {
            if (
              !lastSessionIdRef.current ||
              parsed.sessionStatus.sessionId === lastSessionIdRef.current
            ) {
              setSessionStatus(parsed.sessionStatus.status);
            }
            return;
          }
          if (parsed.segment) {
            const currentFilters = {
              callId: lastCallIdRef.current,
              sessionId: lastSessionIdRef.current,
            };
            if (segmentMatchesFilters(parsed.segment, currentFilters)) {
              appendSegments([parsed.segment]);
            }
          }
        } catch (error) {
          setMessage(
            `メッセージを解析できませんでした: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) {
          return;
        }
        setStatus("error");
        setMessage("WebSocketでエラーが発生しました。");
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) {
          return;
        }
        socketRef.current = null;
        if (manualDisconnectRef.current) {
          setStatus("disconnected");
          setMessage("切断しました。");
          return;
        }

        const delay =
          RECONNECT_DELAYS_MS[
            Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)
          ];
        reconnectAttemptRef.current += 1;
        setStatus("reconnecting");
        setMessage(`${Math.round(delay / 1000)}秒後に再接続します。`);
        reconnectTimerRef.current = window.setTimeout(() => {
          openSocket({ callId: lastCallIdRef.current, sessionId: lastSessionIdRef.current }, true);
        }, delay);
      };
    },
    [appendSegments, clearReconnectTimer, token],
  );

  const connect = useCallback(() => {
    const filters = { callId: callId.trim(), sessionId: sessionId.trim() };
    reconnectAttemptRef.current = 0;
    lastCallIdRef.current = filters.callId;
    lastSessionIdRef.current = filters.sessionId;
    loadHistory(filters);
    openSocket(filters, false);
  }, [callId, loadHistory, openSocket, sessionId]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("disconnected");
  }, [clearReconnectTimer]);

  const clearSegments = useCallback(() => {
    seenKeysRef.current.clear();
    setSegments([]);
    setLastEventType(null);
    setSessionStatus(null);
  }, []);

  useEffect(() => {
    setPreviewUrl(buildTranscriptWebSocketUrl({ callId, sessionId }, token));
  }, [callId, sessionId, token]);

  useEffect(() => {
    return () => {
      manualDisconnectRef.current = true;
      clearReconnectTimer();
      socketRef.current?.close();
    };
  }, [clearReconnectTimer]);

  const maskedUrl = useMemo(
    () => maskWebSocketUrl(activeUrl || previewUrl),
    [activeUrl, previewUrl],
  );

  return (
    <main className="min-h-svh px-4 py-5 sm:px-6" style={{ background: "var(--ds-bg)" }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-normal text-(--brand)">
              WebSocket Test
            </p>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Transcript segments</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span
              className="inline-flex h-9 items-center rounded-(--ds-radius-control) border px-3 text-[12px] font-semibold"
              style={{
                borderColor: "var(--ds-border)",
                background: "var(--ds-surface)",
                color: token ? "var(--success)" : "var(--text-muted)",
              }}
            >
              {token ? "token configured" : "token not set"}
            </span>
          </div>
        </header>

        <section
          className="ds-surface rounded-(--ds-radius-panel) p-4"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <DsInput
              label="sessionId"
              value={sessionId}
              placeholder="session_..."
              onChange={(event) => setSessionId(event.currentTarget.value)}
              disabled={canDisconnect}
            />
            <DsInput
              label="callId"
              value={callId}
              placeholder="空なら全callId"
              onChange={(event) => setCallId(event.currentTarget.value)}
              disabled={canDisconnect}
            />
            <div className="flex flex-wrap gap-2">
              <DsButton onClick={connect} disabled={!canConnect}>
                <HiPlay className="h-4 w-4" />
                Connect
              </DsButton>
              <DsButton variant="secondary" onClick={disconnect} disabled={!canDisconnect}>
                <HiStop className="h-4 w-4" />
                Disconnect
              </DsButton>
              <DsButton variant="ghost" onClick={clearSegments}>
                <HiTrash className="h-4 w-4" />
                Clear
              </DsButton>
            </div>
          </div>
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            sessionId と callId を両方指定した場合は、両方のqueryを付与して絞り込みます。
          </p>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div
              className="min-w-0 rounded-(--ds-radius-control) border px-3 py-2"
              style={{ borderColor: "var(--ds-border)", background: "var(--input-bg)" }}
            >
              <p className="mb-1 text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                WebSocket URL
              </p>
              <code
                className="block min-w-0 break-all text-[12px]"
                style={{ color: "var(--text-main)" }}
              >
                {maskedUrl || "-"}
              </code>
            </div>
            <div
              className="grid grid-cols-3 overflow-hidden rounded-(--ds-radius-control) border"
              style={{ borderColor: "var(--ds-border)" }}
            >
              <Metric label="受信件数" value={String(segments.length)} />
              <Metric label="last type" value={lastEventType ?? "-"} compact />
              <Metric label="session" value={sessionStatus ?? "-"} compact />
            </div>
          </div>

          {(message || historyMessage) && (
            <div
              className="mt-3 flex flex-col gap-1 text-[12px]"
              style={{ color: "var(--text-sub)" }}
            >
              {message && <p>{message}</p>}
              {historyMessage && <p>{historyMessage}</p>}
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div
            className="ds-surface rounded-(--ds-radius-panel) p-4"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <SectionTitle icon={<HiBolt className="h-4 w-4" />} title="最新の文字起こし" />
            {latestSegment ? (
              <TranscriptSummary segment={latestSegment} />
            ) : (
              <EmptyState label="まだ文字起こしを受信していません。" />
            )}
          </div>

          <div
            className="ds-surface min-w-0 overflow-hidden rounded-(--ds-radius-panel)"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <div
              className="flex h-11 items-center justify-between border-b px-4"
              style={{ borderColor: "var(--ds-border)" }}
            >
              <SectionTitle
                icon={<HiSignal className="h-4 w-4" />}
                title="受信した文字起こし一覧"
              />
            </div>
            <div className="max-h-[60svh] overflow-auto">
              {segments.length === 0 ? (
                <EmptyState label="Connect後に受信したデータがここへ表示されます。" />
              ) : (
                <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-[12px]">
                  <thead
                    className="sticky top-0 z-10"
                    style={{ background: "var(--ds-surface-muted)" }}
                  >
                    <tr style={{ color: "var(--text-muted)" }}>
                      <TableHead>sequenceNo</TableHead>
                      <TableHead>recognizedAtUtc</TableHead>
                      <TableHead>sessionId</TableHead>
                      <TableHead>speakerName</TableHead>
                      <TableHead>speakerId</TableHead>
                      <TableHead>callId</TableHead>
                      <TableHead>text</TableHead>
                      <TableHead>duplicate</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((segment, index) => (
                      <TranscriptRow
                        key={`${transcriptSegmentKey(segment)}:${index}`}
                        segment={segment}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const style = statusStyle(status);
  const Icon = status === "connected" ? HiSignal : status === "disconnected" ? HiNoSymbol : HiBolt;

  return (
    <span
      className="inline-flex h-9 items-center gap-2 rounded-(--ds-radius-control) px-3 text-[12px] font-bold"
      style={style}
    >
      <Icon className="h-4 w-4" />
      {status}
    </span>
  );
}

function statusStyle(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return { background: "var(--badge-decision-bg)", color: "var(--badge-decision-fg)" };
    case "connecting":
    case "reconnecting":
      return { background: "var(--badge-action-bg)", color: "var(--badge-action-fg)" };
    case "error":
      return { background: "var(--ai-risk-bg)", color: "var(--ai-risk-fg)" };
    default:
      return { background: "var(--input-bg)", color: "var(--text-sub)" };
  }
}

function Metric({
  compact = false,
  label,
  value,
}: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2" style={{ borderRight: "1px solid var(--ds-border)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className={`mt-1 min-w-0 truncate font-bold ${compact ? "text-[12px]" : "text-xl"}`}
        style={{ color: "var(--text-main)" }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div
      className="flex items-center gap-2 text-[13px] font-bold"
      style={{ color: "var(--text-main)" }}
    >
      <span className="text-(--brand)">{icon}</span>
      <span>{title}</span>
    </div>
  );
}

function TranscriptSummary({ segment }: { segment: TranscriptSegment }) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-lg font-semibold leading-8" style={{ color: "var(--text-main)" }}>
        {segment.text || "(empty)"}
      </p>
      <div className="grid grid-cols-1 gap-2 text-[12px]">
        <SummaryField label="sequenceNo" value={String(segment.sequenceNo)} />
        <SummaryField label="recognizedAtUtc" value={segment.recognizedAtUtc || "-"} />
        <SummaryField label="sessionId" value={segment.sessionId || "-"} />
        <SummaryField label="speakerName" value={transcriptSpeakerName(segment)} />
        <SummaryField label="speakerId" value={segment.speakerId || "-"} />
        <SummaryField label="callId" value={segment.callId || "-"} />
        {segment.duplicate && <SummaryField label="duplicate" value="true" accent />}
      </div>
    </div>
  );
}

function SummaryField({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className="min-w-0 rounded-(--ds-radius-control) px-3 py-2"
      style={{ background: accent ? "var(--badge-action-bg)" : "var(--input-bg)" }}
    >
      <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-1 truncate text-[12px] font-medium"
        style={{ color: "var(--text-main)" }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="border-b px-4 py-3 font-semibold" style={{ borderColor: "var(--ds-border)" }}>
      {children}
    </th>
  );
}

function TranscriptRow({ segment }: { segment: TranscriptSegment }) {
  return (
    <tr className="align-top" style={{ color: "var(--text-main)" }}>
      <TableCell mono>{String(segment.sequenceNo)}</TableCell>
      <TableCell mono>{segment.recognizedAtUtc || "-"}</TableCell>
      <TableCell mono>{segment.sessionId || "-"}</TableCell>
      <TableCell>{transcriptSpeakerName(segment)}</TableCell>
      <TableCell mono>{compactSpeakerId(segment.speakerId) || "-"}</TableCell>
      <TableCell mono>{segment.callId || "-"}</TableCell>
      <TableCell>{segment.text || "(empty)"}</TableCell>
      <TableCell>
        {segment.duplicate ? (
          <span
            className="inline-flex rounded-full px-2 py-1 text-[11px] font-bold"
            style={{ background: "var(--badge-action-bg)", color: "var(--badge-action-fg)" }}
          >
            duplicate
          </span>
        ) : (
          "-"
        )}
      </TableCell>
    </tr>
  );
}

function TableCell({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <td
      className={`border-b px-4 py-3 leading-6 ${mono ? "font-mono text-[11px]" : ""}`}
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div className="max-w-[360px] break-words">{children}</div>
    </td>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-4 py-8 text-[13px]" style={{ color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}

function segmentMatchesFilters(segment: TranscriptSegment, filters: TranscriptSubscriptionFilters) {
  const callId = filters.callId?.trim();
  const sessionId = filters.sessionId?.trim();
  if (sessionId && segment.sessionId !== sessionId) {
    return false;
  }
  if (callId && segment.callId !== callId) {
    return false;
  }
  return true;
}

function transcriptSpeakerName(segment: TranscriptSegment) {
  const speakerName = segment.speakerName?.trim();
  if (speakerName) {
    return speakerName;
  }
  const speakerLabel = segment.speakerLabel?.trim();
  if (speakerLabel) {
    return speakerLabel;
  }
  const speakerId = segment.speakerId?.trim();
  if (speakerId) {
    return `話者 ${compactSpeakerId(speakerId)}`;
  }
  return "話者不明";
}

function compactSpeakerId(speakerId?: string | null) {
  const value = speakerId?.trim();
  if (!value) {
    return "";
  }
  if (value.length <= 32) {
    return value;
  }
  return `${value.slice(0, 18)}...${value.slice(-10)}`;
}

function sortSegments(segments: TranscriptSegment[]) {
  return [...segments].sort((a, b) => {
    const dateA = Date.parse(a.recognizedAtUtc);
    const dateB = Date.parse(b.recognizedAtUtc);
    if (!Number.isNaN(dateA) && !Number.isNaN(dateB) && dateA !== dateB) {
      return dateB - dateA;
    }
    return b.sequenceNo - a.sequenceNo;
  });
}
