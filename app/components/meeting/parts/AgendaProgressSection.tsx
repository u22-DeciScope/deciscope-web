import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  updateAgendaProgressOverride,
  type AgendaProgressOverrideInput,
} from "~/api/aiAnalysis/agendaProgressApi";
import type {
  AgendaProgressEntryPayload,
  AgendaProgressPayload,
  AgendaProgressStatus,
} from "~/api/aiAnalysis/aiAnalysisApi";
import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import { analysisKindLabel } from "~/components/meeting/parts/analysisKindPalette";
import type {
  LiveAnalysisMeta,
  TranscriptSessionConnectionStatus,
} from "~/hooks/useMeetingTranscriptSession";

type AgendaProgressSectionProps = {
  progress: AgendaProgressPayload | null | undefined;
  meta: LiveAnalysisMeta | null | undefined;
  connectionStatus: TranscriptSessionConnectionStatus | null | undefined;
  canManage: boolean;
  workspaceId: string;
  sessionId: string;
  treeNodes: TreeNodePayload[];
  onFocusTreeItem?: (nodeOrItemId: string) => void;
  onProgressPatched?: (progress: AgendaProgressPayload) => void;
};

const focusNoticeDurationMs = 1500;
const overrideErrorDurationMs = 4000;

// AIによる「現在地の可視化」。警告・推奨・severity表示は行わない
// (アジェンダ進捗契約 §0 絶対制約)。
export function AgendaProgressSection({
  progress,
  meta,
  connectionStatus,
  canManage,
  workspaceId,
  sessionId,
  treeNodes,
  onFocusTreeItem,
  onProgressPatched,
}: AgendaProgressSectionProps) {
  // 手動操作直後のoptimistic反映。成功時はサーバー応答をonProgressPatched経由で
  // 親(MeetingAssistantPanel)へ確定させ、この行のoverlayは破棄する
  // (次回描画では progress prop 側に確定値が乗っている)。
  const [localPatch, setLocalPatch] = useState<AgendaProgressPayload | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeEntryId, setNoticeEntryId] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // セッションが変わったら、前のセッションのoverlay/通知を持ち越さない。
    setLocalPatch(null);
    setPending(false);
    setErrorMessage(null);
    setNoticeEntryId(null);
  }, [sessionId]);

  useEffect(
    () => () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    [],
  );

  const displayProgress = localPatch ?? progress ?? null;
  const treeNodeIds = useMemo(() => new Set(treeNodes.map((node) => node.id)), [treeNodes]);
  const fixedEntries = useMemo(
    () =>
      [...(displayProgress?.entries ?? [])]
        .filter((entry) => entry.sourceType === "fixed_agenda")
        .sort(
          (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
        ),
    [displayProgress],
  );
  const dynamicEntries = useMemo(
    () => (displayProgress?.entries ?? []).filter((entry) => entry.sourceType === "dynamic_topic"),
    [displayProgress],
  );
  const canOperate = canManage && Boolean(workspaceId) && Boolean(sessionId);

  const handleEntryClick = useCallback(
    (entry: AgendaProgressEntryPayload) => {
      if (entry.primaryNodeId && treeNodeIds.has(entry.primaryNodeId)) {
        onFocusTreeItem?.(entry.primaryNodeId);
        return;
      }
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      setNoticeEntryId(entry.id);
      noticeTimerRef.current = window.setTimeout(() => {
        setNoticeEntryId((current) => (current === entry.id ? null : current));
      }, focusNoticeDurationMs);
    },
    [onFocusTreeItem, treeNodeIds],
  );

  const handleOverride = useCallback(
    (input: AgendaProgressOverrideInput) => {
      if (!workspaceId || !sessionId) {
        return;
      }
      setLocalPatch(applyOptimisticAgendaProgress(displayProgress, input));
      setPending(true);
      setErrorMessage(null);
      void updateAgendaProgressOverride(workspaceId, sessionId, input)
        .then((result) => {
          setLocalPatch(null);
          if (result) {
            onProgressPatched?.(result);
          }
        })
        .catch(() => {
          setLocalPatch(null);
          setErrorMessage("更新できませんでした。時間をおいて再度お試しください。");
          if (errorTimerRef.current !== null) {
            window.clearTimeout(errorTimerRef.current);
          }
          errorTimerRef.current = window.setTimeout(() => {
            setErrorMessage(null);
          }, overrideErrorDurationMs);
        })
        .finally(() => {
          setPending(false);
        });
    },
    [displayProgress, onProgressPatched, sessionId, workspaceId],
  );

  const hasFixedSection = fixedEntries.length > 0;
  const hasDynamicSection = dynamicEntries.length > 0;

  return (
    <section aria-label="アジェンダ進捗" className="space-y-2">
      <AgendaStatusLine meta={meta} connectionStatus={connectionStatus} />
      {hasFixedSection && (
        <div
          className="rounded-(--ds-radius-control) border p-3"
          style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
        >
          <h2 className="mb-2 text-[11px] font-bold" style={{ color: "var(--text-main)" }}>
            話し合う項目
          </h2>
          <ul className="space-y-1.5">
            {fixedEntries.map((entry) => (
              <AgendaEntryRow
                key={entry.id}
                entry={entry}
                isCurrent={Boolean(displayProgress?.effectiveCurrentTopicId === entry.id)}
                hasManualCurrent={displayProgress?.manualCurrentTopicId === entry.id}
                canManage={canOperate}
                pending={pending}
                noticeVisible={noticeEntryId === entry.id}
                onEntryClick={handleEntryClick}
                onOverride={handleOverride}
              />
            ))}
          </ul>
        </div>
      )}
      {hasDynamicSection && (
        <div
          className="rounded-(--ds-radius-control) border p-3"
          style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
        >
          <h2 className="mb-2 text-[11px] font-bold" style={{ color: "var(--text-main)" }}>
            会議中に追加された論点
          </h2>
          <ul className="space-y-1.5">
            {dynamicEntries.map((entry) => (
              <AgendaEntryRow
                key={entry.id}
                entry={entry}
                dynamic
                isCurrent={Boolean(displayProgress?.effectiveCurrentTopicId === entry.id)}
                hasManualCurrent={displayProgress?.manualCurrentTopicId === entry.id}
                canManage={canOperate}
                pending={pending}
                noticeVisible={noticeEntryId === entry.id}
                onEntryClick={handleEntryClick}
                onOverride={handleOverride}
              />
            ))}
          </ul>
        </div>
      )}
      {errorMessage && (
        <p className="text-[10px]" style={{ color: "var(--text-sub)" }}>
          {errorMessage}
        </p>
      )}
    </section>
  );
}

