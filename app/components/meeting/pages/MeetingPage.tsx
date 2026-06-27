import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  HiArrowPath,
  HiChatBubbleLeftRight,
  HiPause,
  HiPlay,
  HiSparkles,
  HiStop,
  HiUserGroup,
} from "react-icons/hi2";

import { DsButton } from "~/components/DsButton";
import { DiscussionTree } from "~/components/meeting/parts/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useMeetingTranscriptSession } from "~/hooks/useMeetingTranscriptSession";
import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import { workspaceMeetingSummaryPath } from "~/routing/workspacePaths";

export default function Meeting() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { workspaceId } = useAuthenticatedLayout();
  const sessionId = searchParams.get("sessionId")?.trim() ?? "";
  const runtime = useMeetingRuntime(id);
  const transcriptSession = useMeetingTranscriptSession(id, sessionId);
  const [selectedFixture, setSelectedFixture] = useState("");
  const summaryPath = workspaceMeetingSummaryPath(workspaceId, id ?? "");
  const fixtureName = selectedFixture || runtime.fixtures[0]?.name || "";

  const partials = useMemo(() => Object.values(runtime.partials), [runtime.partials]);
  const segments = useMemo(
    () => mergeDisplaySegments(runtime.segments, transcriptSession.segments),
    [runtime.segments, transcriptSession.segments],
  );
  const meetingTitle = runtime.meeting?.title ?? "会議";
  const statusLabel =
    transcriptSession.sessionStatus ??
    runtime.meetingState.status ??
    runtime.meeting?.status ??
    runtime.connectionStatus;
  const displayStatus = formatStatus(statusLabel);
  const elapsedLabel = formatDuration(
    Math.max(
      0,
      ...segments.map((segment) => segment.end_ms),
      ...partials.map((partial) => partial.start_ms ?? 0),
    ),
  );
  const participantCount = runtime.meetingState.participants?.length ?? 0;
  const topicCount = runtime.tree?.nodes?.length ?? 0;
  const visibleInsightCount = runtime.analysisItems.filter(
    (insight) => insight.status !== "dismissed",
  ).length;
  const transcriptNotice = transcriptSession.error
    ? transcriptSession.error
    : sessionId &&
        transcriptSession.connectionStatus !== "idle" &&
        transcriptSession.connectionStatus !== "connected"
      ? `文字起こしWebSocket: ${formatTranscriptConnectionStatus(
          transcriptSession.connectionStatus,
        )}`
      : null;
  const pageNotice = runtime.error ?? transcriptNotice;

  const finishMeeting = useCallback(async () => {
    const report = await runtime.finishMeeting();
    if (report) {
      navigate(summaryPath);
    }
  }, [navigate, runtime, summaryPath]);

  const chrome = useMemo(
    () => ({
      header: {
        title: meetingTitle,
        subtitle: sessionId
          ? `経過 ${elapsedLabel} / ${shortSessionId(sessionId)}`
          : `経過 ${elapsedLabel} / seq ${runtime.lastSeq}`,
        status: <LiveStatusBadge status={statusLabel} label={displayStatus} />,
        actions: (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <select
              className="h-8 rounded-(--ds-radius-control) px-2 text-[11px] outline-none"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--text-main)",
              }}
              value={fixtureName}
              onChange={(event) => setSelectedFixture(event.currentTarget.value)}
            >
              {runtime.fixtures.length === 0 ? (
                <option value="">テストデータなし</option>
              ) : (
                runtime.fixtures.map((fixture) => (
                  <option key={fixture.name} value={fixture.name}>
                    {fixture.name}
                  </option>
                ))
              )}
            </select>
            <IconButton
              label="開始"
              disabled={!fixtureName}
              onClick={() => runtime.startReplay(fixtureName)}
            >
              <HiPlay className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="一時停止" onClick={runtime.pauseReplay}>
              <HiPause className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="再開" onClick={runtime.resumeReplay}>
              <HiArrowPath className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="リセット" onClick={runtime.resetReplay}>
              <HiStop className="h-3.5 w-3.5" />
            </IconButton>
            <DsButton
              disabled={runtime.isEnding || statusLabel === "ended"}
              variant="secondary"
              onClick={finishMeeting}
            >
              終了
            </DsButton>
          </div>
        ),
      },
    }),
    [finishMeeting, fixtureName, meetingTitle, runtime, sessionId, statusLabel],
  );
  useWorkspaceChrome(chrome);

  return (
    <section className="flex h-full min-w-0 flex-col gap-2 overflow-hidden">
      <div className="grid shrink-0 gap-2 md:grid-cols-4">
        <RuntimeMetric
          icon={<HiChatBubbleLeftRight className="h-4 w-4" />}
          label="発言"
          value={`${segments.length} 件`}
        />
        <RuntimeMetric
          icon={<HiUserGroup className="h-4 w-4" />}
          label="参加者"
          value={participantCount > 0 ? `${participantCount} 人` : "未取得"}
        />
        <RuntimeMetric
          icon={<HiSparkles className="h-4 w-4" />}
          label="AIメモ"
          value={`${visibleInsightCount} 件`}
        />
        <RuntimeMetric label="議論ノード" value={`${topicCount} 件`} />
      </div>

      {(pageNotice || runtime.replayStatus) && (
        <div
          className="rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
        >
          {pageNotice
            ? pageNotice
            : `再生状態: ${formatReplayStatus(runtime.replayStatus?.status)}`}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(250px,0.85fr)_minmax(420px,1.65fr)_minmax(280px,0.95fr)]">
        <MeetingChatPanel partials={partials} segments={segments} />
        <DiscussionTree nodes={runtime.tree?.nodes ?? []} edges={runtime.tree?.edges ?? []} />
        <MeetingAssistantPanel
          insights={runtime.analysisItems}
          speakerSummaries={runtime.speakerSummaries}
        />
      </div>
    </section>
  );
}

