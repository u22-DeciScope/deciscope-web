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

import type {
  AgendaProgressPayload,
  LiveAnalysisPayload,
  MeetingAIAnalysis,
} from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type {
  AnalysisItem,
  RuntimeSpeakerSummary,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { AgendaProgressSection } from "~/components/meeting/parts/AgendaProgressSection";
import {
  analysisKindColor,
  analysisKindLabel,
  dimmedColor,
  issueSubtypeLabel,
  resolvedBadgeColor,
} from "~/components/meeting/parts/analysisKindPalette";
import { AssistantCardTitle } from "~/components/meeting/parts/AssistantCardTitle";
import {
  analysisItemMomentLabel,
  buildAgendaLabelMap,
  buildMeetingMomentIndex,
  humanizeAgendaReferences,
  type MeetingMomentIndex,
} from "~/components/meeting/parts/meetingDisplayMetadata";
import type {
  LiveAnalysisMeta,
  TranscriptSessionConnectionStatus,
} from "~/hooks/useMeetingTranscriptSession";

type MeetingAssistantPanelProps = {
  insights: AnalysisItem[];
  speakerSummaries: RuntimeSpeakerSummary[];
  segments?: MeetingSegmentDto[];
  treeNodes?: TreeNodePayload[];
  liveAnalysis?: MeetingAIAnalysis | null;
  focusedAnalysisItemId?: string | null;
  highlightedAnalysisItemId?: string | null;
  updateStatus?: React.ReactNode;
  // ライブタブを表示するか。会議終了後のレビュー(サマリー)画面ではライブ分析が
  // 無いため false にし、初期タブは属性タブ先頭の「リスク」にする。
  showLiveTab?: boolean;
  // カードクリック時に、対応する議論ツリーのノードへフォーカスさせるための通知。
  onFocusTreeItem?: (itemId: string) => void;
  // アジェンダ進捗セクション(ライブタブ最上部)向けの状態。いずれもoptionalで、
  // 未指定でも既存のライブタブ表示は変わらない。
  liveAnalysisMeta?: LiveAnalysisMeta | null;
  connectionStatus?: TranscriptSessionConnectionStatus | null;
  canManage?: boolean;
  workspaceId?: string;
  sessionId?: string;
};

const insightIcons = {
  issue: HiLightBulb,
  open_issue: HiQuestionMarkCircle,
  question: HiQuestionMarkCircle,
  risk: HiExclamationTriangle,
  decision: HiCheckCircle,
  todo: HiClipboardDocumentList,
};

const EMPTY_MEETING_SEGMENTS: MeetingSegmentDto[] = [];
const EMPTY_TREE_NODES: TreeNodePayload[] = [];

export type InsightFilter = "live" | "risk" | "unresolved" | "todo" | "decision" | "resolved";

function isIssueKind(kind: string) {
  return ["issue", "open_issue", "question", "confirmation", "investigation"].includes(kind);
}

const insightFilterTabs: Array<{ key: InsightFilter; label: string }> = [
  { key: "live", label: "ライブ" },
  { key: "risk", label: "リスク" },
  { key: "unresolved", label: "論点" },
  { key: "todo", label: "TODO" },
  { key: "decision", label: "決定事項" },
  { key: "resolved", label: "解決済" },
];

export function matchesInsightFilter(item: AnalysisItem, filter: InsightFilter) {
  switch (filter) {
    case "live":
      return false;
    case "risk":
      return item.kind === "risk" && !isResolvedDisplayItem(item);
    case "unresolved":
      return !isResolvedDisplayItem(item) && isIssueKind(item.kind);
    case "todo":
      return item.kind === "todo" && !isResolvedDisplayItem(item);
    case "decision":
      return item.kind === "decision";
    case "resolved":
      return isResolvedDisplayItem(item);
    default:
      return true;
  }
}

export function analysisItemElementId(itemId: string) {
  return `ai-analysis-item-${encodeURIComponent(itemId)}`;
}

export function filterForInsightItem(item: AnalysisItem): InsightFilter {
  if (isResolvedDisplayItem(item)) {
    return "resolved";
  }
  if (item.kind === "decision") {
    return "decision";
  }
  if (item.kind === "risk") {
    return "risk";
  }
  if (isIssueKind(item.kind)) {
    return "unresolved";
  }
  return item.kind === "todo" ? "todo" : "live";
}

export function isResolvedItem(item: AnalysisItem) {
  return item.status === "resolved" || item.status === "completed" || item.status === "done";
}

export function isResolvedDisplayItem(item: AnalysisItem) {
  if (!isResolvedItem(item)) {
    return false;
  }
  return isIssueKind(item.kind) || item.kind === "risk" || item.kind === "todo";
}

export function isLiveDisplayItem(item: AnalysisItem) {
  return !isDismissedItem(item) && !isResolvedDisplayItem(item);
}

function isDismissedItem(item: AnalysisItem) {
  return item.status === "dismissed" || item.inactive === true;
}

export function MeetingAssistantPanel({
  insights,
  speakerSummaries,
  segments = EMPTY_MEETING_SEGMENTS,
  treeNodes = EMPTY_TREE_NODES,
  liveAnalysis,
  focusedAnalysisItemId,
  highlightedAnalysisItemId,
  updateStatus,
  showLiveTab = true,
  onFocusTreeItem,
  liveAnalysisMeta,
  connectionStatus,
  canManage = false,
  workspaceId = "",
  sessionId = "",
}: MeetingAssistantPanelProps) {
  const [filter, setFilter] = useState<InsightFilter>(showLiveTab ? "live" : "risk");
  // アジェンダ進捗の手動override直後のoptimistic確定値。次にlivePayload側の
  // agendaProgressが更新される(=サーバーが再ブロードキャストしたstamp済み値が
  // 届く)までこちらを優先表示し、更新が来たら破棄して最新サーバー値に委ねる。
  const [agendaProgressOverlay, setAgendaProgressOverlay] = useState<AgendaProgressPayload | null>(
    null,
  );
  // 直近で自動タブ切替を実行済みのフォーカスIDを保持する。同じIDに対してタブ切替は
  // 1回だけ行い、ユーザーが手動でタブを変えても再度引き戻さないようにするための目印。
  const processedFocusIdRef = useRef<string | null>(null);
  const visibleInsights = useMemo(
    () => insights.filter((insight) => !isDismissedItem(insight)),
    [insights],
  );
  const livePayload = (liveAnalysis?.payload as LiveAnalysisPayload | null) ?? null;
  const momentIndex = useMemo(() => buildMeetingMomentIndex(segments), [segments]);
  const agendaLabels = useMemo(
    () =>
      buildAgendaLabelMap(
        [...treeNodes, ...(livePayload?.tree?.nodes ?? [])],
        livePayload?.agendaAnchors,
      ),
    [livePayload, treeNodes],
  );
  const liveUpdateHistory = useLiveCardUpdateHistory(liveAnalysis, livePayload, agendaLabels);
  const liveItems = useMemo(
    () => (livePayload?.items ?? []).filter((item) => !isDismissedItem(item)),
    [livePayload],
  );
  const totalCount = visibleInsights.length + liveItems.length;
  const liveItemIds = useMemo(() => new Set(liveItems.map((item) => item.id)), [liveItems]);
  const filteredLiveItems = useMemo(
    () => liveItems.filter((item) => matchesInsightFilter(item, filter)),
    [filter, liveItems],
  );
  const filteredInsights = useMemo(
    () =>
      visibleInsights.filter(
        (insight) => !liveItemIds.has(insight.id) && matchesInsightFilter(insight, filter),
      ),
    [filter, liveItemIds, visibleInsights],
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
  const effectiveAgendaProgress = agendaProgressOverlay ?? livePayload?.agendaProgress ?? null;

  useEffect(() => {
    // 新しいagendaProgressがサーバー(WS/REST)から届いたらoverlayをクリアし、
    // 最新のサーバー確定値を使う(サーバーがstamp済みのため上書き競合しない)。
    setAgendaProgressOverlay(null);
  }, [sessionId, liveAnalysis?.version]);

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
    if (!matchesInsightFilter(target, filter)) {
      setFilter(filterForInsightItem(target));
    }
  }, [filter, focusedAnalysisItemId, liveItems, visibleInsights]);

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
        className="grid h-9 w-full shrink-0 items-center gap-0.5 border-b px-1.5"
        style={{
          borderColor: "var(--node-border)",
          gridTemplateColumns: `repeat(${visibleFilterTabs.length}, minmax(0, 1fr))`,
        }}
      >
        {visibleFilterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="min-w-0 whitespace-nowrap rounded-md px-1 py-1 text-center text-[10px]"
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
        {liveTabActive && (
          <AgendaProgressSection
            progress={effectiveAgendaProgress}
            meta={liveAnalysisMeta}
            connectionStatus={connectionStatus}
            canManage={canManage}
            workspaceId={workspaceId}
            sessionId={sessionId}
            treeNodes={treeNodes}
            onFocusTreeItem={onFocusTreeItem}
            onProgressPatched={setAgendaProgressOverlay}
          />
        )}
        {liveTabActive &&
          (liveAnalysis ? (
            <LiveAnalysisOverview
              liveAnalysis={liveAnalysis}
              payload={livePayload}
              updateHistory={liveUpdateHistory}
              agendaLabels={agendaLabels}
              momentIndex={momentIndex}
            />
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
                    {humanizeAgendaReferences(
                      [...summary.claims, ...summary.questions, ...summary.todos].join(" / ") ||
                        "要約はまだありません。",
                      agendaLabels,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {!liveTabActive && totalCount === 0 && (
          <EmptyAssistantState
            title="まだAIメモはありません"
            body="分析イベントが届くと、リスクや質問がここへカード表示されます。"
          />
        )}
        {!liveTabActive && totalCount > 0 && filteredItemCount === 0 && (
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
              momentLabel={analysisItemMomentLabel(item, momentIndex)}
              agendaLabels={agendaLabels}
              highlighted={highlightedAnalysisItemId === item.id}
              onFocusTreeItem={onFocusTreeItem}
            />
          ))}
        {!liveTabActive &&
          filteredInsights.map((insight) => (
            <LiveAnalysisItemCard
              key={insight.id}
              item={insight}
              momentLabel={analysisItemMomentLabel(insight, momentIndex)}
              agendaLabels={agendaLabels}
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
  momentLabel,
  agendaLabels,
  highlighted,
  onFocusTreeItem,
}: {
  item: AnalysisItem;
  momentLabel: string;
  agendaLabels: Map<string, string>;
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
          {item.kind === "issue" && item.subtype && item.subtype !== "discussion" && (
            <span
              className="ml-1 inline-flex shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: "var(--ds-surface)", color: style.color }}
            >
              {issueSubtypeLabel(item.subtype)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {momentLabel && (
            <time className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
              {momentLabel}
            </time>
          )}
          {item.kind !== "decision" && !resolved && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "var(--reaction-bg)", color: severityColor(item.severity) }}
            >
              {item.severity}
            </span>
          )}
        </div>
      </div>
      <AssistantCardTitle title={humanizeAgendaReferences(item.title, agendaLabels)} />
      {item.body && item.body !== item.title && (
        <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--text-sub)" }}>
          {humanizeAgendaReferences(item.body, agendaLabels)}
        </p>
      )}
    </article>
  );
}

export type LiveCardChange = {
  itemId: string;
  action: "added" | "updated" | "removed";
  title: string;
  item: AnalysisItem;
  fields: Array<{ label: string; before: string; after: string }>;
};

type LiveUpdateBatch = {
  key: string;
  updatedAtUtc?: string;
  changes: LiveCardChange[];
};

export function deriveLiveCardChanges(
  previousItems: AnalysisItem[],
  currentItems: AnalysisItem[],
  agendaLabels: Map<string, string>,
  payload?: LiveAnalysisPayload | null,
): LiveCardChange[] {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const changes: LiveCardChange[] = [];

  for (const item of currentItems) {
    const previous = previousById.get(item.id);
    const title = humanizeAgendaReferences(item.title || item.id, agendaLabels);
    if (!previous) {
      changes.push({ itemId: item.id, action: "added", title, item, fields: [] });
      continue;
    }
    const fields = changedCardFields(previous, item, agendaLabels);
    if (fields.length > 0) {
      changes.push({ itemId: item.id, action: "updated", title, item, fields });
    }
  }

  for (const item of previousItems) {
    if (!currentById.has(item.id)) {
      changes.push({
        itemId: item.id,
        action: "removed",
        title: humanizeAgendaReferences(item.title || item.id, agendaLabels),
        item,
        fields: [],
      });
    }
  }

  addTreeRelatedCardChanges(changes, currentItems, payload, agendaLabels);
  return changes;
}

function useLiveCardUpdateHistory(
  liveAnalysis: MeetingAIAnalysis | null | undefined,
  payload: LiveAnalysisPayload | null,
  agendaLabels: Map<string, string>,
) {
  const [history, setHistory] = useState<LiveUpdateBatch[]>([]);
  const previousRef = useRef<{
    sessionKey: string;
    version: number;
    items: AnalysisItem[];
  } | null>(null);
  const processedSignatureRef = useRef("");

  useEffect(() => {
    if (!liveAnalysis) {
      if (previousRef.current) {
        previousRef.current = null;
        processedSignatureRef.current = "";
        setHistory([]);
      }
      return;
    }
    if (liveAnalysis.status !== "completed") {
      return;
    }
    const items = payload?.items ?? [];
    const sessionKey = liveAnalysis.sessionId ?? "current-meeting";
    const signature = JSON.stringify({
      sessionKey,
      version: liveAnalysis.version,
      items: items.map(cardChangeSignature),
      treeChanges: payload?.treeChanges ?? null,
    });
    if (processedSignatureRef.current === signature) {
      return;
    }
    processedSignatureRef.current = signature;
    const previous = previousRef.current;
    const continuesPreviousSession =
      previous?.sessionKey === sessionKey && liveAnalysis.version > previous.version;
    const previousItems = continuesPreviousSession ? previous.items : [];
    const changes = deriveLiveCardChanges(previousItems, items, agendaLabels, payload);
    const batch: LiveUpdateBatch = {
      key: `${sessionKey}:${liveAnalysis.version}:${signature.length}:${Date.now()}`,
      updatedAtUtc: liveAnalysis.updatedAtUtc,
      changes,
    };
    setHistory((current) => (continuesPreviousSession ? [batch, ...current].slice(0, 8) : [batch]));
    previousRef.current = {
      sessionKey,
      version: liveAnalysis.version,
      items: items.map((item) => ({ ...item })),
    };
  }, [agendaLabels, liveAnalysis, payload]);

  return history;
}

function cardChangeSignature(item: AnalysisItem) {
  return {
    id: item.id,
    kind: item.kind,
    subtype: item.subtype,
    severity: item.severity,
    title: item.title,
    body: item.body,
    status: item.status,
    informationStatus: item.informationStatus,
    relatedAgendaIds: item.relatedAgendaIds,
  };
}

function changedCardFields(
  previous: AnalysisItem,
  current: AnalysisItem,
  agendaLabels: Map<string, string>,
) {
  const values: Array<[string, string, string]> = [
    ["種別", displayItemKind(previous), displayItemKind(current)],
    [
      "タイトル",
      displayChangeText(previous.title, agendaLabels),
      displayChangeText(current.title, agendaLabels),
    ],
    [
      "内容",
      displayChangeText(previous.body, agendaLabels),
      displayChangeText(current.body, agendaLabels),
    ],
    ["状態", displayItemStatus(previous.status), displayItemStatus(current.status)],
    ["重要度", displaySeverity(previous.severity), displaySeverity(current.severity)],
    [
      "関連議題",
      displayRelatedAgendas(previous, agendaLabels),
      displayRelatedAgendas(current, agendaLabels),
    ],
  ];
  return values
    .filter(([, before, after]) => before !== after)
    .map(([label, before, after]) => ({ label, before, after }));
}

function addTreeRelatedCardChanges(
  changes: LiveCardChange[],
  currentItems: AnalysisItem[],
  payload: LiveAnalysisPayload | null | undefined,
  agendaLabels: Map<string, string>,
) {
  const treeChanges = payload?.treeChanges;
  if (!treeChanges || !payload?.tree?.nodes) {
    return;
  }
  const alreadyChanged = new Set(changes.map((change) => change.itemId));
  const updatedNodeIds = new Set([
    ...(treeChanges.updatedNodeIds ?? []),
    ...(treeChanges.reparentedNodeIds ?? []),
    ...(treeChanges.resolvedNodeIds ?? []),
    ...(treeChanges.promotedNodeIds ?? []),
  ]);
  if (updatedNodeIds.size === 0) {
    return;
  }
  for (const item of currentItems) {
    if (alreadyChanged.has(item.id)) {
      continue;
    }
    const relatedNodeChanged = payload.tree.nodes.some(
      (node) =>
        updatedNodeIds.has(node.id) &&
        (node.id === item.id || (node.relatedItemIds ?? []).includes(item.id)),
    );
    if (!relatedNodeChanged) {
      continue;
    }
    changes.push({
      itemId: item.id,
      action: "updated",
      title: humanizeAgendaReferences(item.title || item.id, agendaLabels),
      item,
      fields: [
        {
          label: "議論ツリー",
          before: "変更前",
          after: "配置・関連情報を更新",
        },
      ],
    });
  }
}

function displayItemKind(item: AnalysisItem) {
  const kind = analysisKindLabel(item.kind);
  return item.kind === "issue" && item.subtype && item.subtype !== "discussion"
    ? `${kind}（${issueSubtypeLabel(item.subtype)}）`
    : kind;
}

function displayItemStatus(value: string) {
  return (
    {
      open: "未解決",
      updated: "更新あり",
      resolved: "解決済",
      completed: "完了済",
      done: "完了済",
      dismissed: "非表示",
    }[value] ?? value
  );
}

function displaySeverity(value: string) {
  return { high: "高", medium: "中", low: "低" }[value] ?? value;
}

function displayRelatedAgendas(item: AnalysisItem, agendaLabels: Map<string, string>) {
  const labels = [...new Set(item.relatedAgendaIds ?? [])].map((id) =>
    humanizeAgendaReferences(id, agendaLabels),
  );
  return labels.join("、") || "なし";
}

function displayChangeText(value: string, agendaLabels: Map<string, string>) {
  const normalized = humanizeAgendaReferences(value, agendaLabels).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "なし";
  }
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}

function LiveCardUpdateHistory({
  batches,
  agendaLabels,
  momentIndex,
}: {
  batches: LiveUpdateBatch[];
  agendaLabels: Map<string, string>;
  momentIndex: MeetingMomentIndex;
}) {
  if (batches.length === 0) {
    return (
      <div
        className="rounded-(--ds-radius-control) border px-3 py-3 text-[11px]"
        style={{
          background: "var(--ds-surface-muted)",
          borderColor: "var(--ds-border)",
          color: "var(--text-muted)",
        }}
      >
        カードの更新を待っています。
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {batches.map((batch, batchIndex) => {
        const updatedLabel = formatUpdatedAtTime(batch.updatedAtUtc);
        return (
          <li
            key={batch.key}
            className="rounded-(--ds-radius-control) border p-2.5"
            style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
          >
            <p className="mb-2 text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
              {batchIndex === 0 ? "最新の更新" : "過去の更新"}
              {updatedLabel ? ` · ${updatedLabel}` : ""}
            </p>
            {batch.changes.length === 0 ? (
              <p className="text-[11px]" style={{ color: "var(--text-sub)" }}>
                この更新ではカードの変更はありません。
              </p>
            ) : (
              <ul className="space-y-2">
                {batch.changes.map((change) => {
                  const momentLabel = analysisItemMomentLabel(change.item, momentIndex);
                  return (
                    <li key={`${change.action}:${change.itemId}`}>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                          style={updateActionStyle(change.action)}
                        >
                          {updateActionLabel(change.action)}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate font-semibold"
                          style={{ color: "var(--text-main)" }}
                        >
                          {humanizeAgendaReferences(change.title, agendaLabels)}
                        </span>
                        {momentLabel && (
                          <time
                            className="shrink-0 text-[9px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {momentLabel}
                          </time>
                        )}
                      </div>
                      {change.fields.length > 0 && (
                        <ul
                          className="mt-1.5 space-y-1 pl-2 text-[10px] leading-4"
                          style={{ color: "var(--text-sub)" }}
                        >
                          {change.fields.map((field) => (
                            <li key={field.label}>
                              <span className="font-semibold">{field.label}:</span>{" "}
                              <span style={{ color: "var(--text-muted)" }}>{field.before}</span>
                              <span aria-hidden="true"> → </span>
                              <span>{field.after}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function updateActionLabel(action: LiveCardChange["action"]) {
  return action === "added" ? "追加" : action === "removed" ? "非表示" : "更新";
}

function updateActionStyle(action: LiveCardChange["action"]): React.CSSProperties {
  if (action === "added") {
    return { background: "var(--brand-light)", color: "var(--brand)" };
  }
  if (action === "removed") {
    return { background: "var(--ds-surface)", color: "var(--text-muted)" };
  }
  return { background: "var(--reaction-bg)", color: "var(--text-sub)" };
}

// ライブタブには、AI更新ごとのカード差分と要点を表示する。
function LiveAnalysisOverview({
  liveAnalysis,
  payload,
  updateHistory,
  agendaLabels,
  momentIndex,
}: {
  liveAnalysis: MeetingAIAnalysis;
  payload: LiveAnalysisPayload | null;
  updateHistory: LiveUpdateBatch[];
  agendaLabels: Map<string, string>;
  momentIndex: MeetingMomentIndex;
}) {
  const bullets = liveAnalysisBullets(payload, agendaLabels);

  return (
    <>
      <section aria-labelledby="live-analysis-card-updates">
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-4 w-0.5 rounded-full" style={{ background: "var(--brand)" }} />
            <h2
              id="live-analysis-card-updates"
              className="text-[13px] font-bold tracking-[0.01em]"
              style={{ color: "var(--text-main)" }}
            >
              カードの更新
            </h2>
          </div>
          <div className="min-w-0 shrink">
            <LiveAnalysisStatus liveAnalysis={liveAnalysis} />
          </div>
        </div>
        <LiveCardUpdateHistory
          batches={updateHistory}
          agendaLabels={agendaLabels}
          momentIndex={momentIndex}
        />
      </section>

      {bullets.length > 0 && (
        <section aria-labelledby="live-analysis-key-points">
          <div className="mb-2 flex items-center gap-2 px-0.5">
            <span className="h-4 w-0.5 rounded-full" style={{ background: "var(--brand)" }} />
            <h2
              id="live-analysis-key-points"
              className="text-[13px] font-bold tracking-[0.01em]"
              style={{ color: "var(--text-main)" }}
            >
              要点
            </h2>
          </div>
          <ul className="space-y-2">
            {bullets.map((bullet, index) => (
              <li key={`${bullet}-${index}`}>
                <article
                  className="rounded-(--ds-radius-control) border px-3.5 py-3 text-[13px] font-medium leading-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                  style={{
                    background: "var(--ds-surface-muted)",
                    borderColor: "var(--ds-border)",
                    color: "var(--text-main)",
                  }}
                >
                  {bullet}
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function liveAnalysisBullets(
  payload: LiveAnalysisPayload | null,
  agendaLabels: Map<string, string>,
) {
  const summary = payload?.summary?.replace(/\s+/g, " ").trim();
  if (!summary) {
    return [];
  }
  const parts = summary
    .split(/[。.!！?？]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts.length > 0 ? parts : [summary])
    .slice(0, 4)
    .map((part) => truncateLiveBullet(humanizeAgendaReferences(part, agendaLabels)));
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
