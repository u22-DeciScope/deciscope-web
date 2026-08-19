import type { AgendaProgressPayload, MeetingAIAnalysis } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type {
  AnalysisItem,
  RuntimePartial,
  RuntimeSpeakerSummary,
  TreeEdgePayload,
  TreeNodePayload,
} from "~/api/meetings/meetingRuntimeTypes";

// 公開トップページの「会議中の画面」プレビューに流し込むデモデータ。
//
// 会議画面と同じコンポーネント(MeetingChatPanel / DiscussionTree /
// MeetingAssistantPanel)へそのまま渡すため、APIのDTO型で書く。型が変われば
// typecheckで落ちるので、プレビューだけが実装から取り残されることを防げる。

const previewMeetingId = "preview-meeting";

// created_at と ts_ms を空(0)にしているのは意図的。値を入れると
// MeetingChatPanel が toLocaleTimeString で壁時計の時刻を出すため、
// 表示がタイムゾーン依存になる。空にすると start_ms からの経過時間
// (MM:SS)へフォールバックし、どの環境でも同じ表示になる。
export const previewSegments: MeetingSegmentDto[] = [
  {
    meeting_id: previewMeetingId,
    seq: 141,
    segment_id: "preview-seg-141",
    speaker_label: "佐藤",
    speaker_name: "佐藤",
    text: "初回設定で離脱する人が多いので、入力項目を減らしたいです。",
    start_ms: 848_000,
    end_ms: 856_000,
    created_at: "",
  },
  {
    meeting_id: previewMeetingId,
    seq: 142,
    segment_id: "preview-seg-142",
    speaker_label: "田中",
    speaker_name: "田中",
    text: "必須なのはチーム名と目的だけでも良さそうですね。ただ、後から設定する項目に気づけるかは気になります。",
    start_ms: 871_000,
    end_ms: 882_000,
    created_at: "",
  },
  {
    meeting_id: previewMeetingId,
    seq: 143,
    segment_id: "preview-seg-143",
    speaker_label: "鈴木",
    speaker_name: "鈴木",
    text: "では、最初は3ステップに絞って効果を見ましょう。",
    start_ms: 902_000,
    end_ms: 909_000,
    created_at: "",
  },
];

// 認識途中の発言。タイムライン末尾に「認識中」の行が出る。
export const previewPartials: RuntimePartial[] = [
  {
    partial_id: "preview-partial-1",
    speaker_label: "鈴木",
    text: "検証の担当は私が持ちます",
    start_ms: 915_000,
    ts_ms: 0,
  },
];

export const previewTreeNodes: TreeNodePayload[] = [
  {
    id: "preview-topic-1",
    kind: "topic",
    label: "初回設定の離脱をどう減らすか",
    status: "open",
    description: "初回設定の完了率が想定より低い。入力項目の多さが要因ではないかという見立て。",
    evidenceSequenceNos: [141],
    linked_segment_ids: ["preview-seg-141"],
  },
  {
    id: "preview-issue-1",
    kind: "issue",
    subtype: "discussion",
    parentId: "preview-topic-1",
    label: "入力項目を必須だけに絞るか",
    status: "open",
    description: "必須をチーム名と目的だけにする案。",
    relatedItemIds: ["preview-item-1"],
    evidenceSequenceNos: [142],
    linked_segment_ids: ["preview-seg-142"],
  },
  {
    id: "preview-risk-1",
    kind: "risk",
    parentId: "preview-topic-1",
    label: "後から設定する項目が分かりづらい",
    status: "open",
    description: "省略した項目にあとで気づけないと、設定が未完了のまま使われる。",
    relatedItemIds: ["preview-item-2"],
    evidenceSequenceNos: [142],
    linked_segment_ids: ["preview-seg-142"],
  },
  {
    id: "preview-decision-1",
    kind: "decision",
    parentId: "preview-issue-1",
    label: "3ステップ版を来週から検証",
    status: "resolved",
    description: "初回設定を3ステップに絞った版を用意し、完了率を比較する。",
    relatedItemIds: ["preview-item-3"],
    evidenceSequenceNos: [143],
    linked_segment_ids: ["preview-seg-143"],
  },
];