function mergeDisplaySegments(
  runtimeSegments: MeetingSegmentDto[],
  transcriptSegments: MeetingSegmentDto[],
) {
  const byId = new Map<string, MeetingSegmentDto>();
  for (const segment of runtimeSegments) {
    byId.set(segment.segment_id, segment);
  }
  for (const segment of transcriptSegments) {
    byId.set(segment.segment_id, segment);
  }
  return [...byId.values()].sort((a, b) => {
    const timeA = Date.parse(a.created_at);
    const timeB = Date.parse(b.created_at);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
      return timeA - timeB;
    }
    return a.seq - b.seq;
  });
}

function RuntimeMetric({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-(--ds-radius-control) border px-3 py-2"
      style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
    >
      {icon ? <span className="shrink-0 text-(--brand)">{icon}</span> : null}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <p className="truncate text-[13px] font-bold" style={{ color: "var(--text-main)" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function LiveStatusBadge({ label, status }: { label: string; status: string }) {
  const ended = status === "ended" || status === "closed";
  const live = status === "started" || status === "connected";

  return (
    <span
      className="inline-flex h-8 items-center gap-2 rounded-(--ds-radius-control) border px-3 text-[12px] font-bold"
      style={{
        background: live ? "var(--ai-risk-bg)" : "var(--input-bg)",
        borderColor: live ? "var(--ai-risk-border)" : "var(--input-border)",
        color: ended ? "var(--text-muted)" : live ? "var(--ai-risk-fg)" : "var(--text-sub)",
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: ended ? "var(--text-muted)" : live ? "var(--status-live)" : "var(--warning)",
        }}
      />
      {label}
    </span>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-(--ds-radius-control) border text-[11px] disabled:opacity-50"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--ds-border)",
        color: "var(--text-sub)",
      }}
      onClick={() => {
        void onClick();
      }}
    >
      {children}
    </button>
  );
}

function formatStatus(status: string) {
  switch (status) {
    case "idle":
      return "待機中";
    case "loading":
      return "読み込み中";
    case "connecting":
      return "接続中";
    case "connected":
      return "接続済み";
    case "reconnecting":
      return "再接続中";
    case "closed":
      return "切断";
    case "error":
      return "エラー";
    case "created":
      return "作成済み";
    case "started":
      return "進行中";
    case "ended":
      return "終了";
    case "pending_join":
      return "参加待機";
    case "command_sent":
      return "Bot参加命令済み";
    case "joining":
      return "Bot参加中";
    case "joined":
      return "Bot参加済み";
    case "recording":
      return "録音中";
    case "failed":
      return "失敗";
    default:
      return status;
  }
}

function formatTranscriptConnectionStatus(status: string) {
  switch (status) {
    case "loading":
      return "履歴取得中";
    case "connecting":
      return "接続中";
    case "reconnecting":
      return "再接続中";
    case "closed":
      return "切断";
    case "error":
      return "エラー";
    default:
      return status;
  }
}

function formatReplayStatus(status?: string) {
  switch (status) {
    case "running":
      return "再生中";
    case "paused":
      return "一時停止中";
    case "completed":
      return "完了";
    default:
      return status ?? "不明";
  }
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function shortSessionId(sessionId: string) {
  return sessionId.length > 18 ? `${sessionId.slice(0, 18)}...` : sessionId;
}
