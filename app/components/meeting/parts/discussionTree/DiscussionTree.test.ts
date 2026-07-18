import { describe, expect, it } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { buildActionSummaryProjection, stageTentativeTree } from "./DiscussionTree";

const nodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "会議" },
  { id: "agenda-noise", kind: "topic", parentId: "root", label: "騒音" },
  {
    id: "agenda-actions",
    kind: "topic",
    parentId: "root",
    label: "今後の対応事項",
    agendaRole: "action_summary",
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
  it("keeps one canonical flow node and renders one compact action row", () => {
    const items = [
      item("todo-wind", "todo", {
        title: "気象データを確認する",
        relatedAgendaIds: ["agenda-actions", "agenda-actions-duplicate", "agenda-actions"],
      }),
    ];
    const first = buildActionSummaryProjection(nodes, items);
    const second = buildActionSummaryProjection(nodes, items);

    expect(second).toEqual(first);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      canonicalItemId: "todo-wind",
      targetLabel: "騒音",
    });
    expect(first[0]?.sourceAgendaIds).toEqual(["agenda-actions", "agenda-actions-duplicate"]);
    expect(nodes.filter((node) => node.id === "todo-wind")).toHaveLength(1);
    expect(nodes.some((node) => node.id.startsWith("agenda-reference:"))).toBe(false);
  });

  it("builds action rows after the backend removes the canonical action agenda node", () => {
    const withoutActionNode = nodes.filter((node) => node.id !== "agenda-actions");
    const rows = buildActionSummaryProjection(withoutActionNode, [
      item("todo-wind", "todo", { relatedAgendaIds: ["agenda-actions"] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.canonicalItemId).toBe("todo-wind");
  });

  it("excludes completed todos and non-action kinds", () => {
    const rows = buildActionSummaryProjection(nodes, [
      item("todo-wind", "todo", {
        status: "resolved",
        relatedAgendaIds: ["agenda-actions"],
      }),
      item("question-wind", "question", { relatedAgendaIds: ["agenda-actions"] }),
      item("decision-1", "decision", { relatedAgendaIds: ["agenda-actions"] }),
      item("open-wind", "open_issue", {
        classificationStatus: "unclassified",
        relatedAgendaIds: ["agenda-actions"],
      }),
    ]);
    expect(rows).toEqual([]);
  });

  it("clusters question open_issue and todo into the todo row", () => {
    const rows = buildActionSummaryProjection(nodes, [
      item("question-wind", "question"),
      item("open-wind", "open_issue", { relatedAgendaIds: ["agenda-actions"] }),
      item("todo-wind", "todo", { relatedAgendaIds: ["agenda-actions"] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      canonicalItemId: "todo-wind",
      openIssueCount: 1,
      questionCount: 1,
    });
  });

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

  it("reduces the observed session_888 action references from eight full nodes to four rows", () => {
    const targetNodes: TreeNodePayload[] = [
      ...nodes,
      { id: "agenda-resident", kind: "topic", parentId: "root", label: "住民説明資料" },
      { id: "topic-extra", kind: "topic", parentId: "root", label: "追加調査課題" },
      { id: "topic-unclassified", kind: "topic", parentId: "root", label: "追加論点" },
      { id: "open-resident", kind: "open_issue", parentId: "topic-unclassified" },
      { id: "open-recap", kind: "open_issue", parentId: "topic-unclassified" },
      { id: "open-noise", kind: "open_issue", parentId: "group-wind" },
      { id: "todo-extra", kind: "todo", parentId: "topic-extra" },
      { id: "question-plant", kind: "question", parentId: "topic-unclassified" },
    ];
    const related = { relatedAgendaIds: ["agenda-actions"] };
    const targetItems = [
      item("open-noise", "open_issue", { ...related, classificationStatus: "assigned" }),
      item("open-resident", "open_issue", {
        ...related,
        classificationStatus: "tentative",
        candidateTopicId: "topic-resident",
      }),
      item("open-recap", "open_issue", { ...related, classificationStatus: "unclassified" }),
      item("open-junk", "open_issue", { ...related, classificationStatus: "unclassified" }),
      item("open-date", "open_issue", { ...related, classificationStatus: "unclassified" }),
      item("todo-extra", "todo", { ...related, classificationStatus: "assigned" }),
      item("todo-plant", "todo", {
        ...related,
        classificationStatus: "tentative",
        candidateTopicId: "topic-plant",
      }),
      item("question-plant", "question", {
        ...related,
        classificationStatus: "tentative",
        candidateTopicId: "topic-plant",
      }),
    ];

    const rows = buildActionSummaryProjection(targetNodes, targetItems);
    expect(rows.map((row) => row.canonicalItemId)).toEqual(["todo-extra", "open-noise"]);
    expect(rows.every((row) => row.sourceAgendaIds.length === 1)).toBe(true);
  });
});
