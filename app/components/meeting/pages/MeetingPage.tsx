import { Link, useParams } from "react-router";
import { workspaceMeetingSummaryPath } from "~/lib/workspace";

import {
  HiCheck,
  HiEllipsisHorizontal,
  HiExclamationTriangle,
  HiLightBulb,
  HiQuestionMarkCircle,
  HiSparkles,
} from "react-icons/hi2";

import { DiscussionTree, type DiscussionTreeNode } from "../parts/DiscussionTree";

/* ------------------------------------------------------------------ */
/* Data                                                                 */
/* ------------------------------------------------------------------ */

const chat = [
  { id: 1,  user: "🐻 田中", text: "じゃあ始めようか。今日はプロダクトの方向性を決めたい。", own: false },
  { id: 2,  user: "🦊 佐藤", text: "アイデアいっぱいあるんだけど、絞れなくて😅", own: false },
  { id: 3,  user: "",        text: "DeciScopeで決めよう笑\nターゲットを先に決めない？", own: true },
  { id: 4,  user: "🐻 田中", text: "学生向けはどうかな。審査員にも刺さりそうだし。", own: false },
  { id: 5,  user: "🦊 佐藤", text: "でも学生って会議しないよね？ゼミとか？", own: false },
  { id: 6,  user: "",        text: "サークルとか就活グループとか？意外とある気がする", own: true },
  { id: 7,  user: "🐻 田中", text: "MVP作る時間考えると機能絞らないとやばいよな。", own: false },
  { id: 8,  user: "🦊 佐藤", text: "文字起こしと要約だけに絞る？", own: false },
  { id: 9,  user: "",        text: "それだと差別化できなくない？AIの提案がウリだと思う。", own: true },
  { id: 10, user: "🐻 田中", text: "デモ映えするし、AIの提案は絶対入れたい", own: false },
];

const tree: DiscussionTreeNode[] = [
  { id: 1,  tag: "話題", user: "田中", time: "10:02", text: "今日の目標：プロダクトの方向性を決める",       indent: 0, active: false },
  { id: 2,  tag: "話題", user: "田中", time: "10:05", text: "ターゲットユーザーをどこにするか",              indent: 0, active: false },
  { id: 3,  tag: "案",   user: "田中", time: "10:05", text: "学生向け → 審査員に刺さりやすい",              indent: 1, active: false },
  { id: 4,  tag: "懸念", user: "佐藤", time: "10:06", text: "学生は会議をあまりしない？",                   indent: 1, active: false },
  { id: 5,  tag: "反論", user: "林",   time: "10:07", text: "サークル・就活グループなど用途はある",         indent: 1, active: false },
  { id: 6,  tag: "話題", user: "田中", time: "10:08", text: "MVP機能の絞り込み",                            indent: 0, active: false },
  { id: 7,  tag: "懸念", user: "田中", time: "10:08", text: "時間的に機能を絞る必要がある",                 indent: 1, active: false },
  { id: 8,  tag: "案",   user: "佐藤", time: "10:09", text: "文字起こし＋要約のみに絞る",                   indent: 1, active: false },
  { id: 9,  tag: "反論", user: "林",   time: "10:10", text: "差別化のためにAI提案機能は必須では？",         indent: 1, active: true  },
  { id: 10, tag: "方針", user: "田中", time: "10:11", text: "AI提案機能はデモ映えするため実装する方向",     indent: 1, active: false },
];

const insights = [
  {
    id: 1, section: "いますぐ確認を",
    kind: "risk" as const, badge: "リスク", importance: "重要度 高",
    impFg: "var(--ai-risk-fg)",
    bg: "var(--ai-risk-bg)", border: "var(--ai-risk-border)", fg: "var(--ai-risk-fg)",
    title: "MVP完成までの時間が未計算",
    desc: "AI提案機能を含めた場合の開発工数がまだ見積もられていない。締切に間に合うか要確認。",
    reactions: 2,
  },
  {
    id: 2, section: "話しておくといいかも",
    kind: "point" as const, badge: "未検討論点", importance: "重要度 中",
    impFg: "var(--ai-point-fg)",
    bg: "var(--ai-point-bg)", border: "var(--ai-point-border)", fg: "var(--ai-point-fg)",
    title: "「学生」の定義がふわっとしてる",
    desc: "大学生なのかサークル単位なのかで設計が全然変わってくる。",
    reactions: 3,
  },
  {
    id: 3, section: "",
    kind: "question" as const, badge: "質問候補", importance: "重要度 中",
    impFg: "var(--ai-point-fg)",
    bg: "var(--ai-quest-bg)", border: "var(--ai-quest-border)", fg: "var(--ai-quest-fg)",
    title: "競合との差別化ポイントを言語化できてる？",
    desc: "審査員に「なぜDeciScopeか」を30秒で説明できる言葉を固めておくと良さそう。",
    reactions: 2,
  },
];

type InsightKind = "risk" | "point" | "question";

const insightIcons = {
  risk: HiExclamationTriangle,
  point: HiLightBulb,
  question: HiQuestionMarkCircle,
} satisfies Record<InsightKind, typeof HiLightBulb>;

