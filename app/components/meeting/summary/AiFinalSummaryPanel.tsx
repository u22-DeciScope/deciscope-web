import { useState } from "react";
import {
  HiArrowPath,
  HiChevronDown,
  HiSparkles,
  HiClipboardDocumentCheck,
  HiOutlineQueueList,
  HiOutlineUser,
} from "react-icons/hi2";

import type {
  FinalSummaryActionItem,
  FinalSummaryPayload,
  MeetingAIAnalysis,
  MeetingAIAnalysisImportance,
} from "~/api/aiAnalysis/aiAnalysisApi";
import {
  finalizationStageLabel,
  type FinalSummaryViewState,
} from "~/components/meeting/summary/finalSummaryState";

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
  state: FinalSummaryViewState;
  contextPanel?: React.ReactNode;
  /** 再生成の実行。retryable な失敗/不完全終了のときだけ渡す。 */
  onRetry?: () => void;
  retryInProgress?: boolean;
  retryError?: string | null;
};

export function AiFinalSummaryPanel({
  state,
  contextPanel,
  onRetry,
  retryInProgress,
  retryError,
}: AiFinalSummaryPanelProps) {
  // 会議前コンテキストは入力量によって縦に長く伸びるため、既定では閉じておく。
  // フックは早期returnより手前で呼ぶ必要があるのでここに置く。
  const [contextOpen, setContextOpen] = useState(false);

  if (state.kind === "hidden") {
    return null;
  }

  if (state.kind === "generating") {
    const stage = finalizationStageLabel(state.stage);
    return (
      <FinalSummaryNoticePanel>
        <p className="flex items-center gap-2 text-[14px]" style={{ color: "var(--text-sub)" }}>
          <HiArrowPath className="h-4 w-4 animate-spin" style={{ color: "var(--brand)" }} />
          AI最終要約を生成しています…
        </p>
        {stage && (
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {stage}
          </p>
        )}
      </FinalSummaryNoticePanel>
    );
  }

  if (state.kind === "failed" || state.kind === "incomplete") {
    const heading =
      state.kind === "failed"
        ? "AI最終要約の生成に失敗しました。"
        : "会議の最終処理が完了しませんでした。";
    return (
      <FinalSummaryNoticePanel>
        <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
          {heading}
        </p>
        {state.retryable && onRetry && (
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className="flex w-fit items-center gap-2 rounded-(--ds-radius-control) border px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
              style={{ borderColor: "var(--brand)", color: "var(--brand)" }}
              onClick={onRetry}
              disabled={retryInProgress}
            >
              {retryInProgress && <HiArrowPath className="h-4 w-4 animate-spin" />}
              {retryInProgress ? "再生成しています…" : "最終要約を再生成"}
            </button>
            {retryError && (
              <p className="text-[12px]" style={{ color: "var(--danger)" }}>
                {retryError}
              </p>
            )}
          </div>
        )}
      </FinalSummaryNoticePanel>
    );
  }

  const payload = state.final.payload as FinalSummaryPayload | null;
  if (!payload) {
    return null;
  }

  // payload には suggestedTitle / decisions / openIssues / keyPoints も入っているが、
  // タイトルへ反映する導線が無い・下段のAIアシスタント列と重複する、という理由で
  // この画面では表示しない(生成側は従来どおり)。
  const hasOverview = Boolean(payload.overview);
  const hasActionItems = payload.actionItems.length > 0;
  const hasNextMeetingTopics = payload.nextMeetingTopics.length > 0;
  // 2枚そろったときだけ横並びにする。1枚しか無いときに半分幅のカードと
  // 空きカラムが残らないようにするための分岐。
  const bottomCardCount = (hasActionItems ? 1 : 0) + (hasNextMeetingTopics ? 1 : 0);

  return (
    <div className="flex w-full flex-col gap-8">
      {/* ────────────────────────────────────────────────────────
          【1段目】AI最終要約（全幅）。会議前コンテキストは既定で閉じた
          折りたたみとして、この要約カードの中に収める。
          ──────────────────────────────────────────────────────── */}
      <section
        className="ds-surface rounded-(--ds-radius-panel) border p-8"
        style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--ds-radius-control)"
              style={{ background: "var(--brand)" }}
            >
              <HiSparkles className="h-5 w-5 text-white" />
            </div>
            <h2 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>
              AI最終要約
            </h2>
          </div>
          {contextPanel && (
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-(--ds-radius-control) border px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "var(--ds-surface-muted)",
                borderColor: "var(--ds-border)",
                color: "var(--text-sub)",
              }}
              aria-expanded={contextOpen}
              onClick={() => setContextOpen((open) => !open)}
            >
              会議前コンテキスト
              <HiChevronDown
                className={`h-3.5 w-3.5 transition-transform ${contextOpen ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {hasOverview && (
          <ul className="flex flex-col gap-4">
            {payload.overview
              ?.split("\n")
              .filter(Boolean)
              .map((line, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-[14px] leading-relaxed"
                  style={{ color: "var(--text-main)" }}
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60"
                    style={{ color: "var(--brand)" }}
                  />
                  <span>{line}</span>
                </li>
              ))}
          </ul>
        )}

        {/* 展開時も要約カードが極端に伸びないよう、高さ上限を付けて中でスクロールさせる。 */}
        {contextPanel && contextOpen && (
          <div
            className="mt-6 max-h-80 overflow-y-auto border-t pt-6"
            style={{ borderColor: "var(--ds-border)" }}
          >
            {contextPanel}
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────
          【2段目】下段のAIアシスタント列では確認できない項目だけを横並びで置く。
          決定事項・重要な論点・未解決事項は、AIアシスタントの
          「決定事項」「論点」タブと重複するためここでは表示しない。
          ──────────────────────────────────────────────────────── */}
      {bottomCardCount > 0 && (
        <div
          className={`grid gap-8 ${
            bottomCardCount > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {/* 1. アクションアイテム: 担当者・期限を持つのはこの最終要約だけ。 */}
          {hasActionItems && <FinalActionList actions={payload.actionItems} />}

          {/* 2. 次回トピック: 下段に対応するタブが無い。 */}
          {hasNextMeetingTopics && (
            <FinalTextListSection
              title="次回トピック"
              items={payload.nextMeetingTopics}
              icon={HiOutlineQueueList}
            />
          )}
        </div>
      )}
    </div>
  );
}

