import { Link, useParams } from "react-router";

import { WorkspacePageLayout } from "~/components/shared/layout/WorkspacePageLayout";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspaceMeetingSummaryPath } from "~/lib/workspace";
import { DiscussionTree, type DiscussionTreeNode } from "../parts/DiscussionTree";
import { MeetingAssistantPanel } from "../parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "../parts/MeetingChatPanel";

const discussionNodes: DiscussionTreeNode[] = [
  { id: 1, tag: "話題", user: "田中", time: "10:02", text: "今日の目標：プロダクトの方向性を決める", indent: 0, active: false },
  { id: 2, tag: "話題", user: "田中", time: "10:05", text: "ターゲットユーザーをどこにするか", indent: 0, active: false },
  { id: 3, tag: "案", user: "田中", time: "10:05", text: "学生向けに提供する", indent: 1, active: false },
  { id: 4, tag: "懸念", user: "佐藤", time: "10:06", text: "学生は会議をあまりしない？", indent: 1, active: false },
  { id: 5, tag: "反論", user: "林", time: "10:07", text: "サークル・就活グループなど用途はある", indent: 1, active: true },
  { id: 6, tag: "話題", user: "田中", time: "10:08", text: "MVP機能の絞り込み", indent: 0, active: false },
  { id: 7, tag: "方針", user: "田中", time: "10:11", text: "AI提案機能を実装する方向", indent: 1, active: false },
];

export default function Meeting() {
  const { id } = useParams();
  const { workspaceId } = useAuthenticatedLayout();

  return (
    <WorkspacePageLayout
      header={
        <div className="ds-surface flex min-h-13 items-center gap-3 rounded-[14px] px-4">
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
          プロダクト方針検討会議
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[14px] font-bold" style={{ color: "var(--text-main)" }}>
            xx : xx
          </span>
          <span className="flex items-center gap-2 text-[13px] font-bold" style={{ color: "var(--status-live)" }}>
            <span className="h-3 w-3 rounded-full bg-(--status-live)" />
            会議中
          </span>
          <Link
            to={workspaceMeetingSummaryPath(workspaceId, id ?? "")}
            className="rounded-[8px] border px-3 py-1.5 text-[11px] transition hover:opacity-70"
            style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
          >
            終了
          </Link>
        </div>
        </div>
      }
      rightSidebar={<MeetingAssistantPanel />}
    >
      <section className="flex h-full min-w-0 flex-col gap-2 xl:flex-row">
        <MeetingChatPanel />
        <DiscussionTree nodes={discussionNodes} />
      </section>
    </WorkspacePageLayout>
  );
}
