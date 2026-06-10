import { useMemo } from "react";
import { Link, useParams } from "react-router";

import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspaceMeetingSummaryPath } from "~/routing/workspacePaths";
import { DiscussionTree, type DiscussionTreeNode } from "~/components/meeting/parts/DiscussionTree";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";

const discussionNodes: DiscussionTreeNode[] = [
  {
    id: 1,
    tag: "話題",
    user: "田中",
    time: "10:02",
    text: "今日の目標はプロダクトの方向性を決めることです。",
    indent: 0,
    active: false,
  },
  {
    id: 2,
    tag: "話題",
    user: "田中",
    time: "10:05",
    text: "ターゲットユーザーをどこに置くべきでしょうか。",
    indent: 0,
    active: false,
  },
  {
    id: 3,
    tag: "案",
    user: "田中",
    time: "10:05",
    text: "学生向けに提供する案があります。",
    indent: 1,
    active: false,
  },
  {
    id: 4,
    tag: "懸念",
    user: "佐藤",
    time: "10:06",
    text: "学生は会議をあまりしないのではないでしょうか。",
    indent: 1,
    active: false,
  },
  {
    id: 5,
    tag: "反論",
    user: "鈴木",
    time: "10:07",
    text: "サークルや就活グループなど用途はあります。",
    indent: 1,
    active: true,
  },
  {
    id: 6,
    tag: "話題",
    user: "田中",
    time: "10:08",
    text: "MVP機能の絞り込みを進めましょう。",
    indent: 0,
    active: false,
  },
  {
    id: 7,
    tag: "方針",
    user: "田中",
    time: "10:11",
    text: "AI提案機能を実装する方向で進めます。",
    indent: 1,
    active: false,
  },
];

export default function Meeting() {
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();
  const summaryPath = workspaceMeetingSummaryPath(workspaceId, id ?? "");

  const chrome = useMemo(
    () => ({
      header: {
        title: "プロダクト方向性検討会議",
        meta: (
          <span className="font-mono text-[14px] font-bold" style={{ color: "var(--text-main)" }}>
            xx : xx
          </span>
        ),
        status: (
          <span
            className="flex items-center gap-2 text-[13px] font-bold"
            style={{ color: "var(--status-live)" }}
          >
            <span className="h-3 w-3 rounded-full bg-(--status-live)" />
            会議中
          </span>
        ),
        actions: (
          <Link
            to={summaryPath}
            className="rounded-(--ds-radius-control) border px-3 py-1.5 text-[11px] transition hover:opacity-70"
            style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
          >
            終了
          </Link>
        ),
      },
      rightSidebar: <MeetingAssistantPanel />,
    }),
    [summaryPath],
  );
  useWorkspaceChrome(chrome);

  return (
    <section className="flex h-full min-w-0 flex-col gap-2 xl:flex-row">
      <MeetingChatPanel />
      <DiscussionTree nodes={discussionNodes} />
    </section>
  );
}
