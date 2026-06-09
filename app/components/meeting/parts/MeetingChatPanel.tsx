const messages = [
  { id: 1, user: "田中", text: "今日はプロダクトの方向性を決めたい。", own: false },
  { id: 2, user: "佐藤", text: "アイデアは多いけど、まだ絞れていません。", own: false },
  { id: 3, user: "", text: "ターゲットから先に決めませんか？", own: true },
  { id: 4, user: "田中", text: "学生向けはどうでしょう。", own: false },
  { id: 5, user: "", text: "利用場面をもう少し具体化したいです。", own: true },
];

export function MeetingChatPanel() {
  return (
    <section
      className="flex max-h-72 w-full shrink-0 flex-col overflow-hidden rounded-[14px] xl:max-h-none xl:w-58"
      style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
    >
      <header
        className="flex h-10 shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--node-border)" }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
        <span className="ml-2 text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
          会話
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
        {messages.map((message) =>
          message.own ? (
            <div key={message.id} className="flex justify-end">
              <p
                className="max-w-45 rounded-xl px-2.5 py-2 text-[11px] leading-4 text-white"
                style={{ background: "var(--chat-own-bg)" }}
              >
                {message.text}
              </p>
            </div>
          ) : (
            <div key={message.id}>
              <p className="mb-1 pl-2 text-[10px] font-semibold" style={{ color: "var(--text-sub)" }}>
                {message.user}
              </p>
              <p
                className="max-w-45 rounded-xl border px-2.5 py-2 text-[11px] leading-4"
                style={{
                  background: "var(--chat-other-bg)",
                  borderColor: "var(--chat-other-border)",
                  color: "var(--text-main)",
                }}
              >
                {message.text}
              </p>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
