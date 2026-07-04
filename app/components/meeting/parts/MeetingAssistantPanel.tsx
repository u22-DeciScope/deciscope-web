import { useState } from "react";
import {
  HiCheck,
  HiCheckCircle,
  HiClipboardDocumentList,
  HiEllipsisHorizontal,
  HiExclamationTriangle,
  HiLightBulb,
  HiQuestionMarkCircle,
  HiSparkles,
} from "react-icons/hi2";

import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { AnalysisItem, RuntimeSpeakerSummary } from "~/api/meetings/meetingRuntimeTypes";

type MeetingAssistantPanelProps = {
  insights: AnalysisItem[];
  speakerSummaries: RuntimeSpeakerSummary[];
  liveAnalysis?: MeetingAIAnalysis | null;
  updateStatus?: React.ReactNode;
};

const insightIcons = {
  issue: HiLightBulb,
  question: HiQuestionMarkCircle,
  risk: HiExclamationTriangle,
  decision: HiCheckCircle,
  todo: HiClipboardDocumentList,
};

const insightKindLabels: Record<string, string> = {
  issue: "論点",
  question: "質問",
  risk: "リスク",
  decision: "決定",
  todo: "TODO",
};

type InsightFilter = "all" | "risk" | "issue" | "question" | "todo";

const insightFilterTabs: Array<{ key: InsightFilter; label: string }> = [
  { key: "all", label: "すべて" },
  { key: "risk", label: "リスク" },
  { key: "issue", label: "論点" },
  { key: "question", label: "質問" },
  { key: "todo", label: "TODO" },
];

function matchesInsightFilter(kind: string, filter: InsightFilter) {
  switch (filter) {
    case "all":
      return true;
    case "risk":
      return kind === "risk";
    case "issue":
      return kind === "issue" || kind === "decision";
    case "question":
      return kind === "question";
    case "todo":
      return kind === "todo";
    default:
      return true;
  }
}

export function MeetingAssistantPanel({
  insights,
  speakerSummaries,
  liveAnalysis,
  updateStatus,
}: MeetingAssistantPanelProps) {
  const [filter, setFilter] = useState<InsightFilter>("all");
  const visibleInsights = insights.filter((insight) => insight.status !== "dismissed");
  const livePayload = (liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  // resolved は解消済みitem。基本はバックエンド側でitemsから除去されるが、防御として除外する。
  const liveItems = (livePayload?.items ?? []).filter(
    (item) => item.status !== "dismissed" && item.status !== "resolved",
  );
  const totalCount = visibleInsights.length + liveItems.length;
  const filteredLiveItems = liveItems.filter((item) => matchesInsightFilter(item.kind, filter));
  const filteredInsights = visibleInsights.filter((insight) =>
    matchesInsightFilter(insight.kind, filter),
  );

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
        {updateStatus && <span className="mr-2 min-w-0 shrink">{updateStatus}</span>}
        <span
          className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {totalCount}
        </span>
      </header>

      <div
        className="flex h-9 w-full shrink-0 items-center gap-0.5 border-b px-1.5"
        style={{ borderColor: "var(--node-border)" }}
      >
        {insightFilterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="min-w-0 flex-1 whitespace-nowrap rounded-md px-0.5 py-1 text-center text-[10px] tracking-tight"
            style={
              tab.key === filter
                ? { background: "var(--chat-other-bg)", color: "var(--brand)" }
                : { color: "var(--text-muted)" }
            }
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {liveAnalysis && <LiveAnalysisOverview liveAnalysis={liveAnalysis} payload={livePayload} />}
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
        {totalCount === 0 && (
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
        {filteredLiveItems.map((item) => (
          <LiveAnalysisItemCard key={item.id} item={item} />
        ))}
        {filteredInsights.map((insight) => {
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
  if (kind === "decision") {
    return {
      background: "var(--badge-decision-bg)",
      border: "var(--ds-border)",
      color: "var(--badge-decision-fg)",
    };
  }
  if (kind === "todo") {
    return {
      background: "var(--badge-action-bg)",
      border: "var(--ai-point-border)",
      color: "var(--badge-action-fg)",
    };
  }
  return {
    background: "var(--ai-point-bg)",
    border: "var(--ai-point-border)",
    color: "var(--ai-point-fg)",
  };
}

// ライブ分析のitem 1件を、既存insightsカードと同じビジュアル言語で表示する。
// itemsは全置換のstateなので、解消されたitemはpayloadから消え、カードも自然に消える。
function LiveAnalysisItemCard({ item }: { item: AnalysisItem }) {
  const Icon = insightIcons[item.kind as keyof typeof insightIcons] ?? HiLightBulb;
  const style = insightStyle(item.kind);
  return (
    <article
      className="rounded-(--ds-radius-control) border p-3"
      style={{ background: style.background, borderColor: style.border }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold"
          style={{ color: style.color }}
        >
          <Icon className="h-3.5 w-3.5" />
          {insightKindLabels[item.kind] ?? item.kind}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "var(--reaction-bg)", color: severityColor(item.severity) }}
        >
          {item.severity}
        </span>
      </div>
      <h2 className="text-[13px] font-bold leading-5" style={{ color: "var(--text-main)" }}>
        {item.title}
      </h2>
      {item.body && item.body !== item.title && (
        <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--text-sub)" }}>
          {item.body}
        </p>
      )}
    </article>
  );
}

function LiveAnalysisOverview({
  liveAnalysis,
  payload,
}: {
  liveAnalysis: MeetingAIAnalysis;
  payload: LiveAnalysisPayload | null;
}) {
  return (
    <section
      className="rounded-(--ds-radius-control) border p-3"
      style={{ background: "var(--ai-quest-bg)", borderColor: "var(--ai-quest-border)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold" style={{ color: "var(--ai-quest-fg)" }}>
          ライブ分析
        </h2>
        <LiveAnalysisStatus liveAnalysis={liveAnalysis} />
      </div>

      {payload && (payload.summary || payload.currentTopic) && (
        <div className="space-y-2.5">
          {payload.summary && (
            <LiveAnalysisBlock title="議論の要約">
              <p
                className="whitespace-pre-wrap text-[11px] leading-5"
                style={{ color: "var(--ai-quest-fg)" }}
              >
                {payload.summary}
              </p>
            </LiveAnalysisBlock>
          )}

          {payload.currentTopic && (
            <LiveAnalysisBlock title="現在のトピック">
              <p className="text-[11px] leading-5" style={{ color: "var(--ai-quest-fg)" }}>
                {payload.currentTopic}
              </p>
            </LiveAnalysisBlock>
          )}
        </div>
      )}
    </section>
  );
}

function LiveAnalysisBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="mb-1 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: "var(--ai-quest-fg)", opacity: 0.75 }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function LiveAnalysisStatus({ liveAnalysis }: { liveAnalysis: MeetingAIAnalysis }) {
  if (liveAnalysis.status === "running") {
    return (
      <span
        className="flex items-center gap-1 text-[10px] font-semibold"
        style={{ color: "var(--ai-quest-fg)" }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        分析中…
      </span>
    );
  }

  if (liveAnalysis.status === "failed") {
    return (
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        分析を一時的に利用できません
      </span>
    );
  }

  const updatedLabel = formatUpdatedAtTime(liveAnalysis.updatedAtUtc);
  return (
    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
      {updatedLabel ? `${updatedLabel} 更新` : ""}
    </span>
  );
}

function formatUpdatedAtTime(value?: string) {
  if (!value) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Date(timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
