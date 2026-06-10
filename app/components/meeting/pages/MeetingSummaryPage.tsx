import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { HiArrowDownTray, HiShare } from "react-icons/hi2";

import { getMeetingReport, getMeetingReportMarkdown } from "~/api/meetings/meetingReportsApi";
import { createMeetingJoinToken, getMeeting, type MeetingDto } from "~/api/meetings/meetingsApi";
import type { MeetingReportDto } from "~/api/meetings/meetingReportsApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";
import { MeetingSummaryMain } from "~/components/meeting/summary/MeetingSummaryMain";
import { MeetingSummarySidebar } from "~/components/meeting/summary/MeetingSummarySidebar";
import type { MeetingSummaryViewModel } from "~/components/meeting/summary/meetingSummaryTypes";

export default function MeetingSummary() {
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [meeting, setMeeting] = useState<MeetingDto | null>(null);
  const [report, setReport] = useState<MeetingReportDto | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let active = true;
    Promise.all([getMeeting(id), getMeetingReport(id), getMeetingReportMarkdown(id)])
      .then(([meetingResult, reportResult, markdownResult]) => {
        if (!active) {
          return;
        }
        setMeeting(meetingResult);
        setReport(reportResult);
        setMarkdown(markdownResult);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "レポートを取得できませんでした。");
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  const summary = useMemo(
    () => summaryFromReport(meeting, report),
    [meeting, report],
  );

  async function shareReport() {
    if (!id) {
      return;
    }
    const token = await createMeetingJoinToken(id);
    setShareToken(token.token);
  }

  async function exportMarkdown() {
    const content = markdown || report?.content || "";
    if (!content) {
      return;
    }
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${meeting?.title ?? "meeting-report"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const chrome = useMemo(
    () => ({
      header: {
        title: meeting?.title ?? "会議サマリー",
        breadcrumbs: [
          { label: "ホーム", to: meetingsPath },
          { label: meeting?.title ?? "会議サマリー" },
        ],
        actions: (
          <>
            <DsButton variant="secondary" onClick={shareReport}>
              <HiShare className="h-3.5 w-3.5" />
              共有
            </DsButton>
            <DsButton variant="secondary" onClick={exportMarkdown}>
              <HiArrowDownTray className="h-3.5 w-3.5" />
              エクスポート
            </DsButton>
          </>
        ),
      },
      rightSidebar: <MeetingSummarySidebar summary={summary} />,
      rightSidebarClassName: "w-55",
    }),
    [meeting?.title, meetingsPath, summary],
  );
  useWorkspaceChrome(chrome);

  if (error) {
    return <StatusPanel message={error} />;
  }

  if (!report) {
    return <StatusPanel message="レポートを読み込んでいます..." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {shareToken && (
        <div
          className="rounded-(--ds-radius-control) border px-3 py-2 text-[11px]"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
        >
          共有トークン: <span className="font-mono">{shareToken}</span>
        </div>
      )}
      <MeetingSummaryMain meetingsPath={meetingsPath} summary={summary} />
      <section
        className="ds-surface min-h-60 overflow-auto rounded-(--ds-radius-panel) p-4"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
          Markdown レポート
        </h2>
        <pre
          className="whitespace-pre-wrap text-[12px] leading-5"
          style={{ color: "var(--text-sub)" }}
        >
          {markdown || report.content}
        </pre>
      </section>
    </div>
  );
}

function StatusPanel({ message }: { message: string }) {
  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) p-5 text-[13px]"
      style={{ boxShadow: "var(--ds-shadow)", color: "var(--text-sub)" }}
    >
      {message}
    </div>
  );
}

function summaryFromReport(
  meeting: MeetingDto | null,
  report: MeetingReportDto | null,
): MeetingSummaryViewModel {
  return {
    title: meeting?.title ?? "会議サマリー",
    statusLabel: formatStatus(meeting?.status ?? "loading"),
    dateRange: formatRange(meeting),
    duration: "MVP0 再生",
    aiSummary: firstParagraph(report?.content) || "バックエンドイベントからレポートを生成しています。",
    decisions: [],
    actions: [],
    participants: [],
  };
}

function firstParagraph(content = "") {
  return content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#") && !part.startsWith("-"))
    ?.replace(/\n/g, " ");
}

function formatRange(meeting: MeetingDto | null) {
  if (!meeting) {
    return "";
  }
  const start = formatDate(meeting.created_at);
  const end = formatDate(meeting.ended_at || meeting.updated_at);
  return `${start} - ${end}`;
}

function formatDate(value: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(status: string) {
  switch (status) {
    case "loading":
      return "読み込み中";
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
