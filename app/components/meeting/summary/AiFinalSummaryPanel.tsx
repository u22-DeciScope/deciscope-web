import { HiSparkles } from "react-icons/hi2";

import type {
  FinalSummaryActionItem,
  FinalSummaryDecision,
  FinalSummaryPayload,
  MeetingAIAnalysis,
  MeetingAIAnalysisImportance,
} from "~/api/aiAnalysis/aiAnalysisApi";

const importanceDot: Record<MeetingAIAnalysisImportance, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

const importanceLabel: Record<MeetingAIAnalysisImportance, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

type AiFinalSummaryPanelProps = {
  final: MeetingAIAnalysis | null;
  currentTitle?: string;
};

export function AiFinalSummaryPanel({ final, currentTitle }: AiFinalSummaryPanelProps) {
  if (!final) {
    return null;
  }

  if (final.status === "running") {
    return (
      <section
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-5 py-4"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-sub)" }}>
          <span
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
            style={{ background: "var(--brand)" }}
          />
          AI最終要約を生成中です…
        </p>
      </section>
    );
  }

  if (final.status === "failed") {
    return (
      <section
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-5 py-4"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          AI最終要約の生成に失敗しました。
        </p>
      </section>
    );
  }

  const payload = final.payload as FinalSummaryPayload | null;
  if (!payload) {
    return null;
  }

  const suggestedTitle = payload.suggestedTitle?.trim();
  const showSuggestedTitle = Boolean(suggestedTitle && suggestedTitle !== currentTitle?.trim());
  const hasOverview = Boolean(payload.overview);

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {(hasOverview || showSuggestedTitle) && (
        <section
          className="rounded-(--ds-radius-panel) px-6 py-5"
          style={{
            background: "var(--ai-quest-bg)",
            border: "1px solid var(--ai-quest-border)",
            boxShadow: "var(--ds-shadow)",
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-(--ds-radius-control)"
              style={{ background: "var(--brand)" }}
            >
              <HiSparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--ai-quest-fg)" }}>
              AI 最終要約
            </p>
          </div>
          {showSuggestedTitle && (
            <p className="mb-2 text-[11px]" style={{ color: "var(--ai-quest-fg)", opacity: 0.85 }}>
              AI提案: {suggestedTitle}
            </p>
          )}
          {hasOverview && (
            <p
              className="whitespace-pre-wrap text-[12px] leading-relaxed"
              style={{ color: "var(--ai-quest-fg)" }}
            >
              {payload.overview}
            </p>
          )}
        </section>
      )}

      {payload.decisions.length > 0 && <FinalDecisionList decisions={payload.decisions} />}
      {payload.actionItems.length > 0 && <FinalActionList actions={payload.actionItems} />}
      {payload.openIssues.length > 0 && (
        <FinalTextListSection title="未解決事項" items={payload.openIssues} />
      )}
      {payload.keyPoints.length > 0 && (
        <FinalTextListSection title="重要な論点" items={payload.keyPoints} />
      )}
      {payload.nextMeetingTopics.length > 0 && (
        <FinalTextListSection title="次回トピック" items={payload.nextMeetingTopics} />
      )}
    </div>
  );
}

function FinalDecisionList({ decisions }: { decisions: FinalSummaryDecision[] }) {
  return (
    <FinalSummarySection title="決定事項" count={decisions.length} badge="decision">
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {decisions.map((decision, index) => (
          <div key={`${index}:${decision.text}`} className="flex items-start gap-3 px-5 py-4">
            <div
              className="mt-1 w-1 shrink-0 self-stretch rounded-full"
              style={{ background: importanceDot[decision.importance ?? "medium"] }}
            />
            <p
              className="min-w-0 flex-1 text-[13px] font-medium leading-relaxed"
              style={{ color: "var(--text-main)" }}
            >
              {decision.text}
            </p>
          </div>
        ))}
      </div>
    </FinalSummarySection>
  );
}

function FinalActionList({ actions }: { actions: FinalSummaryActionItem[] }) {
  return (
    <FinalSummarySection title="アクションアイテム" count={actions.length} badge="action">
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {actions.map((action, index) => (
          <div key={`${index}:${action.text}`} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px]" style={{ color: "var(--text-main)" }}>
                {action.text}
              </p>
              {(action.owner || action.due) && (
                <div className="mt-0.5 flex items-center gap-3">
                  {action.owner && (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {action.owner}
                    </span>
                  )}
                  {action.due && (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      期限: {action.due}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: importanceDot[action.priority ?? "medium"] }}
              title={importanceLabel[action.priority ?? "medium"]}
            />
          </div>
        ))}
      </div>
    </FinalSummarySection>
  );
}

function FinalTextListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <FinalSummarySection title={title} count={items.length} badge="decision">
      <ul className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {items.map((item, index) => (
          <li
            key={`${index}:${item}`}
            className="px-5 py-3 text-[12px] leading-relaxed"
            style={{ color: "var(--text-sub)" }}
          >
            {item}
          </li>
        ))}
      </ul>
    </FinalSummarySection>
  );
}

function FinalSummarySection({
  badge,
  children,
  count,
  title,
}: {
  badge: "action" | "decision";
  children: React.ReactNode;
  count: number;
  title: string;
}) {
  const badgeStyles =
    badge === "decision"
      ? { background: "var(--badge-decision-bg)", color: "var(--badge-decision-fg)" }
      : { background: "var(--badge-action-bg)", color: "var(--badge-action-fg)" };

  return (
    <div
      className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <div
        className="flex h-10 items-center border-b px-5"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <span
          className="mr-2 h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--brand)" }}
        />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
          {title}
        </span>
        <span
          className="ml-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
          style={badgeStyles}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}
