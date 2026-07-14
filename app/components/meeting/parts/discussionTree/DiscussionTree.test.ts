import { describe, expect, it } from "vitest";

import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import { addCrossCuttingAgendaReferences } from "./DiscussionTree";

describe("addCrossCuttingAgendaReferences", () => {
  it("canonical itemを複製せずaction summary配下に安定した参照nodeを作る", () => {
    const nodes: TreeNodePayload[] = [
      { id: "root", kind: "topic", label: "会議" },
      { id: "agenda-noise", kind: "topic", parentId: "root", label: "騒音" },
      {
        id: "agenda-actions",
        kind: "topic",
        parentId: "root",
        label: "横断対応",
        agendaRole: "action_summary",
      },
      { id: "todo-wind", kind: "todo", parentId: "agenda-noise", label: "風速基準" },
    ];
    const edges: TreeEdgePayload[] = [
      { id: "root-noise", source: "root", target: "agenda-noise" },
      { id: "root-actions", source: "root", target: "agenda-actions" },
      { id: "noise-todo", source: "agenda-noise", target: "todo-wind" },
    ];
    const items: AnalysisItem[] = [
      {
        id: "todo-wind",
        kind: "todo",
        severity: "high",
        title: "強風日の基準風速を決める",
        body: "気象データ確認後に決める",
        status: "open",
        relatedAgendaIds: ["agenda-actions", "agenda-actions"],
      },
    ];

    const first = addCrossCuttingAgendaReferences(nodes, edges, items);
    const second = addCrossCuttingAgendaReferences(nodes, edges, items);
    expect(second).toEqual(first);
    expect(first.nodes.filter((node) => node.id === "todo-wind")).toHaveLength(1);
    expect(first.nodes.find((node) => node.id === "todo-wind")?.parentId).toBe("agenda-noise");

    const reference = first.nodes.find(
      (node) => node.id === "agenda-reference:agenda-actions:todo-wind",
    );
    expect(reference).toMatchObject({
      parentId: "agenda-actions",
      relatedItemIds: ["todo-wind"],
      origin: "reference",
    });
    expect(
      first.edges.filter(
        (edge) => edge.source === "agenda-actions" && edge.target === reference?.id,
      ),
    ).toHaveLength(1);
  });
});
