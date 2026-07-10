import { useState } from "react";
import { HiShare } from "react-icons/hi2";

import { createMeetingJoinToken } from "~/api/meetings/meetingsApi";
import { DsButton } from "~/components/DsButton";

type MeetingReportShareActionProps = {
  meetingId: string | undefined;
  onToken: (token: string) => void;
};

export function MeetingReportShareAction({ meetingId, onToken }: MeetingReportShareActionProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function shareReport() {
    if (!meetingId || isSharing) {
      return;
    }
    setIsSharing(true);
    setError(null);
    try {
      const token = await createMeetingJoinToken(meetingId);
      onToken(token.token);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `共有リンクを作成できませんでした: ${cause.message}`
          : "共有リンクを作成できませんでした。",
      );
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DsButton variant="secondary" disabled={!meetingId || isSharing} onClick={shareReport}>
        <HiShare className="h-3.5 w-3.5" />
        {isSharing ? "共有中..." : "共有"}
      </DsButton>
      {error && (
        <span role="alert" className="max-w-72 text-right text-[11px] text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
