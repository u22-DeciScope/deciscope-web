import type { LiveAnalysisPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSessionDto } from "~/api/meetingSessions/meetingSessionsApi";
import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeNodePayload,
  TreeUpdatePayload,
} from "~/api/meetings/meetingRuntimeTypes";
import type { TranscriptSegment } from "~/api/transcripts/transcriptSegmentsApi";

// ログイン前に表示する読み取り専用の会議履歴サンプル。
// バックエンドの初回ワークスペース用サンプルと同じシナリオ・現行データ契約に揃える。

export const publicSampleSession: MeetingSessionDto = {
  sessionId: "session_public_sample",
  meetingId: "meeting_public_sample",
  title: "【サンプル】価格改定方針の検討会議",
  displayTitle: "【サンプル】価格改定方針の検討会議",
  userProvidedTitle: "【サンプル】価格改定方針の検討会議",
  graphTitle: "価格改定検討MTG",
  titleSource: "user_input",
  provider: "teams",
  organizerName: "田中 PM",
  organizerEmail: "tanaka@deciscope.local",
  purpose:
    "来期の価格改定方針を決める。値上げの対象顧客・値上げ率・適用開始時期を決定し、対象顧客リストの作成につなげる。",
  context:
    "昨年から原価が上昇しており、価格据え置きでは利益率が悪化している。中小顧客は解約リスクが高い点が懸念。",
  agenda: "1. 値上げ対象顧客の範囲\n2. 値上げ率\n3. 適用タイミング",
  customInstruction: "財務影響は数値で示すこと",
  status: "ended",
  requestedAt: "2026-07-18T00:58:00Z",
  joinedAt: "2026-07-18T01:00:00Z",
  endedAt: "2026-07-18T01:32:00Z",
  createdAt: "2026-07-18T00:58:00Z",
  updatedAt: "2026-07-18T01:32:00Z",
  endReason: "organizer_ended",
};

const transcriptRows = [
  [
    1,
    "田中 PM",
    20,
    "本日は来期の価格改定方針を決めたいと思います。最初の論点は値上げの対象顧客の範囲です。",
  ],
  [
    2,
    "佐藤 営業",
    65,
    "エンタープライズ顧客は値上げの余地がありますが、中小顧客は解約リスクが高いと感じています。",
  ],
  [
    3,
    "鈴木 財務",
    130,
    "財務的には全体で8パーセントの値上げを想定していますが、段階的な適用でも問題ありません。",
  ],
  [4, "田中 PM", 210, "まず対象をエンタープライズ顧客に限定する案はどうでしょうか。"],
  [
    5,
    "佐藤 営業",
    265,
    "既存契約の更新タイミングが顧客ごとにばらつくのが懸念です。一斉適用は難しいかもしれません。",
  ],
  [6, "鈴木 財務", 340, "更新月にあわせて段階的に適用すれば、解約は最小化できると思います。"],
  [
    7,
    "田中 PM",
    420,
    "ではエンタープライズ向けに更新月から8パーセント、中小顧客は据え置きで決定とします。",
  ],
  [8, "佐藤 営業", 485, "承知しました。対象顧客のリストを今週中に展開します。"],
] as const;

export const publicSampleTranscriptSegments: TranscriptSegment[] = transcriptRows.map(
  ([sequenceNo, speakerName, offsetSeconds, text]) => ({
    eventId: `public-sample-event-${sequenceNo}`,
    sessionId: publicSampleSession.sessionId,
    callId: publicSampleSession.sessionId,
    sequenceNo,
    speakerLabel: speakerName,
    speakerName,
    recognizedAtUtc: new Date(
      Date.parse("2026-07-18T01:00:00Z") + offsetSeconds * 1000,
    ).toISOString(),
    offsetTicks: offsetSeconds * 10_000_000,
    durationTicks: 80_000_000,
    text,
    isFinal: true,
  }),
);

