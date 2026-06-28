import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { HiVideoCamera } from "react-icons/hi2";

import { createMeetingSession } from "~/api/meetingSessions/meetingSessionsApi";
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
  const { hash, pathname, search } = useLocation();
  const { workspaceId } = useAuthenticatedLayout();
  const currentPath = `${pathname}${search}${hash}`;
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
      source: "meeting-start",
      reason: "returned_to_join_page_after_navigation",
      currentPath,
      targetPath: pending.path,
      authLoading: false,
      workspaceLoading: false,
      sessionId: pending.sessionId,
      meetingStatus: null,
    });
    navigate(pending.path, { replace: true });
  }, [currentPath, navigate, workspaceId]);

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
        source: "meeting-start",
        reason: "validation_failed",
        currentPath,
        targetPath: currentPath,
        authLoading: false,
        workspaceLoading: false,
        sessionId: null,
        meetingStatus: null,
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

      upsertMeetingSessionRecord({
        sessionId: session.sessionId,
        workspaceId,
        title: "Teams 会議",
        status: session.status,
      });
      meetingStartDebug("meeting-start", "recent session persisted", {
        sessionId: session.sessionId,
        meetingUrlHash: session.meetingUrlHash ?? null,
        status: session.status,
      });
      const meetingPath = `${workspaceMeetingPath(workspaceId, session.sessionId)}?sessionId=${encodeURIComponent(
        session.sessionId,
      )}`;
      savePendingMeetingNavigation({
        workspaceId,
        sessionId: session.sessionId,
        path: meetingPath,
      });
      setSubmitMessage("会議画面へ移動します...");
      meetingStartDebug("meeting-start", "navigating to meeting page", {
        source: "meeting-start",
        reason: "session_created_or_reused",
        currentPath,
        targetPath: meetingPath,
        authLoading: false,
        workspaceLoading: false,
        sessionId: session.sessionId,
        meetingUrlHash: session.meetingUrlHash ?? null,
        status: session.status,
        meetingStatus: session.status,
        botCallId: session.botCallId ?? null,
        reused: session.reused ?? false,
      });
      navigate(meetingPath);
    } catch (cause) {
      meetingStartDebug("meeting-start", "submit failed", {
        message: cause instanceof Error ? cause.message : String(cause),
      });
      meetingStartDebug("meeting-start", "returning to URL input", {
        source: "meeting-start",
        reason: "join_request_failed",
        currentPath,
        targetPath: currentPath,
        authLoading: false,
        workspaceLoading: false,
        sessionId: null,
        meetingStatus: null,
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

function safeUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}
