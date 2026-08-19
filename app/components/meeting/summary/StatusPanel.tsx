// /summary は fullBleedMain(main側の白パネル無し)なので、読み込み中・エラー表示も
// 本体と同じ青背景の余白の中にカードとして置く。
export function StatusPanel({ message }: { message: string }) {
  return (
    <div
      className="h-full rounded-(--ds-radius-panel) p-3 sm:p-4"
      style={{ background: "var(--ds-bg)" }}
    >
      <div
        className="ds-surface rounded-(--ds-radius-panel) border p-5 text-[13px]"
        style={{
          borderColor: "var(--ds-border)",
          boxShadow: "var(--ds-shadow)",
          color: "var(--text-sub)",
        }}
      >
        {message}
      </div>
    </div>
  );
}
