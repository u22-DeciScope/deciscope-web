export type DiscussionTag = "話題" | "案" | "懸念" | "反論" | "方針";

export type DiscussionTreeNode = {
  id: number;
  tag: DiscussionTag;
  user: string;
  time: string;
  text: string;
  indent: number;
  active: boolean;
};

const tagStyle: Record<DiscussionTag, { bg: string; fg: string }> = {
  "話題": { bg: "var(--tag-topic-bg)", fg: "var(--tag-topic-fg)" },
  "案": { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  "懸念": { bg: "var(--tag-concern-bg)", fg: "var(--tag-concern-fg)" },
  "反論": { bg: "var(--tag-counter-bg)", fg: "var(--tag-counter-fg)" },
  "方針": { bg: "var(--tag-policy-bg)", fg: "var(--tag-policy-fg)" },
};

type DiscussionTreeProps = {
  nodes: DiscussionTreeNode[];
};

export function DiscussionTree({ nodes }: DiscussionTreeProps) {
  return (
    <div
      className="flex-1 flex flex-col overflow-hidden rounded-[14px]"
      style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
    >
      <div
        className="h-10 flex items-center px-4 shrink-0 border-b"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--brand)" }} />
        <span className="ml-2 text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
          議論ツリー
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
        {nodes.map((node) => {
          const style = tagStyle[node.tag];

          return (
            <div
              key={node.id}
              className="relative flex items-start gap-1.5 rounded-[10px] overflow-hidden border"
              style={{
                marginLeft: node.indent * 20,
                background: node.active ? "var(--node-active-bg)" : "var(--node-bg)",
                borderColor: node.active ? "var(--node-active-border)" : "var(--node-border)",
                borderWidth: node.active ? "1.5px" : "1px",
              }}
            >
              {node.indent > 0 && (
                <div
                  className="absolute -left-5 top-0 bottom-0 w-0.5"
                  style={{ background: "var(--indent-line)" }}
                />
              )}

              <div className="flex items-start gap-1.5 px-1.75 py-2 w-full">
                <span
                  className="shrink-0 text-[9px] font-semibold px-1.25 py-0.75 rounded-sm leading-none"
                  style={{ background: style.bg, color: style.fg }}
                >
                  {node.tag}
                </span>
                <span className="shrink-0 text-[10px] font-medium mt-px" style={{ color: "var(--text-sub)" }}>
                  {node.user}
                </span>
                <span className="flex-1 text-[12px] leading-normal mt-px" style={{ color: "var(--text-main)" }}>
                  {node.text}
                </span>
                <span className="shrink-0 text-[10px] mt-px" style={{ color: "var(--text-muted)" }}>
                  {node.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
