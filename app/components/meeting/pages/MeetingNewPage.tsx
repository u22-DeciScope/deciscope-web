import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { HiVideoCamera } from "react-icons/hi2";

import { createMeetingSession, getMeetingSession } from "~/api/meetingSessions/meetingSessionsApi";
import type { MeetingSessionStatus } from "~/api/meetingSessions/meetingSessionsApi";
import {
  readPendingMeetingNavigation,
  savePendingMeetingNavigation,
} from "~/api/meetingSessions/pendingMeetingNavigation";
import { upsertMeetingSessionRecord } from "~/api/meetingSessions/meetingSessionRegistry";
import { validateTeamsJoinUrl } from "~/api/teams/teamsIntegrationApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspaceMeetingPath, workspacePath } from "~/routing/workspacePaths";
import { meetingStartDebug } from "~/utils/meetingStartDebug";

export default function MeetingNewPage() {
  const navigate = useNavigate();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [joinUrl, setJoinUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const inFlightJoinUrlRef = useRef("");

  const chrome = useMemo(
    () => ({
      header: {
        title: "Teams 会議に入室",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "Teams 会議に入室" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  useEffect(() => {
    const pending = readPendingMeetingNavigation(workspaceId);
    if (!pending) {
      return;
    }
    meetingStartDebug("meeting-start", "recovering pending meeting navigation", {
      reason: "returned_to_join_page_after_navigation",
      sessionId: pending.sessionId,
      to: pending.path,
    });
    navigate(pending.path, { replace: true });
  }, [navigate, workspaceId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedJoinUrl = normalizeMeetingUrlForClient(joinUrl);
    meetingStartDebug("meeting-start", "meetingUrl input submitted", {
      hasJoinUrl: Boolean(normalizedJoinUrl),
      host: safeUrlHost(normalizedJoinUrl),
    });

    if (submitInFlightRef.current && inFlightJoinUrlRef.current === normalizedJoinUrl) {
      meetingStartDebug("meeting-start", "join request ignored for same meetingUrl in flight", {
        host: safeUrlHost(normalizedJoinUrl),
      });
      return;
    }
    if (submitInFlightRef.current) {
      meetingStartDebug(
        "meeting-start",
        "submit ignored because another request is already in flight",
      );
      return;
    }
    setError(null);
    setSubmitMessage("");

    const validationError = validateTeamsJoinUrl(normalizedJoinUrl);
    if (validationError) {
      meetingStartDebug("meeting-start", "returning to URL input", {
        reason: "validation_failed",
        message: validationError,
      });
      setError(validationError);
      return;
    }

    submitInFlightRef.current = true;
    inFlightJoinUrlRef.current = normalizedJoinUrl;
    setIsSubmitting(true);
    setSubmitMessage("Join request送信中...");
    meetingStartDebug("meeting-start", "join request started", {
      host: safeUrlHost(normalizedJoinUrl),
    });
    try {
      meetingStartDebug("meeting-start", "POST /api/v1/meeting-sessions started");
      const session = await createMeetingSession(normalizedJoinUrl);
      meetingStartDebug("meeting-start", "join request completed", {
        sessionId: session.sessionId,
        meetingUrlHash: session.meetingUrlHash ?? null,
        status: session.status,
        reused: session.reused ?? false,
      });

      const readySession = await waitForMeetingSessionReady(session, workspaceId, (polled) => {
        upsertMeetingSessionRecord({
          sessionId: polled.sessionId,
          workspaceId,
          title: "Teams 会議",
          status: polled.status,
        });
        setSubmitMessage(formatSubmitMessage(polled.status));
        meetingStartDebug("meeting-start", "polled session status", {
          sessionId: polled.sessionId,
          meetingUrlHash: polled.meetingUrlHash ?? null,
          status: polled.status,
          botCallId: polled.botCallId ?? null,
        });
      });

      if (shouldReturnToInput(readySession.status)) {
        const message = readySession.lastError || `会議セッションが ${readySession.status} です。`;
        meetingStartDebug("meeting-start", "returning to URL input", {
          reason: "terminal_session_status",
          sessionId: readySession.sessionId,
          meetingUrlHash: readySession.meetingUrlHash ?? null,
          status: readySession.status,
          message,
        });
        setError(message);
        return;
      }

      if (!isReadyMeetingSessionStatus(readySession.status)) {
        const message = `会議セッションが ${readySession.status} のままタイムアウトしました。`;
        meetingStartDebug("meeting-start", "returning to URL input", {
          reason: "join_status_timeout",
          sessionId: readySession.sessionId,
          meetingUrlHash: readySession.meetingUrlHash ?? null,
          status: readySession.status,
          message,
        });
        setError(message);
        return;
      }

      upsertMeetingSessionRecord({
        sessionId: readySession.sessionId,
        workspaceId,
        title: "Teams 会議",
        status: readySession.status,
      });
      meetingStartDebug("meeting-start", "recent session persisted", {
        sessionId: readySession.sessionId,
        meetingUrlHash: readySession.meetingUrlHash ?? null,
        status: readySession.status,
      });
      const meetingPath = `${workspaceMeetingPath(workspaceId, readySession.sessionId)}?sessionId=${encodeURIComponent(
        readySession.sessionId,
      )}`;
      savePendingMeetingNavigation({
        workspaceId,
        sessionId: readySession.sessionId,
        path: meetingPath,
      });
      meetingStartDebug("meeting-start", "navigating to meeting page", {
        reason: "bot_join_ready_status",
        sessionId: readySession.sessionId,
        meetingUrlHash: readySession.meetingUrlHash ?? null,
        status: readySession.status,
        to: meetingPath,
      });
      navigate(meetingPath);
    } catch (cause) {
      meetingStartDebug("meeting-start", "submit failed", {
        message: cause instanceof Error ? cause.message : String(cause),
      });
      meetingStartDebug("meeting-start", "returning to URL input", {
        reason: "join_request_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      });
      setError(cause instanceof Error ? cause.message : "会議に入室できませんでした。");
    } finally {
      submitInFlightRef.current = false;
      inFlightJoinUrlRef.current = "";
      setIsSubmitting(false);
      setSubmitMessage("");
    }
  }

  return (
    <form className="mx-auto flex w-full max-w-160 flex-col gap-3" onSubmit={handleSubmit}>
      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="flex flex-col gap-4">
          <DsInput
            label="Teams 会議URL"
            placeholder="https://teams.microsoft.com/l/meetup-join/..."
            value={joinUrl}
            disabled={isSubmitting}
            onChange={(event) => setJoinUrl(event.currentTarget.value)}
          />

          {submitMessage && !error && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px]">
              {submitMessage}
            </p>
          )}

          {error && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}

          <DsButton type="submit" disabled={isSubmitting} fullWidth>
            <HiVideoCamera className="h-3.5 w-3.5" />
            {isSubmitting ? submitMessage || "入室中..." : "会議に入室"}
          </DsButton>
        </div>
      </section>
    </form>
  );
}

type MeetingSessionLike = Awaited<ReturnType<typeof createMeetingSession>>;

const meetingJoinPollIntervalMs = 1000;
const meetingJoinTimeoutMs = 45_000;

async function waitForMeetingSessionReady(
  initialSession: MeetingSessionLike,
  workspaceId: string,
  onStatus: (session: MeetingSessionLike) => void,
) {
  let session = initialSession;
  const deadline = Date.now() + meetingJoinTimeoutMs;
  meetingStartDebug("meeting-start", "polling target session_id fixed", {
    sessionId: session.sessionId,
    meetingUrlHash: session.meetingUrlHash ?? null,
    status: session.status,
    workspaceId,
  });

  for (;;) {
    onStatus(session);
    if (isReadyMeetingSessionStatus(session.status) || shouldReturnToInput(session.status)) {
      return session;
    }
    if (!isWaitingMeetingSessionStatus(session.status)) {
      return session;
    }
    if (Date.now() >= deadline) {
      return { ...session, status: "timeout" as const };
    }
    await sleep(meetingJoinPollIntervalMs);
    session = await getMeetingSession(session.sessionId);
  }
}

function isReadyMeetingSessionStatus(status: MeetingSessionStatus) {
  return status === "joined" || status === "recording" || status === "active";
}

function isWaitingMeetingSessionStatus(status: MeetingSessionStatus) {
  return (
    status === "requested" ||
    status === "pending_join" ||
    status === "command_sent" ||
    status === "joining"
  );
}

function normalizeMeetingUrlForClient(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    url.hash = "";
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function shouldReturnToInput(status: MeetingSessionStatus) {
  return status === "failed" || status === "stale" || status === "timeout";
}

function formatSubmitMessage(status: MeetingSessionStatus) {
  switch (status) {
    case "requested":
    case "pending_join":
    case "command_sent":
    case "joining":
      return "Bot参加状態を確認しています...";
    case "joined":
      return "Bot入室を確認しました。会議画面へ移動します...";
    case "recording":
    case "active":
      return "録音開始を確認しました。会議画面へ移動します...";
    default:
      return "会議セッションを確認しています...";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function safeUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}
