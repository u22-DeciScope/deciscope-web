import {
  HiChatBubbleLeftRight,
  HiChevronDoubleLeft,
  HiChevronDoubleRight,
} from "react-icons/hi2";

const messages = [
  { id: 1, user: "田中", text: "じゃあ始めようか。今日はプロダクトの方向性を決めたい。", own: false },
  { id: 2, user: "佐藤", text: "アイデアいっぱいあるんだけど、絞れなくて。", own: false },
  { id: 3, user: "", text: "Deciscopeで決めよう。ターゲットを先に決めない？", own: true },
  { id: 4, user: "田中", text: "学生向けはどうかな。審査員にも刺さりそうだし。", own: false },
  { id: 5, user: "佐藤", text: "でも学生って会議しないよね？", own: false },
  { id: 6, user: "", text: "サークルとか就活グループとか、意外とある気がする。", own: true },
  { id: 7, user: "田中", text: "MVPを考えると機能を絞らないと厳しいよな。", own: false },
  { id: 8, user: "佐藤", text: "文字起こしと要約だけに絞る？", own: false },
  { id: 9, user: "", text: "それだと差別化できない。AIの提案が必要だと思う。", own: true },
];

type AppSidebarSharedAreaProps = {
  collapsed: boolean;
  onClose: () => void;
  onOpen: () => void;
  width: number;
};

export function AppSidebarSharedArea({
  collapsed,
  onClose,
  onOpen,
  width,
}: AppSidebarSharedAreaProps) {
  if (collapsed) {
    return (
      <section
        className="group relative z-10 flex shrink-0 flex-col items-center"
        style={{ width }}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex h-[50px] w-full shrink-0 items-center justify-center border-b transition hover:bg-(--ds-surface-muted)"
          aria-label="共有エリアを開く"
          title="共有エリアを開く"
          style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
        >
          <HiChatBubbleLeftRight className="h-4 w-4 group-hover:hidden" />
          <HiChevronDoubleRight className="hidden h-4 w-4 group-hover:block" />
        </button>
      </section>
    );
  }

  return (
    <section
      className="relative z-10 flex min-w-0 shrink-0 flex-col overflow-hidden"
      style={{ width }}
    >
      <header
        className="flex h-[50px] shrink-0 items-center border-b px-3"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-(--brand)" />
        <span className="ml-2 truncate text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>
          会話
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition hover:bg-(--ds-surface-muted)"
          aria-label="共有エリアを閉じる"
          title="共有エリアを閉じる"
          style={{ color: "var(--text-muted)" }}
        >
          <HiChevronDoubleLeft className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {messages.map((message) =>
          message.own ? (
            <div key={message.id} className="flex justify-end">
              <p
                className="max-w-[90%] rounded-xl px-2.5 py-2 text-[11px] leading-4 text-white"
                style={{ background: "var(--chat-own-bg)" }}
              >
                {message.text}
              </p>
            </div>
          ) : (
            <div key={message.id}>
              <p className="mb-1 pl-1 text-[9px] font-semibold" style={{ color: "var(--text-sub)" }}>
                {message.user}
              </p>
              <p
                className="max-w-[90%] rounded-xl border px-2.5 py-2 text-[11px] leading-4"
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
