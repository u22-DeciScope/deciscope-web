import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiCheck,
  HiCheckCircle,
  HiClipboardDocumentList,
  HiExclamationTriangle,
  HiLightBulb,
  HiQuestionMarkCircle,
  HiSparkles,
} from "react-icons/hi2";

import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { AnalysisItem, RuntimeSpeakerSummary } from "~/api/meetings/meetingRuntimeTypes";
import {
  analysisKindColor,
  analysisKindLabel,
  dimmedColor,
  resolvedBadgeColor,
} from "~/components/meeting/parts/analysisKindPalette";
import { buildActionSummaryProjection } from "~/components/meeting/parts/actionSummaryProjection";

type MeetingAssistantPanelProps = {
  insights: AnalysisItem[];
  speakerSummaries: RuntimeSpeakerSummary[];
  liveAnalysis?: MeetingAIAnalysis | null;
  focusedAnalysisItemId?: string | null;
  highlightedAnalysisItemId?: string | null;
  updateStatus?: React.ReactNode;
  // ライブタブを表示するか。会議終了後のレビュー(サマリー)画面ではライブ分析が
  // 無いため false にし、初期タブも「進行中」にする。
  showLiveTab?: boolean;
  // カードクリック時に、対応する議論ツリーのノードへフォーカスさせるための通知。
  onFocusTreeItem?: (itemId: string) => void;
};

const insightIcons = {
  issue: HiLightBulb,
  open_issue: HiQuestionMarkCircle,
  question: HiQuestionMarkCircle,
  risk: HiExclamationTriangle,
  decision: HiCheckCircle,
  todo: HiClipboardDocumentList,
};

export type InsightFilter = "live" | "active" | "question" | "decision" | "resolved" | "action";

const insightFilterTabs: Array<{ key: InsightFilter; label: string }> = [
  { key: "live", label: "ライブ" },
  { key: "active", label: "進行中" },
  { key: "question", label: "質問・未解決" },
  { key: "decision", label: "決定事項" },
  { key: "resolved", label: "解決済" },
  { key: "action", label: "対応事項" },
];

export function matchesInsightFilter(item: AnalysisItem, filter: InsightFilter) {
  switch (filter) {
    case "live":
      return false;
    case "active":
      return (
        !isResolvedDisplayItem(item) &&
        item.kind !== "decision" &&
        item.kind !== "question" &&
        item.kind !== "open_issue"
      );
    case "question":
      return !isResolvedItem(item) && (item.kind === "question" || item.kind === "open_issue");
    case "decision":
      return item.kind === "decision";
    case "resolved":
      return isResolvedDisplayItem(item);
    case "action":
      return false;
    default:
      return true;
  }
}

export function analysisItemElementId(itemId: string) {
  return `ai-analysis-item-${encodeURIComponent(itemId)}`;
}

export function filterForInsightItem(item: AnalysisItem): InsightFilter {
  if (item.kind === "decision") {
    return "decision";
  }
  if (isResolvedDisplayItem(item)) {
    return "resolved";
  }
  if (item.kind === "question" || item.kind === "open_issue") {
    return "question";
  }
  return "active";
}

export function isResolvedItem(item: AnalysisItem) {
  return item.status === "resolved";
}

export function isResolvedDisplayItem(item: AnalysisItem) {
  if (!isResolvedItem(item)) {
    return false;
  }
  return (
    item.kind === "question" ||
    item.kind === "open_issue" ||
    item.kind === "issue" ||
    item.kind === "risk" ||
    item.kind === "todo"
  );
}

export function isLiveDisplayItem(item: AnalysisItem) {
  return !isDismissedItem(item) && !isResolvedDisplayItem(item);
}

function isDismissedItem(item: AnalysisItem) {
  return item.status === "dismissed";
}

