import type {
  AnalysisItem,
  TreeChangesPayload,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";

export const SESSION_28F3_ID = "session_28f3f2e6706a28a4";

const NOISE_TOPIC_ID = "topic-agenda-64b761a79cc0";
const RESIDENT_TOPIC_ID = "topic-agenda-7dd3ab9e5ea9";
export const SESSION_28F3_NOISE_GROUP_ID = "group-dd10e2044647";
export const SESSION_28F3_RESIDENT_GROUP_ID = "group-e0d0e2c2c03e";

export const session28f3GroupChildren = {
  [SESSION_28F3_NOISE_GROUP_ID]: [
    "item-issue-discussion-29c86541aab4",
    "item-decision-8f543482e3d9",
    "item-issue-discussion-a742c0ebe0fe",
    "issue-question-auto-855f8b7e8690",
  ],
  [SESSION_28F3_RESIDENT_GROUP_ID]: [
    "item-issue-discussion-456fe82e3d68",
    "issue-question-auto-0f39ebf87e87",
    "decision-auto-669c840e2ece",
    "decision-auto-b3c34089ab49",
  ],
} as const;

export const session28f3ReparentedNodeIds = Object.values(session28f3GroupChildren).flat();
const noiseGroupChildIds = new Set<string>(session28f3GroupChildren[SESSION_28F3_NOISE_GROUP_ID]);
const residentGroupChildIds = new Set<string>(
  session28f3GroupChildren[SESSION_28F3_RESIDENT_GROUP_ID],
);

const baseNodes: TreeNodePayload[] = [
  {
    id: "root",
    kind: "topic",
    label: "沿岸部風力発電計画に関する環境アセスメント",
  },
  topic("topic-agenda-a5f8fcd0c7a2", "渡り鳥調査計画の確認不足点"),
  topic(NOISE_TOPIC_ID, "騒音測定の方法見直し"),
  topic(RESIDENT_TOPIC_ID, "住民説明資料の公開方針の検討"),
  {
    id: "topic-unclassified",
    kind: "topic",
    parentId: "root",
    label: "追加論点",
  },
  detail(
    "item-issue-discussion-240df133b0ea",
    "issue",
    "topic-agenda-a5f8fcd0c7a2",
    "渡り鳥調査計画の観測地点追加の決定",
  ),
  detail(
    "decision-auto-88e2365fd6a8",
    "decision",
    "topic-agenda-a5f8fcd0c7a2",
    "渡り鳥調査：海岸・北側・南側の計3地点で実施",
  ),
  detail("item-issue-discussion-29c86541aab4", "issue", NOISE_TOPIC_ID, "騒音測定の方法見直し"),
  detail("item-decision-8f543482e3d9", "decision", NOISE_TOPIC_ID, "夜間測定の頻度・条件の確定"),
  detail(
    "item-issue-discussion-a742c0ebe0fe",
    "issue",
    NOISE_TOPIC_ID,
    "強風日での測定条件の基準風速未定",
  ),
  detail(
    "issue-question-auto-855f8b7e8690",
    "question",
    NOISE_TOPIC_ID,
    "強風日の測定条件について、どの風速を基準にするか未決定",
  ),
  detail(
    "item-issue-discussion-456fe82e3d68",
    "issue",
    RESIDENT_TOPIC_ID,
    "住民説明資料の公開方針の検討",
  ),
  detail(
    "issue-question-auto-0f39ebf87e87",
    "question",
    RESIDENT_TOPIC_ID,
    "調査結果をどのように公開するか",
  ),
  detail(
    "decision-auto-669c840e2ece",
    "decision",
    RESIDENT_TOPIC_ID,
    "調査結果の概要を団体のウェブサイトで公開する",
  ),
  detail(
    "decision-auto-b3c34089ab49",
    "decision",
    RESIDENT_TOPIC_ID,
    "公開資料には図や簡単な説明を付ける",
  ),
  detail(
    "item-issue-discussion-98c520e31c06",
    "issue",
    "topic-unclassified",
    "現地説明会の開催ビラの自治会調整未完了",
  ),
  detail(
    "item-issue-discussion-045965fbcc11",
    "issue",
    "topic-unclassified",
    "現地担当者の新規報告の取り扱い",
  ),
  detail(
    "item-issue-investigation-3f2b67d5a15e",
    "issue",
    "topic-unclassified",
    "新たな湿地・希少植物の可能性",
  ),
  detail(
    "item-issue-discussion-7a80aaca6c47",
    "issue",
    "topic-unclassified",
    "新規調査課題の扱い方針",
  ),
  detail(
    "item-issue-investigation-f23edf70268c",
    "issue",
    "topic-unclassified",
    "植物の種類確認の予備調査検討",
  ),
  detail(
    "issue-question-auto-9974d430b117",
    "question",
    "topic-unclassified",
    "専門家による予備調査を実施するか次回会議で検討",
  ),
];

const v13Nodes = [
  ...baseNodes.slice(0, 5),
  {
    id: SESSION_28F3_NOISE_GROUP_ID,
    kind: "group",
    parentId: NOISE_TOPIC_ID,
    label: "騒音測定の方法見直し",
  },
  {
    id: SESSION_28F3_RESIDENT_GROUP_ID,
    kind: "group",
    parentId: RESIDENT_TOPIC_ID,
    label: "住民説明資料の公開方針の検討",
  },
  ...baseNodes.slice(5).map((node) => {
    if (noiseGroupChildIds.has(node.id)) {
      return { ...node, parentId: SESSION_28F3_NOISE_GROUP_ID };
    }
    if (residentGroupChildIds.has(node.id)) {
      return { ...node, parentId: SESSION_28F3_RESIDENT_GROUP_ID };
    }
    return node;
  }),
];

export const session28f3Snapshots = {
  12: snapshot(12, "110377280ea42539", baseNodes, {
    treeVersion: 12,
    reparentedNodeIds: [...session28f3ReparentedNodeIds],
  }),
  13: snapshot(13, "4d20f581d3ad4232", v13Nodes, {
    treeVersion: 13,
    newNodeIds: [SESSION_28F3_NOISE_GROUP_ID, SESSION_28F3_RESIDENT_GROUP_ID],
    reparentedNodeIds: [...session28f3ReparentedNodeIds],
  }),
  14: snapshot(14, "110377280ea42539", baseNodes, {
    treeVersion: 14,
    reparentedNodeIds: [...session28f3ReparentedNodeIds],
  }),
} satisfies Record<
  12 | 13 | 14,
  {
    treeVersion: number;
    treeHash: string;
    nodes: TreeNodePayload[];
    edges: TreeEdgePayload[];
    depthByNodeId: Record<string, number>;
    groupIds: string[];
    groupChildren: Record<string, string[]>;
    treeChanges: TreeChangesPayload;
  }
>;

const tentativeIds = new Set([
  "item-issue-discussion-98c520e31c06",
  "item-issue-discussion-045965fbcc11",
  "item-issue-investigation-3f2b67d5a15e",
  "item-issue-discussion-7a80aaca6c47",
  "item-issue-investigation-f23edf70268c",
  "issue-question-auto-9974d430b117",
]);

export const session28f3AnalysisItems: AnalysisItem[] = baseNodes
  .filter((node) => tentativeIds.has(node.id))
  .map((node) => ({
    id: node.id,
    kind: node.kind ?? "issue",
    severity: "medium",
    title: node.label ?? node.id,
    body: "",
    status: "open",
    classificationStatus: "tentative",
  }));

function topic(id: string, label: string): TreeNodePayload {
  return { id, kind: "topic", parentId: "root", label, origin: "agenda" };
}

function detail(id: string, kind: string, parentId: string, label: string): TreeNodePayload {
  return { id, kind, parentId, label };
}

function snapshot(
  treeVersion: number,
  treeHash: string,
  nodes: TreeNodePayload[],
  treeChanges: TreeChangesPayload,
) {
  const stableNodes = nodes.map((node) => ({ ...node }));
  const depthByNodeId = Object.fromEntries(
    stableNodes.map((node) => [node.id, nodeDepth(stableNodes, node.id)]),
  );
  const groupIds = stableNodes.filter((node) => node.kind === "group").map((node) => node.id);
  return {
    treeVersion,
    treeHash,
    nodes: stableNodes,
    edges: edgesFromParents(stableNodes),
    depthByNodeId,
    groupIds,
    groupChildren: Object.fromEntries(
      groupIds.map((groupId) => [
        groupId,
        stableNodes.filter((node) => node.parentId === groupId).map((node) => node.id),
      ]),
    ),
    treeChanges,
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

function nodeDepth(nodes: TreeNodePayload[], nodeId: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let depth = 0;
  let cursor = byId.get(nodeId);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    depth += 1;
    cursor = byId.get(cursor.parentId);
  }
  return depth;
}
