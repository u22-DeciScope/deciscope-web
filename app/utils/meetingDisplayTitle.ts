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

export type MeetingDisplayTitleOptions = {
  component?: string;
};

export function getMeetingDisplayTitle(
  session: MeetingDisplayTitleSource | null | undefined,
  options: MeetingDisplayTitleOptions = {},
) {
  const title =
    session?.displayTitle?.trim() ||
    session?.title?.trim() ||
    session?.graphTitle?.trim() ||
    session?.userProvidedTitle?.trim() ||
    session?.meetingSubject?.trim() ||
    session?.metadata?.subject?.trim();

  const sessionId = session?.sessionId ?? session?.id ?? null;
  const component = options.component ?? "unknown";
  if (title) {
    if (import.meta.env.DEV) {
      const logger =
        session?.titleSource === "fallback" || session?.titleResolutionErrorCode
          ? console.warn
          : console.log;
      logger("[meeting-title] meeting title rendered", {
        component,
        sessionId,
        title,
        titleSource: session?.titleSource ?? null,
        titleResolutionErrorCode: session?.titleResolutionErrorCode ?? null,
        titleResolutionErrorMessage: session?.titleResolutionErrorMessage ?? null,
        fallbackUsed: false,
      });
    }
    return title;
  }

  if (import.meta.env.DEV) {
    console.warn("[meeting-title] fallback title used", {
      component,
      sessionId,
      reason: "missing_title_subject_metadata_subject",
      title: session?.title ?? null,
      displayTitle: session?.displayTitle ?? null,
      graphTitle: session?.graphTitle ?? null,
      userProvidedTitle: session?.userProvidedTitle ?? null,
      meetingSubject: session?.meetingSubject ?? null,
      titleSource: session?.titleSource ?? null,
      fallbackUsed: true,
    });
  }

  return FALLBACK_MEETING_DISPLAY_TITLE;
}