export const publicSampleAnalysisItems: AnalysisItem[] = [
  {
    id: "issue-target-scope",
    kind: "issue",
    subtype: "discussion",
    severity: "high",
    title: "値上げ対象顧客の範囲",
    body: "値上げ対象を全体にするかを検討し、エンタープライズ顧客に限定することで合意しました。",
    status: "resolved",
    informationStatus: "grounded",
    classificationStatus: "assigned",
    evidenceSequenceNos: [1, 2, 4, 7],
    relatedAgendaIds: ["agenda-1"],
  },
  {
    id: "risk-smb-churn",
    kind: "risk",
    severity: "medium",
    title: "中小顧客の解約リスク",
    body: "中小顧客への値上げは解約につながる懸念があり、今回は据え置きとして回避しました。",
    status: "resolved",
    informationStatus: "grounded",
    classificationStatus: "assigned",
    evidenceSequenceNos: [2, 7],
    relatedAgendaIds: ["agenda-1"],
  },
  {
    id: "decision-ent-repricing",
    kind: "decision",
    severity: "high",
    title: "ENTは更新月から8%値上げ・中小は据え置き",
    body: "エンタープライズ顧客は契約更新月から8%値上げし、中小顧客は当面据え置きとします。",
    status: "open",
    informationStatus: "grounded",
    classificationStatus: "assigned",
    evidenceSequenceNos: [3, 7],
    relatedAgendaIds: ["agenda-1", "agenda-2", "agenda-3"],
  },
  {
    id: "question-renewal-timing",
    kind: "issue",
    subtype: "question",
    severity: "medium",
    title: "契約更新タイミングのばらつき",
    body: "顧客ごとに契約更新月が異なるため、更新月にあわせて段階適用します。",
    status: "resolved",
    informationStatus: "grounded",
    classificationStatus: "assigned",
    evidenceSequenceNos: [5, 6],
    relatedAgendaIds: ["agenda-3"],
  },
  {
    id: "risk-revenue-timing",
    kind: "risk",
    severity: "low",
    title: "値上げ効果の発現遅延",
    body: "段階適用のため、値上げ効果が全顧客に行き渡るまで最長1年かかります。",
    status: "open",
    informationStatus: "grounded",
    classificationStatus: "assigned",
    evidenceSequenceNos: [6],
    relatedAgendaIds: ["agenda-3"],
  },
  {
    id: "todo-customer-list",
    kind: "todo",
    severity: "medium",
    title: "対象顧客リストの展開",
    body: "佐藤が値上げ対象顧客リストを今週中に作成して共有します。",
    status: "open",
    informationStatus: "grounded",
    classificationStatus: "assigned",
    evidenceSequenceNos: [8],
    relatedAgendaIds: ["agenda-3"],
  },
];

export const publicSampleTreeNodes: TreeNodePayload[] = [
  {
    id: "root",
    kind: "topic",
    label: "【サンプル】価格改定方針の検討会議",
    status: "open",
    description: "来期の価格改定方針を決め、対象顧客リストの作成につなげる。",
    origin: "system",
  },
  {
    id: "topic-price-scope",
    kind: "topic",
    parentId: "root",
    label: "値上げ対象顧客の範囲",
    status: "resolved",
    description: "値上げ対象とする顧客セグメントの検討。",
    origin: "agenda",
    agendaRefs: ["agenda-1"],
    materialized: true,
  },
  {
    id: "topic-price-rate",
    kind: "topic",
    parentId: "root",
    label: "値上げ率",
    status: "resolved",
    description: "原価上昇を踏まえた値上げ率の検討。",
    origin: "agenda",
    agendaRefs: ["agenda-2"],
    materialized: true,
  },
  {
    id: "topic-price-rollout",
    kind: "topic",
    parentId: "root",
    label: "適用タイミング",
    status: "resolved",
    description: "契約更新月にあわせた段階適用の検討。",
    origin: "agenda",
    agendaRefs: ["agenda-3"],
    materialized: true,
  },
  ...publicSampleAnalysisItems.map((item) => ({
    id: item.id,
    kind: item.kind === "open_issue" || item.kind === "question" ? "issue" : item.kind,
    ...(item.subtype ? { subtype: item.subtype } : {}),
    parentId:
      item.id === "issue-target-scope" || item.id === "risk-smb-churn"
        ? "topic-price-scope"
        : item.id === "decision-ent-repricing"
          ? "topic-price-rate"
          : "topic-price-rollout",
    label: item.title,
    status: item.status,
    description: item.body,
    relatedItemIds: [item.id],
    evidenceSequenceNos: item.evidenceSequenceNos,
  })),
];

