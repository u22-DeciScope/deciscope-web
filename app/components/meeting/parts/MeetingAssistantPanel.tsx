import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  analysisKindColor,
  analysisKindLabel,
  dimmedColor,
  resolvedBadgeColor,
} from "~/components/meeting/parts/analysisKindPalette";

type MeetingAssistantPanelProps = {
  insights: AnalysisItem[];
  speakerSummaries: RuntimeSpeakerSummary[];
  liveAnalysis?: MeetingAIAnalysis | null;
  focusedAnalysisItemId?: string | null;
  highlightedAnalysisItemId?: string | null;
  updateStatus?: React.ReactNode;
};

const insightIcons = {
  issue: HiLightBulb,
  question: HiQuestionMarkCircle,
  risk: HiExclamationTriangle,
  decision: HiCheckCircle,
  todo: HiClipboardDocumentList,
};

type InsightFilter = "live" | "active" | "decision" | "resolved" | "all";

const insightFilterTabs: Array<{ key: InsightFilter; label: string }> = [
  { key: "live", label: "ライブ" },
  { key: "active", label: "進行中" },
  { key: "decision", label: "決定事項" },
  { key: "resolved", label: "解決済" },
  { key: "all", label: "すべて" },
];

function matchesInsightFilter(item: AnalysisItem, filter: InsightFilter) {
  switch (filter) {
    case "live":
      return false;
    case "active":
      return !isResolvedItem(item) && item.kind !== "decision";
    case "decision":
      return !isResolvedItem(item) && item.kind === "decision";
    case "resolved":
      return isResolvedItem(item);
    case "all":
      return true;
    default:
      return true;
  }
}

export function analysisItemElementId(itemId: string) {
  return `ai-analysis-item-${encodeURIComponent(itemId)}`;
}

function filterForInsightItem(item: AnalysisItem): InsightFilter {
  if (isResolvedItem(item)) {
    return "resolved";
  }
  if (item.kind === "decision") {
    return "decision";
  }
  return "active";
}

