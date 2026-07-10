export function MarkdownReportPanel({ content }: { content: string }) {
  return (
    <section
      className="ds-surface min-h-60 overflow-auto rounded-(--ds-radius-panel) p-4"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
        Markdown レポート
      </h2>
      <pre
        className="whitespace-pre-wrap text-[12px] leading-5"
        style={{ color: "var(--text-sub)" }}
      >
        {content}
      </pre>
    </section>
  );
}
