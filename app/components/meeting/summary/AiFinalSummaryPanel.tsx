import {
  HiArrowPath,
  HiSparkles,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineLightBulb,
  HiOutlineQueueList,
  HiCheck,
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
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-6 py-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-sub)" }}>
          <HiArrowPath className="h-4 w-4 animate-spin" style={{ color: "var(--brand)" }} />
          AI最終要約を生成しています…
        </p>
      </section>
    );
  }

  if (final.status === "running") {
    return (
      <section
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-6 py-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-sub)" }}>
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
        className="ds-surface shrink-0 rounded-(--ds-radius-panel) px-6 py-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
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
    // 改善案5: 各要素間の余白（gap）を広げ、ネガティブスペースを確保
    <div className="flex shrink-0 flex-col gap-6">
      <section
        className="rounded-(--ds-radius-panel) border p-6"
        style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-(--ds-radius-control)"
            style={{ background: "var(--brand)" }}
          >
            <HiSparkles className="h-4 w-4 text-white" />
          </div>
          {/* 改善案1: タイトルの文字サイズを大きくし、階層を明確化 */}
          <h2 className="text-[16px] font-bold" style={{ color: "var(--text-main)" }}>
            重要な結果
          </h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <div
            className="rounded-(--ds-radius-panel) p-5"
            style={{
              background: "var(--ai-quest-bg)",
              border: "1px solid var(--ai-quest-border)",
            }}
          >
            <p className="mb-4 text-[14px] font-bold" style={{ color: "var(--ai-quest-fg)" }}>
              AI 最終要約
            </p>
            {showSuggestedTitle && (
              <p className="mb-3 text-[12px] font-medium" style={{ color: "var(--ai-quest-fg)", opacity: 0.85 }}>
                AI提案: {suggestedTitle}
              </p>
            )}
            {hasOverview && (
              // 改善案3: 長文テキストを箇条書き形式に変換し、可読性を向上
              <ul className="flex flex-col gap-2.5">
                {/* 修正点: payload.overview?.split とオプショナルチェーンを追加 */}
                {payload.overview?.split('\n').filter(Boolean).map((line, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--ai-quest-fg)" }}>
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>{contextPanel}</div>
        </div>
      </section>

      {/* 改善案6: Masonry風の2カラムレイアウトを適用して縦のスクロール量を削減 */}
      <div className="columns-1 gap-6 md:columns-2">
        {payload.decisions.length > 0 && (
          /* break-inside-avoid を指定することで、カラムの途中でパネルが分断されるのを防ぎます */
          <div className="mb-6 break-inside-avoid">
            <FinalDecisionList decisions={payload.decisions} />
          </div>
        )}
        {payload.actionItems.length > 0 && (
          <div className="mb-6 break-inside-avoid">
            <FinalActionList actions={payload.actionItems} />
          </div>
        )}
        {payload.openIssues.length > 0 && (
          <div className="mb-6 break-inside-avoid">
            <FinalTextListSection title="未解決事項" items={payload.openIssues} icon={HiOutlineQuestionMarkCircle} />
          </div>
        )}
        {payload.keyPoints.length > 0 && (
          <div className="mb-6 break-inside-avoid">
            <FinalTextListSection title="重要な論点" items={payload.keyPoints} icon={HiOutlineLightBulb} />
          </div>
        )}
        {payload.nextMeetingTopics.length > 0 && (
          <div className="mb-6 break-inside-avoid">
            <FinalTextListSection title="次回トピック" items={payload.nextMeetingTopics} icon={HiOutlineQueueList} />
          </div>
        )}
      </div>
    </div>
  );
}

function FinalDecisionList({ decisions }: { decisions: FinalSummaryDecision[] }) {
  return (
    <FinalSummarySection title="決定事項" count={decisions.length} badge="decision" icon={HiCheckCircle}>
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {decisions.map((decision, index) => (
          <div key={`${index}:${decision.text}`} className="flex items-start gap-4 px-6 py-4">
            {/* 改善案2: 決定事項にチェックアイコンを併記してタスク感を高める */}
            <div
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--badge-decision-bg)]"
              style={{ color: "var(--badge-decision-fg)" }}
            >
              <HiCheck className="h-3.5 w-3.5" />
            </div>
            <p
              className="min-w-0 flex-1 text-[14px] font-medium leading-relaxed"
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
    <FinalSummarySection title="アクションアイテム" count={actions.length} badge="action" icon={HiClipboardDocumentCheck}>
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {actions.map((action, index) => (
          <div key={`${index}:${action.text}`} className="flex items-center gap-4 px-6 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium" style={{ color: "var(--text-main)" }}>
                {action.text}
              </p>
              {(action.owner || action.due) && (
                <div className="mt-1.5 flex items-center gap-4">
                  {action.owner && (
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-sub)" }}>
                      担当: <span className="font-semibold">{action.owner}</span>
                    </span>
                  )}
                  {action.due && (
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-sub)" }}>
                      期限: <span className="font-semibold">{action.due}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div
              className="flex h-6 items-center rounded-full border px-2.5 text-[11px] font-bold"
              style={{
                color: importanceDot[action.priority ?? "medium"],
                borderColor: importanceDot[action.priority ?? "medium"],
                background: "transparent",
              }}
              title={`優先度: ${importanceLabel[action.priority ?? "medium"]}`}
            >
              {importanceLabel[action.priority ?? "medium"]}
            </div>
          </div>
        ))}
      </div>
    </FinalSummarySection>
  );
}

function FinalTextListSection({ title, items, icon }: { title: string; items: string[]; icon?: React.ElementType }) {
  return (
    <FinalSummarySection title={title} count={items.length} badge="decision" icon={icon}>
      <ul className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {items.map((item, index) => (
          <li
            key={`${index}:${item}`}
            className="flex items-start gap-3 px-6 py-4 text-[13px] leading-relaxed"
            style={{ color: "var(--text-sub)" }}
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
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
  icon: Icon,
}: {
  badge: "action" | "decision";
  children: React.ReactNode;
  count: number;
  title: string;
  icon?: React.ElementType;
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
        className="flex h-14 items-center border-b px-6"
        style={{ borderColor: "var(--ds-border)" }}
      >
        {/* アイコンの表示 */}
        {Icon ? (
          <Icon className="mr-3 h-5 w-5" style={{ color: "var(--brand)" }} />
        ) : (
          <span
            className="mr-3 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: "var(--brand)" }}
          />
        )}
        <span className="text-[15px] font-bold" style={{ color: "var(--text-main)" }}>
          {title}
        </span>
        <span
          className="ml-3 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
          style={badgeStyles}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}