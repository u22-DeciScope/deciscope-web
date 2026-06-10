import {
  HiCheck,
  HiEllipsisHorizontal,
  HiExclamationTriangle,
  HiLightBulb,
  HiQuestionMarkCircle,
  HiSparkles,
} from "react-icons/hi2";

import type { AnalysisItem, RuntimeSpeakerSummary } from "~/api/meetings/meetingRuntimeTypes";

type MeetingAssistantPanelProps = {
  insights: AnalysisItem[];
  speakerSummaries: RuntimeSpeakerSummary[];
};

const insightIcons = {
  issue: HiLightBulb,
  question: HiQuestionMarkCircle,
  risk: HiExclamationTriangle,
};

export function MeetingAssistantPanel({ insights, speakerSummaries }: MeetingAssistantPanelProps) {
  const visibleInsights = insights.filter((insight) => insight.status !== "dismissed");

  return (
    <div
      className="flex min-h-0 w-full flex-col overflow-hidden rounded-(--ds-radius-panel)"
      style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
    >
      <header
        className="flex h-10 shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: "var(--brand)" }}
        >
          <HiSparkles className="h-3.5 w-3.5" />
        </span>
        <span
          className="ml-2 flex-1 text-[12px] font-semibold"
          style={{ color: "var(--text-main)" }}
        >
          AI アシスタント
        </span>
        <span
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {visibleInsights.length}
        </span>
      </header>

      <div
        className="flex h-8.5 shrink-0 items-center gap-1 border-b px-2"
        style={{ borderColor: "var(--node-border)" }}
      >
        {["すべて", "リスク", "論点", "質問"].map((label, index) => (
          <button
            key={label}
            type="button"
            className="rounded-md px-1.5 py-1 text-[10px]"
            style={
              index === 0
                ? { background: "var(--chat-other-bg)", color: "var(--brand)" }
                : { color: "var(--text-muted)" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {speakerSummaries.length > 0 && (
          <section className="rounded-(--ds-radius-control) border p-3" style={{ borderColor: "var(--ds-border)" }}>
            <h2 className="mb-2 text-[11px] font-semibold" style={{ color: "var(--text-main)" }}>
              話者ごとの要約
            </h2>
            <div className="space-y-2">
              {speakerSummaries.map((summary) => (
                <div key={summary.speaker_label}>
                  <p className="text-[10px] font-semibold" style={{ color: "var(--text-sub)" }}>
                    {summary.speaker_label}
                  </p>
                  <p className="text-[10px] leading-4" style={{ color: "var(--text-muted)" }}>
                    {[...summary.claims, ...summary.questions, ...summary.todos].join(" / ") ||
                      "要約はまだありません。"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {visibleInsights.length === 0 && (
          <p className="px-2 py-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            テストデータ再生の進行に合わせて分析カードが表示されます。
          </p>
        )}
        {visibleInsights.map((insight) => {
          const Icon = insightIcons[insight.kind as keyof typeof insightIcons] ?? HiLightBulb;
          const style = insightStyle(insight.kind);
          return (
            <article
              key={insight.id}
              className="rounded-(--ds-radius-control) border p-3"
              style={{ background: style.background, borderColor: style.border }}
            >
              <div
                className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold"
                style={{ color: style.color }}
              >
                <Icon className="h-3.5 w-3.5" />
                {insight.kind} / {insight.severity}
              </div>
              <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
                {insight.title}
              </h2>
              <p className="mt-2 text-[11px] leading-4" style={{ color: "var(--text-sub)" }}>
                {insight.body}
              </p>
              <div className="mt-3 flex items-center justify-between gap-1">
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {insight.status}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-(--reaction-bg)"
                  >
                    <HiCheck className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-(--reaction-bg)"
                  >
                    <HiEllipsisHorizontal className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function insightStyle(kind: string) {
  if (kind === "risk") {
    return {
      background: "var(--ai-risk-bg)",
      border: "var(--ai-risk-border)",
      color: "var(--ai-risk-fg)",
    };
  }
  if (kind === "question") {
    return {
      background: "var(--ai-quest-bg)",
      border: "var(--ai-quest-border)",
      color: "var(--ai-quest-fg)",
    };
  }
  return {
    background: "var(--ai-point-bg)",
    border: "var(--ai-point-border)",
    color: "var(--ai-point-fg)",
  };
}
