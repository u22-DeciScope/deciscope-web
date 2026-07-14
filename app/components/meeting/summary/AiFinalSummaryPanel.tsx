import {
  HiArrowPath,
  HiSparkles,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineLightBulb,
  HiOutlineQueueList,
  HiCheck,
  HiOutlineUser, // 担当者アイコン用に追加
} from "react-icons/hi2";

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
  pending?: boolean;
  contextPanel?: React.ReactNode;
};

export function AiFinalSummaryPanel({
  final,
  currentTitle,
  pending,
  contextPanel,
}: AiFinalSummaryPanelProps) {
  if (!final) {
    if (!pending) {
      return null;
    }
    return (
      <section
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-8 py-7"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="flex items-center gap-2 text-[14px]" style={{ color: "var(--text-sub)" }}>
          <HiArrowPath className="h-4 w-4 animate-spin" style={{ color: "var(--brand)" }} />
          AI最終要約を生成しています…
        </p>
      </section>
    );
  }

  if (final.status === "running") {
    return (
      <section
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-8 py-7"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="flex items-center gap-2 text-[14px]" style={{ color: "var(--text-sub)" }}>
          <span
            className="h-2 w-2 shrink-0 animate-pulse rounded-full"
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
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-8 py-7"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
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
    <div className="flex shrink-0 flex-col gap-8">
      <section
        className="rounded-(--ds-radius-panel) border p-8"
        style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-(--ds-radius-control)"
            style={{ background: "var(--brand)" }}
          >
            <HiSparkles className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>
            重要な結果
          </h2>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div
            className="rounded-(--ds-radius-panel) p-6"
            style={{
              background: "var(--ai-quest-bg)",
              border: "1px solid var(--ai-quest-border)",
            }}
          >
            <p className="mb-4 text-[15px] font-bold" style={{ color: "var(--ai-quest-fg)" }}>
              AI 最終要約
            </p>
            {showSuggestedTitle && (
              <p className="mb-4 text-[13px] font-medium" style={{ color: "var(--ai-quest-fg)", opacity: 0.85 }}>
                AI提案: {suggestedTitle}
              </p>
            )}
            {hasOverview && (
              <ul className="flex flex-col gap-3">
                {payload.overview?.split('\n').filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: "var(--ai-quest-fg)" }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>{contextPanel}</div>
        </div>
      </section>

      {/* 改善点1: CSS Grid (grid-cols-2) を使用して、同じ行のパネルの高さを揃える */}
      <div className="grid gap-8 md:grid-cols-2">
        {payload.decisions.length > 0 && (
          <FinalDecisionList decisions={payload.decisions} />
        )}
        {payload.actionItems.length > 0 && (
          <FinalActionList actions={payload.actionItems} />
        )}
        {payload.openIssues.length > 0 && (
          <FinalTextListSection title="未解決事項" items={payload.openIssues} icon={HiOutlineQuestionMarkCircle} />
        )}
        {payload.keyPoints.length > 0 && (
          <FinalTextListSection title="重要な論点" items={payload.keyPoints} icon={HiOutlineLightBulb} />
        )}
        {payload.nextMeetingTopics.length > 0 && (
          <FinalTextListSection title="次回トピック" items={payload.nextMeetingTopics} icon={HiOutlineQueueList} />
        )}
      </div>
    </div>
  );
}

function FinalSummarySection({
  badge,
  children,
  count,
  title,
  icon: Icon,
}: {
  badge: "action" | "decision";
  children: React.ReactNode;
  count: number;
  title: string;
  icon?: React.ElementType;
}) {
  return (
    // 改善点1: h-full, flex, flex-col を追加し、グリッド内で高さが最大まで広がるように
    <div className="ds-surface flex h-full flex-col overflow-hidden rounded-(--ds-radius-panel) p-8" style={{ boxShadow: "var(--ds-shadow)" }}>
      <div className="mb-6 flex shrink-0 items-center">
        {Icon ? (
          <Icon className="mr-3 h-5 w-5" style={{ color: "var(--text-muted)" }} />
        ) : (
          <span className="mr-3 h-2.5 w-2.5 rounded-full" style={{ background: "var(--text-muted)" }} />
        )}
        <span className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          {title}
        </span>
        <span
          className="ml-3 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: "var(--ds-surface-subtle)", color: "var(--text-sub)" }}
        >
          {count}
        </span>
      </div>
      <div className="flex-1 text-[15px] leading-relaxed" style={{ color: "var(--text-main)" }}>
        {children}
      </div>
    </div>
  );
}

function FinalDecisionList({ decisions }: { decisions: FinalSummaryDecision[] }) {
  return (
    <FinalSummarySection title="決定事項" count={decisions.length} badge="decision" icon={HiCheckCircle}>
      <ul className="flex flex-col gap-5">
        {decisions.map((decision, index) => (
          <li key={`${index}:${decision.text}`} className="flex items-start gap-4">
            <HiCheck className="mt-1 h-5 w-5 shrink-0" style={{ color: "var(--brand)" }} />
            <span className="font-medium leading-relaxed">{decision.text}</span>
          </li>
        ))}
      </ul>
    </FinalSummarySection>
  );
}

function FinalActionList({ actions }: { actions: FinalSummaryActionItem[] }) {
  return (
    <FinalSummarySection title="アクションアイテム" count={actions.length} badge="action" icon={HiClipboardDocumentCheck}>
      <ul className="flex flex-col gap-6">
        {actions.map((action, index) => (
          <li key={`${index}:${action.text}`} className="flex flex-col gap-3">
            <span className="font-medium leading-relaxed">{action.text}</span>
            
            {/* 改善点2: 担当者(owner)と期限(due)のデザインを分離し、担当者を強調 */}
            <div className="flex flex-wrap items-center gap-3">
              {action.owner && (
                <div 
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1" 
                  style={{ borderColor: "var(--brand)", color: "var(--brand)" }}
                >
                  <HiOutlineUser className="h-4 w-4" />
                  <span className="text-[13px] font-bold">{action.owner}</span>
                </div>
              )}
              {action.due && (
                <span className="rounded-full bg-(--ds-surface-subtle) px-3 py-1 text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
                  期限: {action.due}
                </span>
              )}
              <div
                className="ml-auto h-2 w-2 shrink-0 rounded-full"
                style={{ background: importanceDot[action.priority ?? "medium"] }}
                title={importanceLabel[action.priority ?? "medium"]}
              />
            </div>
          </li>
        ))}
      </ul>
    </FinalSummarySection>
  );
}

function FinalTextListSection({ title, items, icon }: { title: string; items: string[]; icon?: React.ElementType }) {
  return (
    <FinalSummarySection title={title} count={items.length} badge="decision" icon={icon}>
      <ul className="flex flex-col gap-4">
        {items.map((item, index) => (
          <li key={`${index}:${item}`} className="flex items-start gap-3 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
            {item}
          </li>
        ))}
      </ul>
    </FinalSummarySection>
  );
}