// override入力から見た目上の即時反映結果を組み立てる(サーバーのstamp計算の簡易近似)。
// 成功後はサーバー応答で確定させるため、ここでの近似がわずかにずれても実害は無い。
function applyOptimisticAgendaProgress(
  current: AgendaProgressPayload | null,
  input: AgendaProgressOverrideInput,
): AgendaProgressPayload | null {
  if (!current) {
    return current;
  }
  if ("entryId" in input) {
    const manualStatus = input.manualStatus ?? undefined;
    return {
      ...current,
      entries: current.entries.map((entry) => {
        if (entry.id !== input.entryId) {
          return entry;
        }
        return {
          ...entry,
          manualStatus,
          effectiveStatus: manualStatus ?? entry.computedStatus,
        };
      }),
    };
  }
  const manualCurrentTopicId = input.manualCurrentTopicId ?? undefined;
  return {
    ...current,
    manualCurrentTopicId,
    effectiveCurrentTopicId: manualCurrentTopicId ?? current.computedCurrentTopicId,
  };
}

function AgendaEntryRow({
  entry,
  dynamic = false,
  isCurrent,
  hasManualCurrent,
  canManage,
  pending,
  noticeVisible,
  onEntryClick,
  onOverride,
}: {
  entry: AgendaProgressEntryPayload;
  dynamic?: boolean;
  isCurrent: boolean;
  hasManualCurrent: boolean;
  canManage: boolean;
  pending: boolean;
  noticeVisible: boolean;
  onEntryClick: (entry: AgendaProgressEntryPayload) => void;
  onOverride: (input: AgendaProgressOverrideInput) => void;
}) {
  const icon = dynamic
    ? { symbol: "＋", color: "var(--text-sub)" }
    : statusIconStyle(entry.effectiveStatus);
  const countsLabel = relatedItemCountsLabel(entry.relatedItemCounts);
  const statusLabel = agendaStatusLabel(entry);

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-agenda-entry-id={entry.id}
        onClick={() => onEntryClick(entry)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onEntryClick(entry);
          }
        }}
        className="cursor-pointer rounded-(--ds-radius-control) border px-2.5 py-2"
        style={{
          background: isCurrent
            ? "color-mix(in srgb, var(--brand) 8%, var(--ds-surface))"
            : "var(--ds-surface)",
          borderColor: isCurrent ? "var(--brand)" : "var(--ds-border)",
          borderLeftWidth: isCurrent ? "3px" : "1px",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[11px] leading-4"
              style={{ color: icon.color }}
            >
              {icon.symbol}
            </span>
            <div className="min-w-0">
              {isCurrent && (
                <p className="text-[10px] font-bold leading-4" style={{ color: "var(--brand)" }}>
                  ▶ 現在の議題
                </p>
              )}
              <p
                className="line-clamp-2 text-[12px] font-semibold leading-4.5"
                title={entry.title}
                style={{ color: "var(--text-main)" }}
              >
                {entry.title}
              </p>
            </div>
          </div>
          {canManage && (
            <AgendaEntryMenu
              entry={entry}
              isCurrent={isCurrent}
              hasManualCurrent={hasManualCurrent}
              pending={pending}
              onAction={onOverride}
            />
          )}
        </div>
        {entry.discussionWeight !== undefined && (
          <div
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
            style={{ background: "var(--ds-border)" }}
          >
            <div
              data-testid={`agenda-weight-bar-${entry.id}`}
              className="h-full rounded-full"
              style={{
                width: `${Math.max(entry.discussionWeight * 100, 8)}%`,
                background: "var(--brand)",
              }}
            />
          </div>
        )}
        <div
          className="mt-1 flex items-center gap-1.5 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="truncate">
            {statusLabel}
            {countsLabel ? `・${countsLabel}` : ""}
          </span>
          {entry.manualStatus && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
              style={{ background: "var(--ds-surface-muted)", color: "var(--text-sub)" }}
            >
              手動
            </span>
          )}
        </div>
        {noticeVisible && (
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            関連する議論はまだありません
          </p>
        )}
      </div>
    </li>
  );
}

