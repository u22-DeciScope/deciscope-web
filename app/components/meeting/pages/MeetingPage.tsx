import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { HiArrowPath, HiPause, HiPlay, HiStop } from "react-icons/hi2";

import type { TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";
import { DsButton } from "~/components/DsButton";
import { DiscussionTree, type DiscussionTreeNode } from "~/components/meeting/parts/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useMeetingRuntime } from "~/hooks/useMeetingRuntime";
import { workspaceMeetingSummaryPath } from "~/routing/workspacePaths";

export default function Meeting() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();
  const runtime = useMeetingRuntime(id);
  const [selectedFixture, setSelectedFixture] = useState("");
  const summaryPath = workspaceMeetingSummaryPath(workspaceId, id ?? "");
  const fixtureName = selectedFixture || runtime.fixtures[0]?.name || "";

  const discussionNodes = useMemo(
    () => treeNodesFromRuntime(runtime.tree?.nodes ?? []),
    [runtime.tree?.nodes],
  );
  const partials = useMemo(() => Object.values(runtime.partials), [runtime.partials]);
  const meetingTitle = runtime.meeting?.title ?? "会議";
  const statusLabel = runtime.meetingState.status ?? runtime.meeting?.status ?? runtime.connectionStatus;
  const displayStatus = formatStatus(statusLabel);

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
        meta: (
          <span className="font-mono text-[12px] font-bold" style={{ color: "var(--text-main)" }}>
            seq {runtime.lastSeq}
          </span>
        ),
        status: (
          <span
            className="flex items-center gap-2 text-[13px] font-bold"
            style={{ color: statusLabel === "ended" ? "var(--text-muted)" : "var(--status-live)" }}
          >
            <span className="h-3 w-3 rounded-full bg-(--status-live)" />
            {displayStatus}
          </span>
        ),
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
      rightSidebar: (
        <MeetingAssistantPanel
          insights={runtime.analysisItems}
          speakerSummaries={runtime.speakerSummaries}
        />
      ),
    }),
    [finishMeeting, fixtureName, meetingTitle, runtime, statusLabel],
  );
  useWorkspaceChrome(chrome);

  return (
    <section className="flex h-full min-w-0 flex-col gap-2">
      {(runtime.error || runtime.replayStatus) && (
        <div
          className="rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
        >
          {runtime.error ? runtime.error : `再生状態: ${formatReplayStatus(runtime.replayStatus?.status)}`}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2 xl:flex-row">
        <MeetingChatPanel partials={partials} segments={runtime.segments} />
        <DiscussionTree nodes={discussionNodes} />
      </div>
    </section>
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

function treeNodesFromRuntime(nodes: TreeNodePayload[]): DiscussionTreeNode[] {
  return nodes.map((node, index) => ({
    id: index + 1,
    tag: node.kind ?? "topic",
    user: node.speaker_label ?? "",
    time: "",
    text: node.label ?? node.id,
    indent: node.kind === "topic" ? 0 : 1,
    active: index === nodes.length - 1,
  }));
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
