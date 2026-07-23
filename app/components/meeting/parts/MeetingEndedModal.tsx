import { HiCheck } from "react-icons/hi2";

import { DsButton } from "~/components/DsButton";
import { AppModalFrame } from "~/components/shared/modal/AppModalFrame";
import type { MeetingEndProgressStage } from "~/hooks/useMeetingEndFlow";

export function MeetingEndedModal({
  mode,
  progressStage = "transcript",
  onGoHome,
  onGoSummary,
}: {
  mode: "ending" | "ended";
  progressStage?: MeetingEndProgressStage;
  onGoHome: () => void;
  onGoSummary: () => void;
}) {
  const ending = mode === "ending";
  const activeProgressIndex = endingProgressSteps.findIndex((step) => step.id === progressStage);

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
          <div className="space-y-4">
            <ol className="space-y-2" aria-label="会議の終了処理">
              {endingProgressSteps.map((step, index) => {
                const completed = index < activeProgressIndex;
                const current = index === activeProgressIndex;
                return (
                  <li
                    key={step.id}
                    aria-current={current ? "step" : undefined}
                    data-progress-state={completed ? "completed" : current ? "current" : "pending"}
                    className="flex items-center gap-3 rounded-(--ds-radius-control) px-3 py-2.5"
                    style={{
                      background: current
                        ? "color-mix(in srgb, var(--brand) 9%, var(--ds-surface))"
                        : "var(--ds-surface-muted)",
                      color: current || completed ? "var(--text-main)" : "var(--text-muted)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        current ? "animate-pulse" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        background:
                          current || completed ? "var(--brand)" : "var(--ds-surface-raised)",
                        color: current || completed ? "white" : "var(--text-muted)",
                        border: completed || current ? "none" : "1px solid var(--ds-border)",
                      }}
                    >
                      {completed ? <HiCheck className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className="text-[13px] font-semibold">
                      {completed
                        ? `${step.label}しました`
                        : current
                          ? `${step.label}中…`
                          : `${step.label}します`}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div
              className="h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="会議の終了処理中"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={[33, 66, 90][activeProgressIndex] ?? 33}
              style={{ background: "var(--input-bg)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  background: "var(--brand)",
                  width: `${[33, 66, 90][activeProgressIndex] ?? 33}%`,
                }}
              />
            </div>
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

const endingProgressSteps: Array<{ id: MeetingEndProgressStage; label: string }> = [
  { id: "transcript", label: "文字起こしを確定" },
  { id: "tree", label: "議論ツリーを整理" },
  { id: "report", label: "会議レポートを作成" },
];
