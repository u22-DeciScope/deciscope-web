// 会議名の欄。1段目はDeciScope側のタイトル(ユーザー入力を優先)、
// 2段目はTeams側の会議名(別名がある場合のみ)を薄い文字で表示する。
export function MeetingTitleLine({ teamsTitle, title }: { teamsTitle?: string; title: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p
        className="min-w-0 truncate text-[13px] font-medium"
        style={{ color: "var(--text-main)" }}
        title={title}
      >
        {title}
      </p>
      {teamsTitle && (
        <p
          className="min-w-0 truncate text-[11px]"
          style={{ color: "var(--text-muted)" }}
          title={`Teams上の会議名: ${teamsTitle}`}
        >
          {teamsTitle}
        </p>
      )}
    </div>
  );
}
