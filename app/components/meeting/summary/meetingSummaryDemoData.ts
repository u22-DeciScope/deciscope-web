import type { MeetingSummaryViewModel } from "./meetingSummaryTypes";

export const meetingSummaryDemo: MeetingSummaryViewModel = {
  title: "Q2 製品ロードマップ検討",
  statusLabel: "完了",
  dateRange: "2026年5月23日 10:00 〜 11:05",
  duration: "65分",
  aiSummary:
    "本会議では、Q2 OKRの達成確認と新機能リリースの判断が主要な議題でした。クラッシュ率の問題は技術的に解決可能と判断され、修正後1週間でのリリースが決定されました。また、Q3の目標設定に向けた準備とインフラコスト管理の方針も合意されました。合計4件の決定事項と5件のアクションアイテムが確定しています。",
  decisions: [
    {
      id: 1,
      text: "Q2のOKRを達成済みと見なし、Q3の目標設定に移行する",
      votes: "全員合意",
      level: "high",
    },
    {
      id: 2,
      text: "クラッシュ率を0.1%以下に修正後、新機能リリースを1週間後に実施する",
      votes: "4対1で可決",
      level: "high",
    },
    {
      id: 3,
      text: "インフラコスト削減のため、スケールアップの判断を来月まで保留",
      votes: "全員合意",
      level: "medium",
    },
    {
      id: 4,
      text: "週次スプリントレビューをバイウィークリーに変更する",
      votes: "3対2で可決",
      level: "low",
    },
  ],
  actions: [
    {
      id: 1,
      text: "クラッシュバグ #4821 を修正する",
      owner: "鈴木 一郎",
      due: "5月26日",
      done: false,
      priority: "high",
    },
    {
      id: 2,
      text: "Q3 OKR ドラフトを作成して共有する",
      owner: "山田 太郎",
      due: "5月28日",
      done: false,
      priority: "high",
    },
    {
      id: 3,
      text: "本番リリース告知メールを準備する",
      owner: "高橋 健",
      due: "5月30日",
      done: false,
      priority: "medium",
    },
    {
      id: 4,
      text: "オンボーディングフローの最終確認",
      owner: "佐藤 美咲",
      due: "5月25日",
      done: false,
      priority: "medium",
    },
    {
      id: 5,
      text: "ユーザーインタビューのスケジュール調整",
      owner: "田中 花子",
      due: "6月2日",
      done: false,
      priority: "low",
    },
  ],
  participants: [
    { name: "山田 太郎", role: "ファシリテーター", avatar: "山" },
    { name: "田中 花子", role: "プロダクト", avatar: "田" },
    { name: "鈴木 一郎", role: "エンジニア", avatar: "鈴" },
    { name: "佐藤 美咲", role: "デザイン", avatar: "佐" },
    { name: "高橋 健", role: "マーケティング", avatar: "高" },
  ],
};