export const previewTreeEdges: TreeEdgePayload[] = [
  { id: "preview-edge-1", source: "preview-topic-1", target: "preview-issue-1" },
  { id: "preview-edge-2", source: "preview-topic-1", target: "preview-risk-1" },
  { id: "preview-edge-3", source: "preview-issue-1", target: "preview-decision-1" },
];

export const previewAnalysisItems: AnalysisItem[] = [
  {
    id: "preview-item-1",
    kind: "issue",
    subtype: "discussion",
    severity: "medium",
    title: "必須項目をどこまで削るか",
    body: "チーム名と目的だけを必須にする案が出ています。削る範囲はまだ決まっていません。",
    status: "open",
    informationStatus: "grounded",
    evidenceSequenceNos: [142],
    linked_segment_ids: ["preview-seg-142"],
  },
  {
    id: "preview-item-2",
    kind: "risk",
    severity: "high",
    title: "省略した設定に気づけない",
    body: "後から設定する項目への導線がないと、未完了のまま使われる可能性があります。",
    status: "open",
    informationStatus: "grounded",
    evidenceSequenceNos: [142],
    linked_segment_ids: ["preview-seg-142"],
  },
  {
    id: "preview-item-3",
    kind: "decision",
    severity: "medium",
    title: "3ステップ版で効果を検証する",
    body: "初回設定を3ステップに絞った版を来週から検証し、完了率を比較します。",
    status: "resolved",
    informationStatus: "grounded",
    evidenceSequenceNos: [143],
    linked_segment_ids: ["preview-seg-143"],
  },
  {
    id: "preview-item-4",
    kind: "todo",
    severity: "low",
    title: "検証の担当と期間を決める",
    body: "計測期間と担当者が未確定です。",
    status: "open",
    evidenceSequenceNos: [143],
    linked_segment_ids: ["preview-seg-143"],
  },
];

const previewAgendaProgress: AgendaProgressPayload = {
  effectiveCurrentTopicId: "preview-agenda-2",
  computedCurrentTopicId: "preview-agenda-2",
  entries: [
    {
      id: "preview-agenda-1",
      sourceType: "fixed_agenda",
      title: "現状の離脱要因",
      order: 1,
      computedStatus: "discussed",
      effectiveStatus: "discussed",
      outcomeStatus: "concluded",
      focusNodeIds: ["preview-topic-1"],
      materializedTopicIds: ["preview-topic-1"],
      primaryNodeId: "preview-topic-1",
      linkState: "materialized-topic",
    },
    {
      id: "preview-agenda-2",
      sourceType: "fixed_agenda",
      title: "改善案の優先順位",
      order: 2,
      computedStatus: "discussing",
      effectiveStatus: "discussing",
      focusNodeIds: ["preview-issue-1", "preview-risk-1"],
      materializedTopicIds: ["preview-issue-1"],
      primaryNodeId: "preview-issue-1",
      linkState: "materialized-topic",
    },
    {
      id: "preview-agenda-3",
      sourceType: "fixed_agenda",
      title: "検証方法と担当",
      order: 3,
      computedStatus: "not_started",
      effectiveStatus: "not_started",
      focusNodeIds: [],
      linkState: "not-linkable",
    },
  ],
};

export const previewLiveAnalysis: MeetingAIAnalysis = {
  analysisType: "live",
  status: "completed",
  version: 12,
  payload: {
    summary: "初回設定の離脱要因を整理し、必須項目を絞る方向で検証に入ろうとしています。",
    currentTopic: "改善案の優先順位",
    items: previewAnalysisItems,
    tree: null,
    treeVersion: 12,
    agendaProgress: previewAgendaProgress,
  },
};

export const previewSpeakerSummaries: RuntimeSpeakerSummary[] = [
  {
    speaker_label: "佐藤",
    claims: ["初回設定の入力項目が離脱の要因になっている"],
    questions: [],
    todos: [],
  },
  {
    speaker_label: "田中",
    claims: ["必須はチーム名と目的だけでよい"],
    questions: ["省略した項目に後から気づける導線はあるか"],
    todos: [],
  },
  {
    speaker_label: "鈴木",
    claims: ["まず3ステップに絞って効果を見る"],
    questions: [],
    todos: ["検証の担当と期間を決める"],
  },
];

export const previewAnalysisVersion = 12;
export const previewTreeVersion = 12;