export const publicSampleTreeEdges: TreeEdgePayload[] = publicSampleTreeNodes.flatMap((node) =>
  node.parentId
    ? [{ id: `edge-${node.parentId}-${node.id}`, source: node.parentId, target: node.id }]
    : [],
);

export const publicSampleTree: TreeUpdatePayload = {
  version: 8,
  mode: "snapshot",
  nodes: publicSampleTreeNodes,
  edges: publicSampleTreeEdges,
};

const publicSampleLivePayload: LiveAnalysisPayload = {
  summary:
    "値上げ対象顧客の範囲・値上げ率・適用タイミングを議論し、エンタープライズ顧客は更新月から8%値上げ、中小顧客は据え置きとすることで合意しました。",
  currentTopic: "会議終了",
  items: publicSampleAnalysisItems,
  tree: publicSampleTree,
  treeVersion: 8,
  payloadKind: "full_snapshot",
  nodeCount: publicSampleTreeNodes.length,
  edgeCount: publicSampleTreeEdges.length,
  agendaAnchors: [
    {
      agendaId: "agenda-1",
      originalTitle: "値上げ対象顧客の範囲",
      order: 1,
      role: "primary",
      status: "discussed",
      materializedTopicIds: ["topic-price-scope"],
    },
    {
      agendaId: "agenda-2",
      originalTitle: "値上げ率",
      order: 2,
      role: "primary",
      status: "discussed",
      materializedTopicIds: ["topic-price-rate"],
    },
    {
      agendaId: "agenda-3",
      originalTitle: "適用タイミング",
      order: 3,
      role: "primary",
      status: "discussed",
      materializedTopicIds: ["topic-price-rollout"],
    },
  ],
  agendaProgress: {
    entries: [
      {
        id: "agenda-1",
        sourceType: "fixed_agenda",
        title: "値上げ対象顧客の範囲",
        order: 1,
        computedStatus: "discussed",
        effectiveStatus: "discussed",
        outcomeStatus: "concluded",
        discussionWeight: 1,
        relatedItemCounts: { issue: 1, risk: 1 },
        focusNodeIds: ["topic-price-scope", "issue-target-scope", "risk-smb-churn"],
        materializedTopicIds: ["topic-price-scope"],
        primaryNodeId: "topic-price-scope",
        linkState: "materialized-topic",
      },
      {
        id: "agenda-2",
        sourceType: "fixed_agenda",
        title: "値上げ率",
        order: 2,
        computedStatus: "discussed",
        effectiveStatus: "discussed",
        outcomeStatus: "concluded",
        discussionWeight: 0.72,
        relatedItemCounts: { decision: 1 },
        focusNodeIds: ["topic-price-rate", "decision-ent-repricing"],
        materializedTopicIds: ["topic-price-rate"],
        primaryNodeId: "topic-price-rate",
        linkState: "materialized-topic",
      },
      {
        id: "agenda-3",
        sourceType: "fixed_agenda",
        title: "適用タイミング",
        order: 3,
        computedStatus: "discussed",
        effectiveStatus: "discussed",
        outcomeStatus: "concluded",
        discussionWeight: 0.86,
        relatedItemCounts: { issue: 1, risk: 1, todo: 1 },
        focusNodeIds: [
          "topic-price-rollout",
          "question-renewal-timing",
          "risk-revenue-timing",
          "todo-customer-list",
        ],
        materializedTopicIds: ["topic-price-rollout"],
        primaryNodeId: "topic-price-rollout",
        linkState: "materialized-topic",
      },
    ],
  },
};

export const publicSampleLiveAnalysis: MeetingAIAnalysis = {
  sessionId: publicSampleSession.sessionId,
  analysisType: "live",
  status: "completed",
  version: 8,
  payload: publicSampleLivePayload,
  model: "sample",
  updatedAtUtc: "2026-07-18T01:30:00Z",
};

