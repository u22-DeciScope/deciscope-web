// 会議名の行。ユーザー入力のタイトルを主表示し、Teams側の会議名が別にある場合は
// 少し間をあけて薄い文字で補助表示する。
export function MeetingTitleLine({ teamsTitle, title }: { teamsTitle?: string; title: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <p
        className="min-w-0 shrink truncate text-[13px] font-medium"
        style={{ color: "var(--text-main)" }}
      >
        {title}
      </p>
      {teamsTitle && (
        <p
          className="min-w-0 shrink truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
          title={`Teams上の会議名: ${teamsTitle}`}
        >
          {teamsTitle}
        </p>
      )}
    </div>
  );
}
