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
      className="flex min-h-0 w-full flex-col overflow-hidden rounded-(--ds-radius-panel) border"
      style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
    >
      <header
        className="flex h-11 shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: "var(--brand)" }}
        >
          <HiSparkles className="h-3.5 w-3.5" />
        </span>
        <div className="ml-2 min-w-0 flex-1">
          <p className="text-[12px] font-bold" style={{ color: "var(--text-main)" }}>
            AI アシスタント
          </p>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            論点・リスク・次の一手
          </p>
        </div>
        <span
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {visibleInsights.length}
        </span>
      </header>

      <div
        className="flex h-9 shrink-0 items-center gap-1 border-b px-2"
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

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {speakerSummaries.length > 0 && (
          <section
            className="rounded-(--ds-radius-control) border p-3"
            style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
          >
            <h2 className="mb-2 text-[11px] font-bold" style={{ color: "var(--text-main)" }}>
              話者ごとの要約
            </h2>
            <div className="space-y-2">
              {speakerSummaries.map((summary) => (
                <div key={summary.speaker_label} className="min-w-0">
                  <p className="text-[10px] font-semibold" style={{ color: "var(--text-sub)" }}>
                    {summary.speaker_label}
                  </p>
                  <p
                    className="mt-0.5 text-[11px] leading-5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {[...summary.claims, ...summary.questions, ...summary.todos].join(" / ") ||
                      "要約はまだありません。"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {visibleInsights.length === 0 && (
          <div
            className="rounded-(--ds-radius-control) border px-3 py-4 text-[12px]"
            style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
          >
            <p className="font-semibold" style={{ color: "var(--text-main)" }}>
              まだAIメモはありません
            </p>
            <p className="mt-1 leading-5" style={{ color: "var(--text-muted)" }}>
              分析イベントが届くと、リスクや質問がここへカード表示されます。
            </p>
          </div>
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <div
                  className="flex items-center gap-1.5 text-[10px] font-bold"
                  style={{ color: style.color }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {insight.kind}
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background: "var(--reaction-bg)",
                    color: severityColor(insight.severity),
                  }}
                >
                  {insight.severity}
                </span>
              </div>
              <h2 className="text-[13px] font-bold leading-5" style={{ color: "var(--text-main)" }}>
                {insight.title}
              </h2>
              <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--text-sub)" }}>
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

function severityColor(severity: string) {
  if (severity === "high") {
    return "var(--priority-high)";
  }
  if (severity === "medium") {
    return "var(--priority-medium)";
  }
  return "var(--priority-low)";
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