// 生成中/失敗/不完全終了はいずれも1枚の告知カードで表す。
function FinalSummaryNoticePanel({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="ds-surface shrink-0 rounded-(--ds-radius-panel) border px-8 py-7"
      style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
    >
      {children}
    </section>
  );
}

function FinalSummarySection({
  children,
  count,
  title,
  icon: Icon,
}: {
  children: React.ReactNode;
  count: number;
  title: string;
  icon?: React.ElementType;
}) {
  return (
    // 横並びにしたとき2枚のカードの高さが揃うよう、グリッドの行いっぱいに広げる。
    <div
      className="ds-surface flex h-full flex-col overflow-hidden rounded-(--ds-radius-panel) border p-8"
      style={{ borderColor: "var(--ds-border)", boxShadow: "var(--ds-shadow)" }}
    >
      <div className="mb-6 flex shrink-0 items-center">
        {Icon ? (
          <Icon className="mr-3 h-5 w-5" style={{ color: "var(--text-muted)" }} />
        ) : (
          <span
            className="mr-3 h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--text-muted)" }}
          />
        )}
        <span
          className="text-[13px] font-semibold tracking-wide uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          {title}
        </span>
        <span
          className="ml-3 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ background: "var(--ds-surface-subtle)", color: "var(--text-sub)" }}
        >
          {count}
        </span>
      </div>
      <div className="text-[15px] leading-relaxed" style={{ color: "var(--text-main)" }}>
        {children}
      </div>
    </div>
  );
}

function FinalActionList({ actions }: { actions: FinalSummaryActionItem[] }) {
  return (
    <FinalSummarySection
      title="アクションアイテム"
      count={actions.length}
      icon={HiClipboardDocumentCheck}
    >
      <ul className="flex flex-col gap-6">
        {actions.map((action, index) => (
          <li key={`${index}:${action.text}`} className="flex flex-col gap-3">
            <span className="font-medium leading-relaxed">{action.text}</span>
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
                <span
                  className="rounded-full bg-(--ds-surface-subtle) px-3 py-1 text-[12px] font-semibold"
                  style={{ color: "var(--text-sub)" }}
                >
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

function FinalTextListSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon?: React.ElementType;
}) {
  return (
    <FinalSummarySection title={title} count={items.length} icon={icon}>
      <ul className="flex flex-col gap-4">
        {items.map((item, index) => (
          <li key={`${index}:${item}`} className="flex items-start gap-3 leading-relaxed">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </FinalSummarySection>
  );
}
