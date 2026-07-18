import {
  HiArrowPath,
  HiSparkles,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineLightBulb,
  HiOutlineQueueList,
  HiCheck,
  HiOutlineUser,
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
    /* 
      【親グリッド】
      左列（約40%）と右列（約60%）の黄金比率で分割。
      items-start を指定することで、中身の高さがズレても上のラインが綺麗に揃います。
    */
    <div className="grid gap-8 lg:grid-cols-[1.3fr_2fr] xl:grid-cols-[1.2fr_2fr] items-start w-full">
      
      {/* ────────────────────────────────────────────────────────
          【左列】: AI最終要約（左上）＆ 会議前コンテキスト（左下）
          ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-8">
        
        {/* AI最終要約ボックス（左上） */}
        <div
          className="ds-surface rounded-(--ds-radius-panel) p-8"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <div className="mb-6 flex items-center gap-3">
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
          
          {showSuggestedTitle && (
            <p className="mb-4 text-[13px] font-medium" style={{ color: "var(--text-sub)" }}>
              AI提案: {suggestedTitle}
            </p>
          )}
          
          {hasOverview && (
            <ul className="flex flex-col gap-4">
              {payload.overview?.split('\n').filter(Boolean).map((line, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: "var(--text-main)" }}>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" style={{ color: "var(--brand)" }} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 
          会議前コンテキスト（左下）
          親コンポーネントから props が渡らない場合でも確実に美しく表示されるよう、
          デフォルトのデザインシステムに沿ったマークアップをフォールバックとして配置。
        */}
        {contextPanel || (
          <section
            className="ds-surface shrink-0 rounded-(--ds-radius-panel) p-8"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <h2 className="mb-5 text-[16px] font-bold" style={{ color: "var(--text-main)" }}>
              会議前コンテキスト
            </h2>
            <dl className="grid gap-5 grid-cols-1">
              <div>
                <dt className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  目的・ゴール
                </dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--text-sub)" }}>
                  来期の価格改定方針を決める。値上げの対象顧客・値上げ率・適用開始時期を決定し、対象顧客リストの作成につなげる。
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  前提・背景
                </dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--text-sub)" }}>
                  昨年から原価が上昇しており、価格据え置きでは利益率が悪化している。中小顧客は解約リスクが高い点が懸念。
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  アジェンダ
                </dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--text-sub)" }}>
                  1. 値上げ対象顧客の範囲{"\n"}
                  2. 値上げ率{"\n"}
                  3. 適用タイミング
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>
                  AIへの補足指示
                </dt>
                <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed" style={{ color: "var(--text-sub)" }}>
                  財務影響は数値で示すこと
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────
          【右列】: その他の各種カード群 (決定事項 〜 次回トピック)
          1カラムから XL画面で綺麗な2カラムに分割される「本物のグリッド」構造
          ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
        {/* 1. 決定事項 */}
        {payload.decisions.length > 0 && (
          <FinalDecisionList decisions={payload.decisions} />
        )}
        
        {/* 2. アクションアイテム */}
        {payload.actionItems.length > 0 && (
          <FinalActionList actions={payload.actionItems} />
        )}

        {/* 3. 重要な論点 */}
        {payload.keyPoints.length > 0 && (
          <FinalTextListSection title="重要な論点" items={payload.keyPoints} icon={HiOutlineLightBulb} />
        )}

        {/* 4. 未解決事項 */}
        {payload.openIssues.length > 0 && (
          <FinalTextListSection title="未解決事項" items={payload.openIssues} icon={HiOutlineQuestionMarkCircle} />
        )}

        {/* 5. 次回トピック */}
        {payload.nextMeetingTopics.length > 0 && (
          <div className="xl:col-span-2"> {/* 最後は2列スパンさせて横に広げることも可能です */}
            <FinalTextListSection title="次回トピック" items={payload.nextMeetingTopics} icon={HiOutlineQueueList} />
          </div>
        )}
      </div>

    </div>
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
    <div className="ds-surface overflow-hidden rounded-(--ds-radius-panel) p-8" style={{ boxShadow: "var(--ds-shadow)" }}>
      <div className="mb-6 flex items-center">
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
      <div className="text-[15px] leading-relaxed" style={{ color: "var(--text-main)" }}>
        {children}
      </div>
    </div>
  );
}

function FinalDecisionList({ decisions }: { decisions: FinalSummaryDecision[] }) {
  return (
    <FinalSummarySection title="決定事項" count={decisions.length} icon={HiCheckCircle}>
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
    <FinalSummarySection title="アクションアイテム" count={actions.length} icon={HiClipboardDocumentCheck}>
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