function statusIconStyle(status: AgendaProgressStatus): { symbol: string; color: string } {
  if (status === "discussed") {
    return { symbol: "✓", color: "var(--brand)" };
  }
  if (status === "discussing") {
    return { symbol: "◐", color: "var(--brand)" };
  }
  return { symbol: "□", color: "var(--text-muted)" };
}

function agendaStatusLabel(entry: AgendaProgressEntryPayload): string {
  if (entry.effectiveStatus === "not_started") {
    return "未着手";
  }
  if (entry.effectiveStatus === "discussing") {
    return "議論中";
  }
  if (entry.outcomeStatus === "concluded") {
    return "話し合い済み・結論あり";
  }
  if (entry.outcomeStatus === "unresolved") {
    return "話し合い済み・未解決";
  }
  return "話し合い済み";
}

function relatedItemCountsLabel(counts: Record<string, number> | undefined): string {
  if (!counts) {
    return "";
  }
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${analysisKindLabel(kind)} ${count}`)
    .join("・");
}

const statusMenuOptions: Array<{ status: AgendaProgressStatus; label: string }> = [
  { status: "not_started", label: "未着手に戻す" },
  { status: "discussing", label: "議論中にする" },
  { status: "discussed", label: "話し合い済みにする" },
];

function AgendaEntryMenu({
  entry,
  isCurrent,
  hasManualCurrent,
  pending,
  onAction,
}: {
  entry: AgendaProgressEntryPayload;
  isCurrent: boolean;
  hasManualCurrent: boolean;
  pending: boolean;
  onAction: (input: AgendaProgressOverrideInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const items: Array<{ key: string; label: string; onClick: () => void }> = [];
  if (!isCurrent) {
    items.push({
      key: "set-current",
      label: "現在の議題にする",
      onClick: () => onAction({ manualCurrentTopicId: entry.id }),
    });
  }
  const availableStatusOptions =
    entry.sourceType === "fixed_agenda"
      ? statusMenuOptions
      : statusMenuOptions.filter((option) => option.status !== "not_started");
  for (const option of availableStatusOptions) {
    if (option.status === entry.effectiveStatus) {
      continue;
    }
    items.push({
      key: `status-${option.status}`,
      label: option.label,
      onClick: () => onAction({ entryId: entry.id, manualStatus: option.status }),
    });
  }
  if (entry.manualStatus) {
    items.push({
      key: "clear-status",
      label: "自動判定に戻す",
      onClick: () => onAction({ entryId: entry.id, manualStatus: null }),
    });
  }
  if (hasManualCurrent) {
    items.push({
      key: "clear-current",
      // 状態overrideの「自動判定に戻す」と同時に並び得るため、対象が現在項目の
      // 手動指定であることが分かる文言にする。
      label: entry.manualStatus ? "現在の議題の指定を解除" : "自動判定に戻す",
      onClick: () => onAction({ manualCurrentTopicId: null }),
    });
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="この議題の操作"
        disabled={pending}
        className="flex h-5 w-5 items-center justify-center rounded-md text-[12px]"
        style={{ color: "var(--text-muted)" }}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-(--ds-radius-control) border py-1 text-[11px] shadow-sm"
          style={{ background: "var(--ds-surface-raised)", borderColor: "var(--ds-border)" }}
          onClick={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left"
              style={{ color: "var(--text-main)" }}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const reconnectingConnectionStatuses = new Set<TranscriptSessionConnectionStatus>([
  "connecting",
  "reconnecting",
  "error",
]);

const idleAgendaProgressMeta: LiveAnalysisMeta = {
  intervalSeconds: 10,
  lastEventAtMs: null,
  lastCompletedAtMs: null,
  generating: false,
  failed: false,
  hasNewSpeech: false,
};

function AgendaStatusLine({
  meta,
  connectionStatus,
}: {
  meta: LiveAnalysisMeta | null | undefined;
  connectionStatus: TranscriptSessionConnectionStatus | null | undefined;
}) {
  const effectiveMeta = meta ?? idleAgendaProgressMeta;
  const needsTicker = agendaStatusNeedsTicker(effectiveMeta, connectionStatus);
  // 1秒tickerはこの行内へ閉じる(AiUpdateStatusChipと同様、親を毎秒再レンダしない)。
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!needsTicker) {
      return;
    }
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [needsTicker]);

  return (
    <p className="text-[10px] leading-4" style={{ color: "var(--text-muted)" }}>
      {agendaStatusLineText(effectiveMeta, connectionStatus, nowMs)}
    </p>
  );
}

function agendaStatusNeedsTicker(
  meta: LiveAnalysisMeta,
  connectionStatus: TranscriptSessionConnectionStatus | null | undefined,
) {
  if (connectionStatus && reconnectingConnectionStatuses.has(connectionStatus)) {
    return false;
  }
  if (meta.generating || meta.failed) {
    return false;
  }
  return meta.lastCompletedAtMs !== null || meta.lastEventAtMs !== null;
}

function agendaStatusLineText(
  meta: LiveAnalysisMeta,
  connectionStatus: TranscriptSessionConnectionStatus | null | undefined,
  nowMs: number,
): string {
  if (connectionStatus && reconnectingConnectionStatuses.has(connectionStatus)) {
    return "接続を再試行しています";
  }
  if (meta.generating) {
    return "分析中…";
  }
  if (meta.failed) {
    return "更新失敗・再試行待ち";
  }
  // 停止検知: 新しい発話が蓄積されたままinterval*6秒以上分析が動いていない場合のみ
  // 知らせる(発話が無いだけの待機は正常なので表示しない)。一度でも分析が完了して
  // いると lastCompletedAtMs は以後ずっと非nullのままになるため、この判定は
  // 「最終更新」表示より先に評価しないと実質的に到達不能になる。
  const stalled =
    meta.lastEventAtMs !== null &&
    meta.hasNewSpeech &&
    nowMs - meta.lastEventAtMs >= meta.intervalSeconds * 6 * 1000;
  if (stalled) {
    return "更新が停止しています";
  }
  if (meta.lastCompletedAtMs !== null) {
    const elapsedMs = nowMs - meta.lastCompletedAtMs;
    if (elapsedMs < 30_000) {
      return "たった今更新";
    }
    if (elapsedMs < 60_000) {
      return `最終更新：${Math.max(1, Math.floor(elapsedMs / 1000))}秒前`;
    }
    return `最終更新：${formatAgendaStatusClockTime(meta.lastCompletedAtMs)}`;
  }
  return meta.hasNewSpeech ? "新しい発話を蓄積中…" : "次の分析を待っています";
}

function formatAgendaStatusClockTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
