import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { HiChevronRight, HiUserGroup } from "react-icons/hi2";

import { listWorkspaceFinalSummaryPreviews } from "~/api/aiAnalysis/aiAnalysisApi";
import { canManageMeetingSessions } from "~/api/auth/authApi";
import {
  deleteWorkspaceMeetingSession,
  listWorkspaceMeetingSessions,
  type MeetingSessionDto,
} from "~/api/meetingSessions/meetingSessionsApi";
import { DsButton } from "~/components/DsButton";
import {
  buildMeetingItems,
  dateValue,
  formatDuration,
  isActiveMeetingItem,
  type MeetingListItem,
} from "~/components/home/meetingListItems";
import { MeetingTitleLine } from "~/components/home/parts/MeetingTitleLine";
import { markIntentionalTreeTeardown } from "~/utils/clientDiagnostics/treeEmptiness";
import { ConfirmDialog } from "~/components/shared/modal/ConfirmDialog";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { isCompletedMeetingStatus, formatStatus } from "~/utils/meetingStatusLabels";

// 終了した会議の履歴一覧。ホームの「最近の会議」は直近5件のみ表示するため、
// 全件はこのページで確認する(「すべて」ボタンの遷移先)。

export default function MeetingHistoryPage() {
  const { workspace, workspaceId } = useAuthenticatedLayout();
  const canDelete = canManageMeetingSessions(workspace.role);
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [meetingSessions, setMeetingSessions] = useState<MeetingSessionDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<MeetingListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [summaryPreviews, setSummaryPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    listWorkspaceMeetingSessions(workspaceId)
      .then((sessions) => {
        if (!active) {
          return;
        }
        setMeetingSessions(sessions);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "会議一覧を取得できませんでした。");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    listWorkspaceFinalSummaryPreviews(workspaceId)
      .then((previews) => {
        if (!active) {
          return;
        }
        setSummaryPreviews(
          Object.fromEntries(previews.map((preview) => [preview.sessionId, preview.overview])),
        );
      })
      .catch(() => {
        // AI要約プレビューはあくまで補助表示。取得に失敗しても一覧表示自体は継続する。
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  // ホームと同じ判定ロジックで「終了した会議」を抽出し、終了日時の新しい順に並べる。
  const finishedMeetings = useMemo(() => {
    const items = buildMeetingItems(meetingSessions, workspaceId).filter(
      (meeting) => !isActiveMeetingItem(meeting),
    );
    return items.sort(
      (a, b) => dateValue(b.ended_at || b.updated_at) - dateValue(a.ended_at || a.updated_at),
    );
  }, [meetingSessions, workspaceId]);

  const chrome = useMemo(
    () => ({
      header: {
        title: "会議履歴",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "会議履歴" }],
      },
      fullBleedMain: true,
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  async function handleDelete(meeting: MeetingListItem) {
    setDeletingId(meeting.id);
    setDeleteError(null);
    try {
      // セッション削除に伴う議論ツリーの消失は正当なため、異常検出の対象外にする。
      markIntentionalTreeTeardown("session_deleted");
      await deleteWorkspaceMeetingSession(workspaceId, meeting.id);
      setMeetingSessions((current) =>
        current.filter((session) => session.sessionId !== meeting.id),
      );
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "会議履歴を削除できませんでした。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-4 rounded-(--ds-radius-panel) p-3 sm:p-4 md:overflow-y-auto"
      style={{ background: "var(--ds-bg)" }}
    >
      <div className="flex items-center gap-2.5 px-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--brand)" />
        <span className="text-[16px] font-bold" style={{ color: "var(--text-main)" }}>
          終了した会議
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[13px] font-semibold"
          style={{ background: "var(--ds-surface)", color: "var(--text-sub)" }}
        >
          全{finishedMeetings.length}件
        </span>
      </div>

      {deleteError && (
        <div
          className="rounded-(--ds-radius-panel) border px-5 py-3 text-[12px] sm:px-6"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {deleteError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {isLoading && <EmptyCard label="会議履歴を読み込んでいます..." />}
        {!isLoading && error && <EmptyCard label={error} />}
        {!isLoading && !error && finishedMeetings.length === 0 && (
          <EmptyCard label="終了した会議はまだありません。" />
        )}
        {!isLoading &&
          !error &&
          finishedMeetings.map((meeting) => (
            <MeetingHistoryCard
              key={meeting.id}
              meeting={meeting}
              summary={summaryPreviews[meeting.id]}
              canDelete={canDelete}
              isDeleting={deletingId === meeting.id}
              onRequestDelete={() => setConfirmTarget(meeting)}
            />
          ))}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title="この会議の履歴を削除しますか？"
          confirmLabel="削除する"
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => {
            const target = confirmTarget;
            setConfirmTarget(null);
            return handleDelete(target);
          }}
          description={
            <p>
              「{confirmTarget.title}
              」の文字起こしとAI分析を含む記録を完全に削除します。この操作は取り消せません。
            </p>
          }
        />
      )}
    </div>
  );
}

function MeetingHistoryCard({
  meeting,
  summary,
  canDelete,
  isDeleting,
  onRequestDelete,
}: {
  meeting: MeetingListItem;
  summary?: string;
  canDelete: boolean;
  isDeleting: boolean;
  onRequestDelete: () => void;
}) {
  const duration = formatDuration(meeting.joined_at, meeting.ended_at);
  return (
    <div
      className="ds-surface flex items-center gap-4 rounded-(--ds-radius-panel) border px-5 py-5 sm:px-6 sm:py-6"
      style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
    >
      <Link
        to={meeting.recentTo}
        className="flex min-w-0 flex-1 items-center gap-4 transition hover:opacity-80"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--ds-radius-control)"
          style={{ background: "var(--input-bg)" }}
        >
          <HiUserGroup className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.4fr)_8rem_4.5rem_minmax(0,1.4fr)]">
          <MeetingTitleLine teamsTitle={meeting.teamsTitle} title={meeting.title} />
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {formatFullDate(meeting.ended_at || meeting.updated_at)}
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {duration ?? "―"}
          </p>
          <p
            className="text-[11px]"
            style={{
              color: "var(--text-muted)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {summary ?? "AI要約はまだありません"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--input-bg)", color: statusColor(meeting.status) }}
          >
            {formatStatus(meeting.status)}
          </span>
          <HiChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </div>
      </Link>
      {canDelete && (
        <DsButton
          type="button"
          variant="secondary"
          disabled={isDeleting}
          onClick={onRequestDelete}
          className="shrink-0"
        >
          {isDeleting ? "削除中..." : "削除"}
        </DsButton>
      )}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) border px-5 py-6 text-[12px] sm:px-6"
      style={{
        borderColor: "var(--ds-border)",
        boxShadow: "var(--ds-shadow)",
        color: "var(--text-muted)",
      }}
    >
      {label}
    </div>
  );
}

// 履歴は過去の日付を扱うため、年まで含めて表示する。
function formatFullDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status: string) {
  if (isCompletedMeetingStatus(status)) {
    return "var(--success)";
  }
  if (status === "failed") {
    return "var(--danger)";
  }
  if (status === "stale" || status === "timeout") {
    return "var(--warning)";
  }
  return "var(--text-muted)";
}
