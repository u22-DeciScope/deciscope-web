import { describe, expect, it } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { stageTentativeTree, visibleDiscussionTreeNodeCount } from "./DiscussionTree";

const nodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "会議" },
  { id: "agenda-noise", kind: "topic", parentId: "root", label: "騒音" },
  {
    id: "agenda-actions",
    kind: "topic",
    parentId: "root",
    label: "今後の対応事項",
    agendaRole: "action_summary",
    agendaRefs: ["agenda-actions"],
  },
  { id: "group-wind", kind: "group", parentId: "agenda-noise", label: "強風条件" },
  { id: "question-wind", kind: "question", parentId: "group-wind", label: "何m/sか" },
  { id: "open-wind", kind: "open_issue", parentId: "group-wind", label: "未確定" },
  { id: "todo-wind", kind: "todo", parentId: "group-wind", label: "気象確認" },
  { id: "todo-plant", kind: "todo", parentId: "topic-unclassified", label: "植物調査" },
];

const edges: TreeEdgePayload[] = [
  { id: "root-noise", source: "root", target: "agenda-noise" },
  { id: "root-actions", source: "root", target: "agenda-actions" },
  { id: "noise-group", source: "agenda-noise", target: "group-wind" },
  { id: "group-question", source: "group-wind", target: "question-wind" },
  { id: "group-open", source: "group-wind", target: "open-wind" },
  { id: "group-todo", source: "group-wind", target: "todo-wind" },
];

const item = (id: string, kind: string, overrides: Partial<AnalysisItem> = {}): AnalysisItem => ({
  id,
  kind,
  severity: "medium",
  title: id,
  body: id,
  status: "open",
  ...overrides,
});

describe("discussion tree projections", () => {
  it("hides tentative detail nodes until the same canonical id is promoted", () => {
    const tentativeItems = [
      item("todo-plant", "todo", {
        classificationStatus: "tentative",
        candidateTopicId: "topic-plant",
        relatedAgendaIds: ["agenda-actions"],
      }),
    ];
    const staged = stageTentativeTree(nodes, edges, tentativeItems);
    expect(staged.nodes.some((node) => node.id === "todo-plant")).toBe(false);
    expect(staged.nodes.some((node) => node.id === "agenda-actions")).toBe(false);

    const promoted = stageTentativeTree(nodes, edges, [
      { ...tentativeItems[0], classificationStatus: "assigned", candidateTopicId: undefined },
    ]);
    expect(promoted.nodes.filter((node) => node.id === "todo-plant")).toHaveLength(1);
  });

  it("counts only nodes that can actually be rendered", () => {
    const targetNodes: TreeNodePayload[] = [
      ...nodes,
      {
        id: "agenda-empty",
        kind: "topic",
        parentId: "root",
        label: "未議論アジェンダ",
        origin: "agenda",
        agendaRefs: ["agenda-empty"],
        materialized: true,
      },
      { id: "topic-unclassified", kind: "topic", parentId: "root", label: "追加論点" },
    ];
    const tentativeItems = [
      item("todo-plant", "todo", {
        classificationStatus: "tentative",
        candidateTopicId: "topic-plant",
      }),
    ];

    const staged = stageTentativeTree(targetNodes, edges, tentativeItems);
    expect(staged.nodes.some((node) => node.id === "agenda-actions")).toBe(false);
    expect(staged.nodes.some((node) => node.id === "agenda-empty")).toBe(false);
    expect(staged.nodes.some((node) => node.id === "topic-unclassified")).toBe(false);
    expect(visibleDiscussionTreeNodeCount(targetNodes, edges, tentativeItems)).toBe(
      staged.nodes.length,
    );
  });
});