export function MeetingAssistantPanel({
  insights,
  speakerSummaries,
  liveAnalysis,
  focusedAnalysisItemId,
  highlightedAnalysisItemId,
  updateStatus,
  showLiveTab = true,
  onFocusTreeItem,
}: MeetingAssistantPanelProps) {
  const [filter, setFilter] = useState<InsightFilter>(showLiveTab ? "live" : "active");
  // 直近で自動タブ切替を実行済みのフォーカスIDを保持する。同じIDに対してタブ切替は
  // 1回だけ行い、ユーザーが手動でタブを変えても再度引き戻さないようにするための目印。
  const processedFocusIdRef = useRef<string | null>(null);
  const visibleInsights = useMemo(
    () => insights.filter((insight) => !isDismissedItem(insight)),
    [insights],
  );
  const livePayload = (liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  const liveItems = useMemo(
    () => (livePayload?.items ?? []).filter((item) => !isDismissedItem(item)),
    [livePayload],
  );
  const totalCount = visibleInsights.length + liveItems.length;
  const allItems = useMemo(() => {
    const byId = new Map<string, AnalysisItem>();
    for (const item of [...visibleInsights, ...liveItems]) {
      byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [liveItems, visibleInsights]);
  const actionSummaryRows = useMemo(
    () => buildActionSummaryProjection(livePayload?.tree?.nodes ?? [], allItems),
    [allItems, livePayload?.tree?.nodes],
  );
  const actionItemIds = useMemo(
    () => new Set(actionSummaryRows.map((row) => row.canonicalItemId)),
    [actionSummaryRows],
  );
  const liveItemIds = useMemo(() => new Set(liveItems.map((item) => item.id)), [liveItems]);
  const filteredLiveItems = useMemo(
    () =>
      filter === "action"
        ? liveItems.filter((item) => actionItemIds.has(item.id))
        : liveItems.filter((item) => matchesInsightFilter(item, filter)),
    [actionItemIds, filter, liveItems],
  );
  const filteredInsights = useMemo(
    () =>
      filter === "action"
        ? visibleInsights.filter(
            (insight) => actionItemIds.has(insight.id) && !liveItemIds.has(insight.id),
          )
        : visibleInsights.filter((insight) => matchesInsightFilter(insight, filter)),
    [actionItemIds, filter, liveItemIds, visibleInsights],
  );
  const filteredItemCount = filteredLiveItems.length + filteredInsights.length;
  const liveActiveItemCount = liveItems.filter(isLiveDisplayItem).length;
  const liveResolvedItemCount = liveItems.filter(isResolvedDisplayItem).length;
  const resolvedTabItemCount = [...liveItems, ...visibleInsights].filter(
    isResolvedDisplayItem,
  ).length;
  const visibleFilterTabs = useMemo(
    () => (showLiveTab ? insightFilterTabs : insightFilterTabs.filter((tab) => tab.key !== "live")),
    [showLiveTab],
  );
  const liveTabActive = showLiveTab && filter === "live";
  const actionTabActive = filter === "action";

  useEffect(() => {
    if (!focusedAnalysisItemId) {
      // フォーカスが解除されたら、次に同じIDが再フォーカスされたときに
      // タブ自動切替をもう一度行えるようにリセットする。
      processedFocusIdRef.current = null;
      return;
    }
    if (processedFocusIdRef.current === focusedAnalysisItemId) {
      // このフォーカスIDに対してはすでにタブ切替済み。以降のユーザーの手動タブ操作を妨げない。
      return;
    }
    const target = [...liveItems, ...visibleInsights].find(
      (item) => item.id === focusedAnalysisItemId,
    );
    if (!target) {
      return;
    }
    processedFocusIdRef.current = focusedAnalysisItemId;
    if (filter === "action" && actionItemIds.has(target.id)) {
      return;
    }
    if (!matchesInsightFilter(target, filter)) {
      setFilter(filterForInsightItem(target));
    }
  }, [actionItemIds, filter, focusedAnalysisItemId, liveItems, visibleInsights]);

  useEffect(() => {
    if (!focusedAnalysisItemId || typeof window === "undefined") {
      return;
    }
    const isVisible = [...filteredLiveItems, ...filteredInsights].some(
      (item) => item.id === focusedAnalysisItemId,
    );
    if (!isVisible) {
      return;
    }
    const timer = window.setTimeout(() => {
      document
        .getElementById(analysisItemElementId(focusedAnalysisItemId))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [filteredInsights, filteredLiveItems, focusedAnalysisItemId]);

  return (
    <div
      className="flex min-h-0 w-full flex-col overflow-hidden rounded-(--ds-radius-panel) border"
      style={{ background: "var(--ds-surface)", borderColor: "var(--ds-border)" }}
      data-live-active-items={liveActiveItemCount}
      data-live-resolved-items={liveResolvedItemCount}
      data-resolved-tab-items={resolvedTabItemCount}
      data-action-summary-tabs="1"
      data-rendered-action-items={actionSummaryRows.length}
      data-rendered-action-tree-nodes="0"
    >
      <header
        className="flex min-h-11 shrink-0 items-center border-b px-3 py-1"
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
        className="flex h-9 w-full shrink-0 items-center gap-0.5 overflow-x-auto border-b px-1.5"
        style={{ borderColor: "var(--node-border)" }}
      >
        {visibleFilterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="min-w-14 flex-1 shrink-0 whitespace-nowrap rounded-md px-1 py-1 text-center text-[10px]"
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
        {livePayload?.degraded && (
          <section
            role="status"
            className="rounded-(--ds-radius-control) border px-2.5 py-2 text-[10px]"
            style={{
              background: "color-mix(in srgb, var(--priority-medium) 10%, var(--ds-surface))",
              borderColor: "var(--priority-medium)",
              color: "var(--text-sub)",
            }}
          >
            分析ツリーの整合性が低下したため、直前の安全な構造を表示しています。
          </section>
        )}
        {liveTabActive &&
          (liveAnalysis ? (
            <LiveAnalysisOverview liveAnalysis={liveAnalysis} payload={livePayload} />
          ) : (
            <EmptyAssistantState
              title="ライブ分析を待っています"
              body="会議の発話が蓄積されると、現在の論点が短く表示されます。"
            />
          ))}
        {liveTabActive && speakerSummaries.length > 0 && (
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
        {!liveTabActive && !actionTabActive && totalCount === 0 && (
          <EmptyAssistantState
            title="まだAIメモはありません"
            body="分析イベントが届くと、リスクや質問がここへカード表示されます。"
          />
        )}
        {!liveTabActive && actionTabActive && filteredItemCount === 0 && (
          <EmptyAssistantState
            title="未完了の対応事項はありません"
            body="進行中のTODO、または対応TODOがない未解決事項がここに表示されます。"
          />
        )}
        {!liveTabActive && !actionTabActive && totalCount > 0 && filteredItemCount === 0 && (
          <EmptyAssistantState
            title="このタブに表示するカードはありません"
            body="別のタブに切り替えると、他の状態のカードを確認できます。"
          />
        )}
        {!liveTabActive &&
          filteredLiveItems.map((item) => (
            <LiveAnalysisItemCard
              key={item.id}
              item={item}
              highlighted={highlightedAnalysisItemId === item.id}
              onFocusTreeItem={onFocusTreeItem}
            />
          ))}
        {!liveTabActive &&
          filteredInsights.map((insight) => (
            <LiveAnalysisItemCard
              key={insight.id}
              item={insight}
              highlighted={highlightedAnalysisItemId === insight.id}
              onFocusTreeItem={onFocusTreeItem}
            />
          ))}
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

// resolved(解決済)時だけ緑系の塗り背景+チェックマークの強調バッジを表示する。
// open/updated は表示しない(「進行中」は表示中のタブから自明で、情報価値が無いため)。
// カードヘッダーの種別ラベルの右隣に置く。ノード/カードの共通コンポーネントである
// ResolvedBadge(discussionTree/NodeDetailCard.tsx, DiscussionNodeView.tsx)と同じ配色
// (resolvedBadgeColor)を使い、ツリー側との見た目の一貫性を保つ。
function AnalysisStatusBadge({ item }: { item: AnalysisItem }) {
  if (!isResolvedDisplayItem(item)) {
    return null;
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      style={{ background: resolvedBadgeColor.bg, color: resolvedBadgeColor.fg }}
    >
      <HiCheck className="h-3 w-3" />
      {item.kind === "todo" ? "完了済" : "解決済"}
    </span>
  );
}

function insightStyle(kind: string) {
  const { bg, fg, border } = analysisKindColor(kind);
  return { background: bg, border, color: fg };
}

function analysisItemHighlightStyle(highlighted: boolean): React.CSSProperties {
  if (!highlighted) {
    return {};
  }
  return {
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--brand) 28%, transparent)",
    outline: "2px solid var(--brand)",
    outlineOffset: "2px",
  };
}

export function LiveAnalysisItemCard({
  item,
  highlighted,
  onFocusTreeItem,
}: {
  item: AnalysisItem;
  highlighted: boolean;
  onFocusTreeItem?: (itemId: string) => void;
}) {
  const Icon = insightIcons[item.kind as keyof typeof insightIcons] ?? HiLightBulb;
  const style = insightStyle(item.kind);
  const resolved = isResolvedDisplayItem(item);
  const clickable = Boolean(onFocusTreeItem);
  return (
    <article
      id={analysisItemElementId(item.id)}
      data-ai-item-id={item.id}
      className={[
        "rounded-(--ds-radius-control) border p-3 transition-[box-shadow,outline-color]",
        clickable ? "cursor-pointer" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: resolved ? dimmedColor(style.background, 45) : style.background,
        borderColor: resolved ? dimmedColor(style.border, 45) : style.border,
        borderStyle: resolved ? "dashed" : undefined,
        ...analysisItemHighlightStyle(highlighted),
      }}
      title={clickable ? "議論ツリーで該当ノードを表示" : undefined}
      onClick={clickable ? () => onFocusTreeItem?.(item.id) : undefined}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center">
          {/* 種別ラベル(論点/決定事項など)は文字数が異なるため、固定幅の枠を
              確保して、右隣の解決済バッジの位置がカード間で揃うようにする。 */}
          <div
            className="flex w-16 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-bold"
            style={{ color: style.color }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {analysisKindLabel(item.kind)}
          </div>
          <AnalysisStatusBadge item={item} />
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

// ライブタブの概要表示。「現在のトピック」「要点」「検出された論点」を項目ごとの
// カードに分けて表示する。ライブ更新の間隔(数秒〜十数秒おき)で summary/items が
// 出たり消えたりしても高さが跳ねないよう、表示件数の上限(bullets/items 各4件)と
// 「まだ何もない」時のプレースホルダ表示で高さの急変・レイアウトシフトを抑えている。
function LiveAnalysisOverview({
  liveAnalysis,
  payload,
}: {
  liveAnalysis: MeetingAIAnalysis;
  payload: LiveAnalysisPayload | null;
}) {
  const bullets = liveAnalysisBullets(payload);
  const liveTopicItems = useMemo(
    () => (payload?.items ?? []).filter(isLiveDisplayItem).slice(0, 4),
    [payload],
  );
  const hasBody = bullets.length > 0 || liveTopicItems.length > 0;

  return (
    <>
      <section
        className="rounded-(--ds-radius-control) border p-3"
        style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white"
              style={{ background: "var(--brand)" }}
            >
              <HiSparkles className="h-3 w-3" />
            </span>
            <h2
              className="shrink-0 whitespace-nowrap text-[11px] font-bold"
              style={{ color: "var(--text-main)" }}
            >
              ライブ分析
            </h2>
          </div>
          <div className="min-w-0 shrink">
            <LiveAnalysisStatus liveAnalysis={liveAnalysis} />
          </div>
        </div>

        {payload?.currentTopic && (
          <div className="mt-2 min-w-0">
            <span
              className="inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--brand-light)", color: "var(--brand)" }}
              title={payload.currentTopic}
            >
              {payload.currentTopic}
            </span>
          </div>
        )}

        {!hasBody && (
          <p className="mt-2 min-h-10 text-[11px] leading-5" style={{ color: "var(--text-muted)" }}>
            発話が蓄積されると要点がここに表示されます。
          </p>
        )}
      </section>

      {bullets.length > 0 && (
        <LiveAnalysisSectionCard title="要点">
          <ul className="space-y-1.5">
            {bullets.map((bullet, index) => (
              <li
                key={`${bullet}-${index}`}
                className="flex gap-1.5 text-[11px] leading-5"
                style={{ color: "var(--text-sub)" }}
              >
                <span
                  className="mt-2 h-1 w-1 shrink-0 rounded-full"
                  style={{ background: "var(--brand)" }}
                />
                <span className="line-clamp-2 min-w-0">{bullet}</span>
              </li>
            ))}
          </ul>
        </LiveAnalysisSectionCard>
      )}

      {liveTopicItems.length > 0 && (
        <LiveAnalysisSectionCard title="検出された論点">
          <ul className="space-y-1.5">
            {liveTopicItems.map((item) => {
              const Icon = insightIcons[item.kind as keyof typeof insightIcons] ?? HiLightBulb;
              const style = insightStyle(item.kind);
              return (
                <li key={item.id} className="flex items-center gap-1.5 text-[11px] leading-5">
                  <Icon className="h-3 w-3 shrink-0" style={{ color: style.color }} />
                  <span
                    className="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-semibold leading-none"
                    style={{ background: style.background, color: style.color }}
                  >
                    {analysisKindLabel(item.kind)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ color: "var(--text-main)" }}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </LiveAnalysisSectionCard>
      )}
    </>
  );
}

function liveAnalysisBullets(payload: LiveAnalysisPayload | null) {
  const summary = payload?.summary?.replace(/\s+/g, " ").trim();
  if (!summary) {
    return [];
  }
  const parts = summary
    .split(/[。.!！?？]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts.length > 0 ? parts : [summary]).slice(0, 4).map((part) => truncateLiveBullet(part));
}

function truncateLiveBullet(value: string) {
  const maxLength = 72;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function EmptyAssistantState({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-(--ds-radius-control) border px-3 py-4 text-[12px]"
      style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
    >
      <p className="font-semibold" style={{ color: "var(--text-main)" }}>
        {title}
      </p>
      <p className="mt-1 leading-5" style={{ color: "var(--text-muted)" }}>
        {body}
      </p>
    </div>
  );
}

function LiveAnalysisSectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-(--ds-radius-control) border p-3"
      style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
    >
      <p
        className="mb-1.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </p>
      {children}
    </section>
  );
}

function LiveAnalysisStatus({ liveAnalysis }: { liveAnalysis: MeetingAIAnalysis }) {
  if (liveAnalysis.status === "running") {
    return (
      <span
        className="flex min-w-0 items-center justify-end gap-1 text-[10px] font-semibold"
        style={{ color: "var(--ai-quest-fg)" }}
      >
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" />
        <span className="min-w-0 truncate">分析中…</span>
      </span>
    );
  }

  if (liveAnalysis.status === "failed") {
    return (
      <span
        className="block min-w-0 truncate text-right text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        分析を一時的に利用できません
      </span>
    );
  }

  const updatedLabel = formatUpdatedAtTime(liveAnalysis.updatedAtUtc);
  return (
    <span
      className="block min-w-0 truncate text-right text-[10px]"
      style={{ color: "var(--text-muted)" }}
    >
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