function isResolvedItem(item: AnalysisItem) {
  return item.status === "resolved";
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
}: MeetingAssistantPanelProps) {
  const [filter, setFilter] = useState<InsightFilter>("live");
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
  const filteredLiveItems = useMemo(
    () => liveItems.filter((item) => matchesInsightFilter(item, filter)),
    [filter, liveItems],
  );
  const filteredInsights = useMemo(
    () => visibleInsights.filter((insight) => matchesInsightFilter(insight, filter)),
    [filter, visibleInsights],
  );
  const filteredItemCount = filteredLiveItems.length + filteredInsights.length;
  const showLiveTab = filter === "live";

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
        className="flex h-9 w-full shrink-0 items-center gap-0.5 border-b px-1.5"
        style={{ borderColor: "var(--node-border)" }}
      >
        {insightFilterTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="min-w-0 flex-1 whitespace-nowrap rounded-md px-0.5 py-1 text-center text-[10px]"
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
        {showLiveTab &&
          (liveAnalysis ? (
            <LiveAnalysisOverview liveAnalysis={liveAnalysis} payload={livePayload} />
          ) : (
            <EmptyAssistantState
              title="ライブ分析を待っています"
              body="会議の発話が蓄積されると、現在の論点が短く表示されます。"
            />
          ))}
        {showLiveTab && speakerSummaries.length > 0 && (
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
        {!showLiveTab && totalCount === 0 && (
          <EmptyAssistantState
            title="まだAIメモはありません"
            body="分析イベントが届くと、リスクや質問がここへカード表示されます。"
          />
        )}
        {!showLiveTab && totalCount > 0 && filteredItemCount === 0 && (
          <EmptyAssistantState
            title="このタブに表示するカードはありません"
            body="別のタブに切り替えると、他の状態のカードを確認できます。"
          />
        )}
        {!showLiveTab &&
          filteredLiveItems.map((item) => (
            <LiveAnalysisItemCard
              key={item.id}
              item={item}
              highlighted={highlightedAnalysisItemId === item.id}
            />
          ))}
        {!showLiveTab &&
          filteredInsights.map((insight) => {
            const Icon = insightIcons[insight.kind as keyof typeof insightIcons] ?? HiLightBulb;
            const style = insightStyle(insight.kind);
            const highlighted = highlightedAnalysisItemId === insight.id;
            const resolved = isResolvedItem(insight);
            return (
              <article
                key={insight.id}
                id={analysisItemElementId(insight.id)}
                data-ai-item-id={insight.id}
                className="rounded-(--ds-radius-control) border p-3 transition-[box-shadow,outline-color]"
                style={{
                  background: resolved ? dimmedColor(style.background, 45) : style.background,
                  borderColor: resolved ? dimmedColor(style.border, 45) : style.border,
                  borderStyle: resolved ? "dashed" : undefined,
                  ...analysisItemHighlightStyle(highlighted),
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div
                    className="flex items-center gap-1.5 text-[10px] font-bold"
                    style={{ color: style.color }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {analysisKindLabel(insight.kind)}
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
                <h2
                  className="text-[13px] font-bold leading-5"
                  style={{ color: "var(--text-main)" }}
                >
                  {insight.title}
                </h2>
                <p className="mt-2 text-[12px] leading-5" style={{ color: "var(--text-sub)" }}>
                  {insight.body}
                </p>
                <div className="mt-3 flex items-center justify-between gap-1">
                  <AnalysisStatusBadge status={insight.status} />
                  <div className="ml-auto flex items-center gap-1">
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

function analysisItemStatusLabel(status: string) {
  if (status === "resolved") {
    return "解決済";
  }
  if (status === "open") {
    return "進行中";
  }
  // "updated" は分析が更新されただけの内部状態で、ユーザーに見せても情報価値が
  // ないため何も表示しない(呼び出し側でバッジ自体を描画しない)。
  return "";
}

// resolved(解決済)時は緑系の塗り背景+チェックマークの強調バッジにし、それ以外は
// 従来通りの控えめなテキスト表示(進行中)にする。ノード/カードの共通コンポーネントである
// ResolvedBadge(discussionTree/NodeDetailCard.tsx, DiscussionNodeView.tsx)と同じ配色
// (resolvedBadgeColor)を使い、ツリー側との見た目の一貫性を保つ。
function AnalysisStatusBadge({
  status,
  variant = "inline",
}: {
  status: string;
  variant?: "inline" | "block";
}) {
  const content = renderAnalysisStatusContent(status);
  if (!content) {
    return null;
  }
  if (variant === "block") {
    return <div className="mt-3">{content}</div>;
  }
  return content;
}

function renderAnalysisStatusContent(status: string) {
  if (status === "resolved") {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
        style={{ background: resolvedBadgeColor.bg, color: resolvedBadgeColor.fg }}
      >
        <HiCheck className="h-3 w-3" />
        解決済
      </span>
    );
  }
  const label = analysisItemStatusLabel(status);
  if (!label) {
    return null;
  }
  return (
    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
      {label}
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

function LiveAnalysisItemCard({ item, highlighted }: { item: AnalysisItem; highlighted: boolean }) {
  const Icon = insightIcons[item.kind as keyof typeof insightIcons] ?? HiLightBulb;
  const style = insightStyle(item.kind);
  const resolved = isResolvedItem(item);
  return (
    <article
      id={analysisItemElementId(item.id)}
      data-ai-item-id={item.id}
      className="rounded-(--ds-radius-control) border p-3 transition-[box-shadow,outline-color]"
      style={{
        background: resolved ? dimmedColor(style.background, 45) : style.background,
        borderColor: resolved ? dimmedColor(style.border, 45) : style.border,
        borderStyle: resolved ? "dashed" : undefined,
        ...analysisItemHighlightStyle(highlighted),
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 text-[10px] font-bold"
          style={{ color: style.color }}
        >
          <Icon className="h-3.5 w-3.5" />
          {analysisKindLabel(item.kind)}
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
      <AnalysisStatusBadge status={item.status} variant="block" />
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
  const bullets = liveAnalysisBullets(payload);
  return (
    <section
      className="rounded-(--ds-radius-control) border p-3"
      style={{ background: "var(--ai-quest-bg)", borderColor: "var(--ai-quest-border)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2
          className="shrink-0 whitespace-nowrap text-[11px] font-bold"
          style={{ color: "var(--ai-quest-fg)" }}
        >
          ライブ分析
        </h2>
        <div className="min-w-0 shrink">
          <LiveAnalysisStatus liveAnalysis={liveAnalysis} />
        </div>
      </div>

      {payload && (payload.summary || payload.currentTopic) && (
        <div className="space-y-2.5">
          {payload.currentTopic && (
            <LiveAnalysisBlock title="現在のトピック">
              <p className="text-[11px] leading-5" style={{ color: "var(--ai-quest-fg)" }}>
                {payload.currentTopic}
              </p>
            </LiveAnalysisBlock>
          )}

          {bullets.length > 0 && (
            <LiveAnalysisBlock title="要点">
              <ul className="space-y-1.5">
                {bullets.map((bullet, index) => (
                  <li
                    key={`${bullet}-${index}`}
                    className="flex gap-1.5 text-[11px] leading-5"
                    style={{ color: "var(--ai-quest-fg)" }}
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </LiveAnalysisBlock>
          )}
        </div>
      )}
    </section>
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
    <span className="block min-w-0 truncate text-right text-[10px]" style={{ color: "var(--text-muted)" }}>
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