const insightFilters = [
  { label: "すべて" },
  { label: "リスク", kind: "risk" },
  { label: "論点", kind: "point" },
  { label: "質問", kind: "question" },
] satisfies { label: string; kind?: InsightKind }[];

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function Meeting() {
  const { id } = useParams();

  return (
    <div className="flex min-h-full flex-col gap-2 md:h-full md:flex-row md:overflow-hidden">
      <div
        className="flex max-h-80 w-full shrink-0 flex-col overflow-hidden rounded-[14px] md:max-h-none md:w-58"
        style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
      >
        <div
          className="h-10 flex items-center px-3 shrink-0 border-b"
          style={{ borderColor: "var(--node-border)" }}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "var(--brand)" }} />
          <span className="ml-2 text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>会話</span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
          {chat.map((msg) =>
            msg.own ? (
              <div key={msg.id} className="flex justify-end pr-1">
                <div
                  className="text-white text-[11px] rounded-xl px-2.25 py-2 max-w-45 leading-4 whitespace-pre-line"
                  style={{ background: "var(--chat-own-bg)" }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={msg.id}>
                <p className="text-[10px] font-semibold pl-2 mb-1" style={{ color: "var(--text-sub)" }}>
                  {msg.user}
                </p>
                <div
                  className="text-[11px] rounded-xl px-2 py-1.75 w-45 leading-4 border"
                  style={{
                    background: "var(--chat-other-bg)",
                    borderColor: "var(--chat-other-border)",
                    color: "var(--text-main)",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">

        {/* タイマーバー（SideNavと同じtop位置） */}
        <div
          className="ds-surface flex min-h-13 shrink-0 flex-wrap items-center gap-2 rounded-[9px] border-2 border-red-500 px-4 py-2 md:h-13 md:px-6 md:py-0"
        >
          <div className="flex-1" />
          {/* タイマー */}
          <span className="text-[16px] font-bold text-black font-mono tracking-widest md:mr-6">
            xx：xx
          </span>
          {/* 会議中ステータス */}
          <div className="flex items-center gap-2">
            <div className="w-6.5 h-6.5 rounded-full border-2 border-red-500 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-red-500" />
            </div>
            <span className="text-[16px] font-bold" style={{ color: "var(--status-live)" }}>会議中</span>
          </div>
          <Link
            to={workspaceMeetingSummaryPath(id ?? "")}
            className="ml-4 text-xs border rounded-lg px-2.5 py-1 transition hover:bg-slate-50"
            style={{ borderColor: "var(--node-border)", color: "var(--text-sub)" }}
          >
            終了
          </Link>
        </div>

        {/* 議論ツリー ＋ AI アシスタント */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">

          <DiscussionTree nodes={tree} />

          {/* AI アシスタントカード */}
          <div
            className="flex w-full shrink-0 flex-col overflow-hidden rounded-[14px] md:w-65"
            style={{ background: "var(--ds-surface)", boxShadow: "var(--ds-shadow)" }}
          >
            {/* AIヘッダー */}
            <div
              className="h-10 flex items-center px-3 shrink-0 border-b"
              style={{ borderColor: "var(--node-border)" }}
            >
              <div
                className="w-5.5 h-5.5 rounded-md flex items-center justify-center text-white text-[12px] shrink-0"
                style={{ background: "var(--brand)" }}
              >
                <HiSparkles className="w-3.5 h-3.5" />
              </div>
              <span className="ml-2 text-[12px] font-semibold flex-1" style={{ color: "var(--text-main)" }}>
                AIアシスタント
              </span>
              <div
                className="w-4.5 h-4.5 rounded-[9px] flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ background: "var(--brand)" }}
              >
                3
              </div>
            </div>

            {/* フィルタータブ */}
            <div
              className="h-8.5 flex items-center px-2 gap-1 shrink-0 border-b"
              style={{ borderColor: "var(--node-border)" }}
            >
              {insightFilters.map((filter, i) => (
                <button
                  key={filter.label}
                  type="button"
                  className="text-[10px] px-1.25 py-1 rounded-md whitespace-nowrap transition flex items-center gap-1"
                  style={
                    i === 0
                      ? { background: "var(--chat-other-bg)", color: "var(--brand)", fontWeight: 600, border: "1px solid var(--node-border)" }
                      : { color: "var(--text-muted)" }
                  }
                >
                  {filter.kind && (() => {
                    const Icon = insightIcons[filter.kind];
                    return <Icon className="w-3 h-3" />;
                  })()}
                  {filter.label}
                </button>
              ))}
            </div>

            {/* インサイトカード一覧 */}
            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
              {insights.map((ins) => (
                <div key={ins.id}>
                  {ins.section && (
                    <p className="text-[10px] font-semibold px-1 mb-1" style={{ color: "var(--text-muted)" }}>
                      {ins.section}
                    </p>
                  )}
                  <div
                    className="rounded-[10px] border p-2.5 relative"
                    style={{ background: ins.bg, borderColor: ins.border }}
                  >
                    {/* バッジ行 */}
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-[9px] font-semibold px-1.25 py-0.75 rounded-sm inline-flex items-center gap-1"
                        style={{ background: ins.bg, color: ins.fg }}
                      >
                        {(() => {
                          const Icon = insightIcons[ins.kind];
                          return <Icon className="w-2.75 h-2.75" />;
                        })()}
                        {ins.badge}
                      </span>
                      <span className="text-[10px] font-semibold" style={{ color: ins.impFg }}>
                        {ins.importance}
                      </span>
                    </div>
                    {/* タイトル */}
                    <p className="text-[12px] font-semibold leading-4.25 mb-2" style={{ color: "var(--text-main)" }}>
                      {ins.title}
                    </p>
                    {/* 説明 */}
                    <p className="text-[11px] leading-4 mb-2.5" style={{ color: "var(--text-sub)" }}>
                      {ins.desc}
                    </p>
                    {/* フッター */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>💬 {ins.reactions}件</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="w-5.5 h-5 rounded-md flex items-center justify-center text-[11px] font-semibold"
                          style={{ background: "var(--reaction-bg)", color: "var(--badge-decision-fg)" }}
                        >
                          <HiCheck className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          className="w-5.5 h-5 rounded-md flex items-center justify-center text-[11px]"
                          style={{ background: "var(--reaction-bg)", color: "var(--text-muted)" }}
                        >
                          <HiEllipsisHorizontal className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


