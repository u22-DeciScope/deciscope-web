export const FALLBACK_MEETING_DISPLAY_TITLE = "Teams会議";

export type MeetingDisplayTitleSource = {
  id?: string | null;
  sessionId?: string | null;
  title?: string | null;
  displayTitle?: string | null;
  graphTitle?: string | null;
  userProvidedTitle?: string | null;
  meetingSubject?: string | null;
  titleSource?: string | null;
  titleResolutionErrorCode?: string | null;
  titleResolutionErrorMessage?: string | null;
  metadata?: {
    subject?: string | null;
  } | null;
};

export function getMeetingDisplayTitle(session: MeetingDisplayTitleSource | null | undefined) {
  const title =
    session?.displayTitle?.trim() ||
    session?.title?.trim() ||
    session?.graphTitle?.trim() ||
    session?.userProvidedTitle?.trim() ||
    session?.meetingSubject?.trim() ||
    session?.metadata?.subject?.trim();

  if (title) {
    return title;
  }

  return FALLBACK_MEETING_DISPLAY_TITLE;
}
