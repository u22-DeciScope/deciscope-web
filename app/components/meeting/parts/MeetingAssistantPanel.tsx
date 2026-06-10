import {
  HiCheck,
  HiEllipsisHorizontal,
  HiExclamationTriangle,
  HiLightBulb,
  HiQuestionMarkCircle,
  HiSparkles,
} from "react-icons/hi2";

const insights = [
  {
    id: 1,
    kind: "risk" as const,
    label: "リスク",
    title: "MVP完成までの時間が未計算",
    description: "AI提案機能を含めた場合の工数を確認する必要があります。",
    background: "var(--ai-risk-bg)",
    border: "var(--ai-risk-border)",
    color: "var(--ai-risk-fg)",
  },
  {
    id: 2,
    kind: "point" as const,
    label: "未検討論点",
    title: "対象ユーザーの定義が曖昧",
    description: "利用場面を具体化すると設計方針を決めやすくなります。",
    background: "var(--ai-point-bg)",
    border: "var(--ai-point-border)",
    color: "var(--ai-point-fg)",
  },
  {
    id: 3,
    kind: "question" as const,
    label: "質問候補",
    title: "競合との差別化を説明できますか？",
    description: "Deciscopeを選ぶ理由を短く言語化してみましょう。",
    background: "var(--ai-quest-bg)",
    border: "var(--ai-quest-border)",
    color: "var(--ai-quest-fg)",
  },
];

const insightIcons = {
  risk: HiExclamationTriangle,
  point: HiLightBulb,
  question: HiQuestionMarkCircle,
};

export function MeetingAssistantPanel() {
  return (
    <div
      className="flex min-h-0 w-full flex-col overflow-hidden rounded-[14px]"
      style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
    >
      <header
        className="flex h-10 shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: "var(--brand)" }}
        >
          <HiSparkles className="h-3.5 w-3.5" />
        </span>
        <span
          className="ml-2 flex-1 text-[12px] font-semibold"
          style={{ color: "var(--text-main)" }}
        >
          AIアシスタント
        </span>
        <span
          className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {insights.length}
        </span>
      </header>

      <div
        className="flex h-8.5 shrink-0 items-center gap-1 border-b px-2"
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

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {insights.map((insight) => {
          const Icon = insightIcons[insight.kind];
          return (
            <article
              key={insight.id}
              className="rounded-[10px] border p-3"
              style={{ background: insight.background, borderColor: insight.border }}
            >
              <div
                className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold"
                style={{ color: insight.color }}
              >
                <Icon className="h-3.5 w-3.5" />
                {insight.label}
              </div>
              <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
                {insight.title}
              </h2>
              <p className="mt-2 text-[11px] leading-4" style={{ color: "var(--text-sub)" }}>
                {insight.description}
              </p>
              <div className="mt-3 flex justify-end gap-1">
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
            </article>
          );
        })}
      </div>
    </div>
  );
}
