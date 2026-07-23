import { DsButton } from "~/components/DsButton";
import { AppModalFrame } from "~/components/shared/modal/AppModalFrame";

export function MeetingEndedModal({
  mode,
  onGoHome,
  onGoSummary,
}: {
  mode: "ending" | "ended";
  onGoHome: () => void;
  onGoSummary: () => void;
}) {
  const ending = mode === "ending";

  return (
    <AppModalFrame
      ariaLabelledBy="meeting-ended-dialog-title"
      onClose={() => {}}
      className="w-full max-w-md overflow-hidden rounded-(--ds-radius-dialog) border p-5 outline-none"
      style={{
        background: "var(--ds-surface-raised)",
        borderColor: "var(--ds-border)",
        boxShadow: "0 24px 80px rgba(15, 38, 56, 0.32)",
      }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <h2
            id="meeting-ended-dialog-title"
            className="text-base font-bold"
            style={{ color: "var(--text-main)" }}
          >
            {ending ? "会議を終了しています" : "会議が終了しました"}
          </h2>
          <p
            className="mt-2 whitespace-pre-line text-sm leading-relaxed"
            style={{ color: "var(--text-sub)" }}
          >
            {ending
              ? "最後の文字起こしとAI分析を整理しています。\n完了するまでこの画面を閉じずにお待ちください。"
              : "BotはTeams会議から退出しました。\n文字起こしの内容は会議詳細画面から確認できます。"}
          </p>
        </div>

        {ending ? (
          <div
            className="h-1.5 overflow-hidden rounded-full"
            role="progressbar"
            aria-label="会議の終了処理中"
            style={{ background: "var(--input-bg)" }}
          >
            <div
              className="ds-progress-indeterminate h-full w-2/5 rounded-full"
              style={{ background: "var(--brand)" }}
            />
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DsButton type="button" variant="secondary" onClick={onGoHome}>
              メイン画面へ戻る
            </DsButton>
            <DsButton type="button" onClick={onGoSummary}>
              会議詳細を見る
            </DsButton>
          </div>
        )}
      </div>
    </AppModalFrame>
  );
}
