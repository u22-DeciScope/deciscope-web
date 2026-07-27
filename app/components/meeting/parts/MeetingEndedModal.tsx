import { useEffect, useState } from "react";
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
  const activeProgressIndex = Math.max(
    0,
    endingProgressSteps.findIndex((step) => step.id === progressStage),
  );

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
            <MeetingEndProgressBar
              stage={endingProgressSteps[activeProgressIndex].id}
              percent={endingProgressPercents[activeProgressIndex]}
            />
          </div>
        ) : (
          // 横並び時は2つのボタンを左右に振り分ける。ダイアログの端に張り付かないよう、
          // 左右に少しだけ余白(px-3)を足して間隔のバランスを取る。
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:px-3">
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

// 終了処理の進捗バー。バックエンドから取れる節目は3段階と粗く、段階内では
// 数十秒バーが止まって見えてしまうため、現在の段階の到達点へ向けて減速しながら
// 伸び続ける(到達点は段階の境界なので、実際の進捗を追い越しては見せない)。
// 段階が進むと目標値と所要時間が切り替わり、そのまま次の到達点へ伸びていく。
function MeetingEndProgressBar({
  stage,
  percent,
}: {
  stage: MeetingEndProgressStage;
  percent: number;
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // 描画と同じフレームで目標値を入れるとCSS transitionが走らないため、
    // 次フレームで反映する。段階が進んだときは現在位置から続きを描く。
    const frame = requestAnimationFrame(() => setWidth(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <div
      className="h-1.5 overflow-hidden rounded-full"
      role="progressbar"
      aria-label="会議の終了処理中"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ background: "var(--input-bg)" }}
    >
      <div
        className="ds-progress-fill relative h-full overflow-hidden rounded-full"
        data-stage={stage}
        style={{ background: "var(--brand)", width: `${width}%` }}
      >
        <span
          aria-hidden="true"
          className="ds-progress-sheen absolute inset-y-0 left-0 w-1/2"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, white 45%, transparent), transparent)",
          }}
        />
      </div>
    </div>
  );
}

const endingProgressSteps: Array<{ id: MeetingEndProgressStage; label: string }> = [
  { id: "transcript", label: "文字起こしを確定" },
  { id: "tree", label: "議論ツリーを整理" },
  { id: "report", label: "会議レポートを作成" },
];

// 各段階の到達点(バーの目標値・aria-valuenow)。endingProgressStepsと同じ順。
const endingProgressPercents = [33, 66, 90];
