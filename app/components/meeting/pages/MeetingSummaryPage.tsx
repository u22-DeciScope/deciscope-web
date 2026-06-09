import { Link } from "react-router";
import { HiArrowDownTray, HiChevronRight, HiLightBulb, HiShare } from "react-icons/hi2";
import { DsButton } from "~/components/DsButton";
import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

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

const priorityDot: Record<string, string> = { high: "var(--priority-high)", medium: "var(--priority-medium)", low: "var(--priority-low)" };
const priorityLabel: Record<string, string> = { high: "高", medium: "中", low: "低" };
const levelBar: Record<string, string> = { high: "var(--priority-high)", medium: "var(--priority-medium)", low: "var(--ds-border)" };

export default function MeetingSummary() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");

  return (
    <WorkspacePageLayout
      header={
      <div
        className="ds-surface flex min-h-13 flex-wrap items-center gap-3 rounded-[14px] px-4 py-3 md:h-13 md:px-5 md:py-0"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <Link to={meetingsPath} className="text-[12px]" style={{ color: "var(--text-muted)" }}>ホーム</Link>
        <HiChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-main)" }}>Q2 製品ロードマップ検討</span>

        <div className="ml-auto flex items-center gap-2">
          <DsButton variant="secondary">
            <HiShare className="w-3.5 h-3.5" />
            共有
          </DsButton>
          <DsButton variant="secondary">
            <HiArrowDownTray className="w-3.5 h-3.5" />
            エクスポート
          </DsButton>
        </div>
      </div>
      }
      rightSidebar={
        <div className="flex w-full flex-col gap-2 overflow-y-auto">
          {/* 参加者カード */}
          <div className="ds-surface overflow-hidden rounded-[14px]" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex h-10 items-center border-b px-4" style={{ borderColor: "var(--ds-border)" }}>
              <span className="mr-2 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>参加者</span>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3">
              {participants.map((p) => (
                <div key={p.name} className="flex items-center gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    {p.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium" style={{ color: "var(--text-main)" }}>{p.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 統計カード */}
          <div className="ds-surface overflow-hidden rounded-[14px]" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex h-10 items-center border-b px-4" style={{ borderColor: "var(--ds-border)" }}>
              <span className="mr-2 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--text-main)" }}>サマリー</span>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3">
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
      }
      rightSidebarClassName="w-55"
    >
        <div className="flex h-full min-w-0 flex-col gap-2 md:overflow-y-auto">

          {/* 会議情報カード */}
          <div className="ds-surface rounded-[14px] px-6 py-5 shrink-0" style={{ boxShadow: "var(--ds-shadow)" }}>
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
                <HiLightBulb className="w-3.5 h-3.5 text-white" />
              </div>
              <p className="text-[13px] font-semibold" style={{ color: "var(--ai-quest-fg)" }}>AI サマリー</p>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--ai-quest-fg)" }}>
              本会議では、Q2 OKRの達成確認と新機能リリースの判断が主要な議題でした。クラッシュ率の問題は技術的に解決可能と判断され、修正後1週間でのリリースが決定されました。また、Q3の目標設定に向けた準備とインフラコスト管理の方針も合意されました。合計4件の決定事項と5件のアクションアイテムが確定しています。
            </p>
          </div>

          {/* 決定事項カード */}
          <div className="ds-surface rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-10 px-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
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
          <div className="ds-surface rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-10 px-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
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
            <Link to={meetingsPath} className="flex-1">
              <DsButton variant="secondary" fullWidth>ホームに戻る</DsButton>
            </Link>
            <div className="flex-1">
              <DsButton fullWidth>フォローアップ会議を設定</DsButton>
            </div>
          </div>
        </div>
    </WorkspacePageLayout>
  );
}


