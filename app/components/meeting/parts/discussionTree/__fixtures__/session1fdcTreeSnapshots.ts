import type {
  TreeChangesPayload,
  TreeEdgePayload,
  TreeNodePayload,
  TreeUpdatePayload,
} from "~/api/meetings/meetingRuntimeTypes";

export const SESSION_1FDC_ID = "session_1fdc26b44086f0b8";

// meeting_tree_audit_runs.input_payload (based_on_tree_version=13)から採取した
// canonicalNodeId/nodeType/parentCanonicalNodeId/title。DBの分析行はupsertのため
// v12の完全payloadは残らないが、v13/v14と最新v15は実セッションの構造そのもの。
const v13Nodes: TreeNodePayload[] = [
  { id: "root", kind: "topic", label: "名古屋支社ネットワーク障害の振り返りと再発防止" },
  {
    id: "topic-agenda-a5f8fcd0c7a2",
    kind: "topic",
    parentId: "root",
    label: "9時20分頃の接続不可の概要",
    origin: "agenda",
  },
  {
    id: "topic-agenda-7dd3ab9e5ea9",
    kind: "topic",
    parentId: "root",
    label: "ネットワーク機器交換時の設定ダブルチェック",
    origin: "agenda",
  },
  {
    id: "candidate-3ade9c3ca58b",
    kind: "topic",
    parentId: "root",
    label: "VPN証明書更新の周辺対応",
    origin: "dynamic",
  },
  {
    id: "group-78dda4ce724d",
    kind: "group",
    parentId: "topic-agenda-a5f8fcd0c7a2",
    label: "接続端末の混在状況の整理",
  },
  {
    id: "group-7f859ddcc5d2",
    kind: "group",
    parentId: "topic-agenda-a5f8fcd0c7a2",
    label: "3階VLAN設定の漏れが原因候補",
  },
  {
    id: "group-f593d8263314",
    kind: "group",
    parentId: "candidate-3ade9c3ca58b",
    label: "VPN証明書更新の周辺対応の検討",
  },
  detail("item-issue-discussion-947e3072c2fd", "issue", "group-78dda4ce724d"),
  detail("item-issue-discussion-79864e8fe3a7", "issue", "group-78dda4ce724d"),
  detail("item-issue-discussion-451c084c9c6c", "issue", "group-78dda4ce724d"),
  detail("item-issue-discussion-a9f0ab6e51ce", "issue", "group-7f859ddcc5d2"),
  detail("item-issue-discussion-dbdab6879be2", "issue", "group-7f859ddcc5d2"),
  detail("issue-investigation-auto-7b15808aa786", "issue", "group-7f859ddcc5d2"),
  detail("item-todo-bbb88a0a2821", "todo", "group-7f859ddcc5d2"),
  detail("item-todo-d557856dbd94", "todo", "topic-agenda-7dd3ab9e5ea9"),
  detail("decision-auto-8a9f51d2c295", "decision", "topic-agenda-7dd3ab9e5ea9"),
  detail("item-issue-discussion-78a7f63f99de", "issue", "candidate-3ade9c3ca58b"),
  detail("item-issue-discussion-6b593f577ba5", "issue", "group-f593d8263314"),
  detail("item-risk-fb4f24567c25", "risk", "topic-agenda-7dd3ab9e5ea9"),
  detail("item-risk-6fd10beab717", "risk", "group-f593d8263314"),
  detail("item-todo-a0e5e6896967", "todo", "group-f593d8263314"),
];

export const session1fdcSnapshots = {
  // v12はログの19 nodes/18 edgesとv13 treeChangesから逆算した同等fixture。
  12: snapshot(
    12,
    [
      ...v13Nodes.filter(
        (node) =>
          !["candidate-3ade9c3ca58b", "group-f593d8263314", "item-todo-a0e5e6896967"].includes(
            node.id,
          ),
      ),
      detail("item-v12-cap-evicted", "issue", "topic-agenda-7dd3ab9e5ea9"),
    ].map((node) =>
      [
        "item-issue-discussion-6b593f577ba5",
        "item-issue-discussion-78a7f63f99de",
        "item-risk-6fd10beab717",
      ].includes(node.id)
        ? { ...node, parentId: "topic-agenda-7dd3ab9e5ea9" }
        : node,
    ),
    { treeVersion: 12 },
  ),
  13: snapshot(13, v13Nodes, {
    treeVersion: 13,
    newNodeIds: ["candidate-3ade9c3ca58b", "group-f593d8263314", "item-todo-a0e5e6896967"],
    reparentedNodeIds: [
      "item-issue-discussion-6b593f577ba5",
      "item-issue-discussion-78a7f63f99de",
      "item-risk-6fd10beab717",
    ],
  }),
  14: snapshot(
    14,
    v13Nodes.map((node) =>
      node.id === "item-issue-discussion-78a7f63f99de"
        ? { ...node, parentId: "topic-agenda-7dd3ab9e5ea9" }
        : node,
    ),
    { treeVersion: 14, reparentedNodeIds: ["item-issue-discussion-78a7f63f99de"] },
  ),
  15: snapshot(
    15,
    v13Nodes.map((node) => {
      if (node.id === "item-issue-discussion-78a7f63f99de") {
        return { ...node, parentId: "topic-agenda-7dd3ab9e5ea9" };
      }
      if (node.id === "item-issue-discussion-947e3072c2fd") {
        return { ...node, parentId: "topic-agenda-a5f8fcd0c7a2" };
      }
      return node;
    }),
    { treeVersion: 15, reparentedNodeIds: ["item-issue-discussion-947e3072c2fd"] },
  ),
} satisfies Record<
  number,
  TreeUpdatePayload & { treeVersion: number; treeChanges: TreeChangesPayload }
>;

export function rawSession1fdcLiveAnalysis(version: 12 | 13 | 14 | 15) {
  const target = session1fdcSnapshots[version];
  return {
    sessionId: SESSION_1FDC_ID,
    analysisType: "live",
    status: "completed",
    version,
    updatedAtUtc: `2026-07-23T00:13:${String(version).padStart(2, "0")}Z`,
    payload: {
      payloadKind: "full_snapshot",
      treeVersion: version,
      nodeCount: target.nodes.length,
      edgeCount: target.edges.length,
      items: [],
      tree: { nodes: target.nodes, edges: target.edges },
      treeChanges: target.treeChanges,
    },
  };
}

function detail(id: string, kind: string, parentId: string): TreeNodePayload {
  return { id, kind, parentId, label: id };
}

function snapshot(version: number, nodes: TreeNodePayload[], treeChanges: TreeChangesPayload) {
  return {
    treeVersion: version,
    treeChanges,
    nodes,
    edges: edgesFromParents(nodes),
  };
}

function edgesFromParents(nodes: TreeNodePayload[]): TreeEdgePayload[] {
  return nodes.flatMap((node) =>
    node.parentId
      ? [
          {
            id: `edge-${node.parentId}-${node.id}`,
            source: node.parentId,
            target: node.id,
          },
        ]
      : [],
  );
}
