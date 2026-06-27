import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { HiVideoCamera } from "react-icons/hi2";

import { createMeetingSession } from "~/api/meetingSessions/meetingSessionsApi";
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
  const [error, setError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlightRef.current) {
      meetingStartDebug("meeting-start", "submit ignored because request is already in flight");
      return;
    }
    setError(null);

    const validationError = validateTeamsJoinUrl(joinUrl);
    if (validationError) {
      setError(validationError);
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    meetingStartDebug("meeting-start", "submit started", { hasJoinUrl: Boolean(joinUrl.trim()) });
    try {
      meetingStartDebug("meeting-start", "POST /api/v1/meeting-sessions started");
      const session = await createMeetingSession(joinUrl.trim());
      meetingStartDebug("meeting-start", "session created", {
        sessionId: session.sessionId,
        status: session.status,
      });
      upsertMeetingSessionRecord({
        sessionId: session.sessionId,
        workspaceId,
        title: "Teams 会議",
        status: session.status,
      });
      meetingStartDebug("meeting-start", "recent session persisted", {
        sessionId: session.sessionId,
      });
      const meetingPath = `${workspaceMeetingPath(workspaceId, session.sessionId)}?sessionId=${encodeURIComponent(
        session.sessionId,
      )}`;
      meetingStartDebug("meeting-start", "navigating to meeting page", { to: meetingPath });
      navigate(meetingPath);
    } catch (cause) {
      meetingStartDebug("meeting-start", "submit failed", {
        message: cause instanceof Error ? cause.message : String(cause),
      });
      setError(cause instanceof Error ? cause.message : "会議に入室できませんでした。");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
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
            onChange={(event) => setJoinUrl(event.currentTarget.value)}
          />

          {error && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}

          <DsButton type="submit" disabled={isSubmitting} fullWidth>
            <HiVideoCamera className="h-3.5 w-3.5" />
            {isSubmitting ? "入室中..." : "会議に入室"}
          </DsButton>
        </div>
      </section>
    </form>
  );
}