const earlyLiveItems: AnalysisItem[] = [
  {
    ...publicSampleAnalysisItems[0],
    status: "open",
    body: "値上げ対象を全顧客にするか、エンタープライズ顧客に限定するかを検討しています。",
    evidenceSequenceNos: [1, 2],
  },
  {
    ...publicSampleAnalysisItems[1],
    status: "open",
    body: "中小顧客では値上げによる解約リスクが高いという懸念が出ています。",
    evidenceSequenceNos: [2],
  },
];

const middleLiveItems: AnalysisItem[] = [
  {
    ...publicSampleAnalysisItems[0],
    status: "open",
    body: "値上げ対象はエンタープライズ顧客に限定する方向で議論が進んでいます。",
    evidenceSequenceNos: [1, 2, 4],
  },
  earlyLiveItems[1],
  {
    ...publicSampleAnalysisItems[3],
    status: "open",
    body: "既存契約の更新月が顧客ごとに異なるため、一斉適用が難しい点を確認しています。",
    evidenceSequenceNos: [5],
  },
];

function publicSampleLiveVersion({
  version,
  updatedAtUtc,
  currentTopic,
  summary,
  items,
}: {
  version: number;
  updatedAtUtc: string;
  currentTopic: string;
  summary: string;
  items: AnalysisItem[];
}): MeetingAIAnalysis {
  return {
    sessionId: publicSampleSession.sessionId,
    analysisType: "live",
    status: "completed",
    version,
    payload: {
      ...publicSampleLivePayload,
      summary,
      currentTopic,
      items,
    },
    model: "sample",
    updatedAtUtc,
  };
}

// 実際の履歴画面は保存済みのライブ分析版を順に比較し、「カードの更新」を再構築する。
// 公開サンプルにも同じ入力を渡し、追加・変更の履歴を現行UIで描画する。
export const publicSampleLiveHistory: MeetingAIAnalysis[] = [
  publicSampleLiveVersion({
    version: 3,
    updatedAtUtc: "2026-07-18T01:08:00Z",
    currentTopic: "値上げ対象顧客の範囲",
    summary: "値上げ対象の範囲と、中小顧客の解約リスクを検討しています。",
    items: earlyLiveItems,
  }),
  publicSampleLiveVersion({
    version: 5,
    updatedAtUtc: "2026-07-18T01:18:00Z",
    currentTopic: "適用タイミング",
    summary: "対象をエンタープライズ顧客に絞り、契約更新月に合わせた適用方法を検討しています。",
    items: middleLiveItems,
  }),
  publicSampleLiveAnalysis,
];

export const publicSampleFinalAnalysis: MeetingAIAnalysis = {
  analysisType: "final",
  status: "completed",
  version: 1,
  model: "sample",
  updatedAtUtc: "2026-07-18T01:33:00Z",
  payload: {
    suggestedTitle: "来期価格改定方針の決定",
    overview:
      "来期の価格改定方針を決める会議。原価上昇で利益率が悪化している前提を共有し、値上げ対象と適用方法を議論しました。\n中小顧客は解約リスクを考慮して対象から外し、エンタープライズ顧客に限定して契約更新月から8%の値上げを段階適用することで合意しました。",
    decisions: [
      { text: "エンタープライズ顧客は契約更新月から8%値上げする", importance: "high" },
      { text: "中小顧客の価格は当面据え置く", importance: "medium" },
    ],
    actionItems: [
      {
        text: "値上げ対象顧客リストの作成と展開",
        owner: "佐藤 営業",
        due: "今週中",
        priority: "high",
      },
    ],
    openIssues: ["値上げ効果が全顧客に行き渡るまで最長1年かかる"],
    keyPoints: [
      "原価上昇により価格据え置きでは利益率が悪化している",
      "契約更新月にあわせた段階適用で解約リスクを最小化する",
    ],
    nextMeetingTopics: ["中小顧客向け価格の再検討時期", "顧客向けアナウンス方法"],
  },
};
