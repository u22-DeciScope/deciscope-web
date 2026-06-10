export type DiscussionTag = string;

export type DiscussionTreeNode = {
  id: number;
  tag: DiscussionTag;
  user: string;
  time: string;
  text: string;
  indent: number;
  active: boolean;
};

const tagStyle: Record<string, { bg: string; fg: string }> = {
  topic: { bg: "var(--tag-topic-bg)", fg: "var(--tag-topic-fg)" },
  claim: { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  evidence: { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  question: { bg: "var(--tag-counter-bg)", fg: "var(--tag-counter-fg)" },
  risk: { bg: "var(--tag-concern-bg)", fg: "var(--tag-concern-fg)" },
  decision: { bg: "var(--tag-policy-bg)", fg: "var(--tag-policy-fg)" },
  todo: { bg: "var(--tag-policy-bg)", fg: "var(--tag-policy-fg)" },
};

type DiscussionTreeProps = {
  nodes: DiscussionTreeNode[];
};

export function DiscussionTree({ nodes }: DiscussionTreeProps) {
  return (
    <div
      className="flex min-h-80 flex-1 flex-col overflow-hidden rounded-(--ds-radius-panel) md:min-h-0"
      style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
    >
      <div
        className="flex h-10 shrink-0 items-center border-b px-4"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: "var(--brand)" }}
        />
        <span className="ml-2 text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
          議論ツリー
        </span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {nodes.length === 0 && (
          <p className="px-2 py-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            分析イベントが届くと議論ツリーが表示されます。
          </p>
        )}
        {nodes.map((node) => {
          const style = tagStyle[node.tag] ?? tagStyle.topic;

          return (
            <div
              key={node.id}
              className="relative flex items-start gap-1.5 overflow-hidden rounded-(--ds-radius-control) border"
              style={{
                marginLeft: node.indent * 20,
                background: node.active ? "var(--node-active-bg)" : "var(--node-bg)",
                borderColor: node.active ? "var(--node-active-border)" : "var(--node-border)",
                borderWidth: node.active ? "1.5px" : "1px",
              }}
            >
              {node.indent > 0 && (
                <div
                  className="absolute bottom-0 top-0 -left-5 w-0.5"
                  style={{ background: "var(--indent-line)" }}
                />
              )}

              <div className="flex w-full items-start gap-1.5 px-1.75 py-2">
                <span
                  className="shrink-0 rounded-sm px-1.25 py-0.75 text-[9px] font-semibold leading-none"
                  style={{ background: style.bg, color: style.fg }}
                >
                  {node.tag}
                </span>
                {node.user && (
                  <span
                    className="mt-px shrink-0 text-[10px] font-medium"
                    style={{ color: "var(--text-sub)" }}
                  >
                    {node.user}
                  </span>
                )}
                <span
                  className="mt-px flex-1 text-[12px] leading-normal"
                  style={{ color: "var(--text-main)" }}
                >
                  {node.text}
                </span>
                {node.time && (
                  <span
                    className="mt-px shrink-0 text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {node.time}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
