import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { DsButton } from "../components/DsButton";
import type { Route } from "./+types/meeting.$id.summary";

export function meta({}: Route.MetaArgs) {
  return [{ title: "会議サマリー | Deciscope" }];
}

const decisions = [
  { id: 1, text: "Q2のOKRを達成済みと見なし、Q3の目標設定に移行する", votes: "全員合意", level: "high" },
  { id: 2, text: "クラッシュ率を0.1%以下に修正後、新機能リリースを1週間後に実施する", votes: "4対1で可決", level: "high" },
  { id: 3, text: "インフラコスト削減のため、スケールアップの判断を来月まで保留", votes: "全員合意", level: "medium" },
  { id: 4, text: "週次スプリントレビューをバイウィークリーに変更する", votes: "3対2で可決", level: "low" },
];

const actions = [
  { id: 1, text: "クラッシュバグ #4821 を修正する", owner: "鈴木 一郎", due: "5月26日", done: false, priority: "high" },
  { id: 2, text: "Q3 OKR ドラフトを作成して共有する", owner: "山田 太郎", due: "5月28日", done: false, priority: "high" },
  { id: 3, text: "本番リリース告知メールを準備する", owner: "高橋 健", due: "5月30日", done: false, priority: "medium" },
  { id: 4, text: "オンボーディングフローの最終確認", owner: "佐藤 美咲", due: "5月25日", done: false, priority: "medium" },
  { id: 5, text: "ユーザーインタビューのスケジュール調整", owner: "田中 花子", due: "6月2日", done: false, priority: "low" },
];

const participants = [
  { name: "山田 太郎", role: "ファシリテーター", avatar: "山" },
  { name: "田中 花子", role: "プロダクト", avatar: "田" },
  { name: "鈴木 一郎", role: "エンジニア", avatar: "鈴" },
  { name: "佐藤 美咲", role: "デザイン", avatar: "佐" },
  { name: "高橋 健", role: "マーケティング", avatar: "高" },
];

const priorityDot: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#9bb5c8" };
const priorityLabel: Record<string, string> = { high: "高", medium: "中", low: "低" };
const levelBar: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "var(--ds-border)" };

export default function MeetingSummary() {

  return (
    <div className="h-screen flex flex-col overflow-hidden p-[9px] gap-[8px]" style={{ background: "var(--ds-bg)" }}>

      {/* ===== ヘッダーバー ===== */}
      <div
        className="h-[52px] bg-white rounded-[14px] flex items-center px-5 gap-3 shrink-0"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <Logo size="sm" linkTo="/" />

        <div className="w-px h-5 mx-1" style={{ background: "var(--ds-border)" }} />

        <Link to="/" className="text-[12px]" style={{ color: "var(--text-muted)" }}>ホーム</Link>
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--text-muted)" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-main)" }}>Q2 製品ロードマップ検討</span>

        <div className="ml-auto flex items-center gap-2">
          <DsButton variant="secondary">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            共有
          </DsButton>
          <DsButton variant="secondary">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            エクスポート
          </DsButton>
        </div>
      </div>

      {/* ===== メインコンテンツ ===== */}
      <div className="flex-1 flex gap-[8px] min-h-0">

        {/* 左カラム（メイン） */}
        <div className="flex-1 flex flex-col gap-[8px] min-w-0 overflow-y-auto">

          {/* 会議情報カード */}
          <div className="bg-white rounded-[14px] px-6 py-5 shrink-0" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
                    style={{ background: "var(--badge-decision-bg)", color: "var(--badge-decision-fg)" }}
                  >
                    完了
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    2026年5月23日 10:00 〜 11:05
                  </span>
                </div>
                <h1 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>Q2 製品ロードマップ検討</h1>
              </div>
              <div className="text-right">
                <p className="text-[22px] font-bold" style={{ color: "var(--brand)" }}>65分</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>会議時間</p>
              </div>
            </div>
          </div>

          {/* AIサマリーカード */}
          <div
            className="rounded-[14px] px-6 py-5 shrink-0"
            style={{ background: "var(--ai-quest-bg)", border: "1px solid var(--ai-quest-border)", boxShadow: "var(--ds-shadow)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-6 h-6 rounded-[7px] flex items-center justify-center"
                style={{ background: "var(--brand)" }}
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ai-quest-fg)" }}>AI サマリー</p>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--ai-quest-fg)" }}>
              本会議では、Q2 OKRの達成確認と新機能リリースの判断が主要な議題でした。クラッシュ率の問題は技術的に解決可能と判断され、修正後1週間でのリリースが決定されました。また、Q3の目標設定に向けた準備とインフラコスト管理の方針も合意されました。合計4件の決定事項と5件のアクションアイテムが確定しています。
            </p>
          </div>

          {/* 決定事項カード */}
          <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-[40px] px-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-[8px] h-[8px] rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>決定事項</span>
              <span
                className="ml-2 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "var(--badge-decision-bg)", color: "var(--badge-decision-fg)" }}
              >
                {decisions.length}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
              {decisions.map((d) => (
                <div key={d.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="w-1 self-stretch rounded-full mt-1 shrink-0" style={{ background: levelBar[d.level] }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium leading-relaxed" style={{ color: "var(--text-main)" }}>{d.text}</p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{d.votes}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* アクションアイテムカード */}
          <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-[40px] px-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-[8px] h-[8px] rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>アクションアイテム</span>
              <span
                className="ml-2 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "var(--badge-action-bg)", color: "var(--badge-action-fg)" }}
              >
                {actions.length}
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
              {actions.map((action) => (
                <div key={action.id} className="flex items-center gap-3 px-5 py-3">
                  <input type="checkbox" checked={action.done} readOnly className="w-4 h-4 shrink-0 rounded accent-[#2a8fd4]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px]" style={{ color: "var(--text-main)" }}>{action.text}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{action.owner}</span>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>期限: {action.due}</span>
                    </div>
                  </div>
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: priorityDot[action.priority] }}
                    title={priorityLabel[action.priority]}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* フッターボタン */}
          <div className="flex gap-3 pb-1 shrink-0">
            <Link to="/" className="flex-1">
              <DsButton variant="secondary" fullWidth>ホームに戻る</DsButton>
            </Link>
            <div className="flex-1">
              <DsButton fullWidth>フォローアップ会議を設定</DsButton>
            </div>
          </div>
        </div>

        {/* 右カラム（サイド情報） */}
        <div className="w-[220px] shrink-0 flex flex-col gap-[8px]">

          {/* 参加者カード */}
          <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-[40px] px-4 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-[8px] h-[8px] rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>参加者</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              {participants.map((p) => (
                <div key={p.name} className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: "var(--brand)" }}
                  >
                    {p.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--text-main)" }}>{p.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 統計カード */}
          <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-[40px] px-4 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-[8px] h-[8px] rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>サマリー</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              {[
                { label: "会議時間", value: "65分" },
                { label: "決定事項", value: `${decisions.length}件` },
                { label: "アクション", value: `${actions.length}件` },
                { label: "参加者", value: `${participants.length}名` },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{stat.label}</span>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
