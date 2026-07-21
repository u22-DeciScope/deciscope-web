import type { MeetingRealtimeEventDto, MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { MeetingDto } from "~/api/meetings/meetingsApi";

export type MeetingStatePayload = {
  status?: string;
  recording?: boolean;
  analyzing?: boolean;
  participants?: string[];
};

export type TranscriptPartialPayload = {
  partial_id?: string;
  speaker_label?: string;
  text?: string;
  start_ms?: number;
};

export type TranscriptFinalPayload = {
  segment_id?: string;
  speaker_label?: string;
  text?: string;
  start_ms?: number;
  end_ms?: number;
};

export type AnalysisItemKind =
  | "issue"
  | "open_issue"
  | "question"
  | "risk"
  | "fact"
  | "decision"
  | "todo"
  | string;
export type AnalysisItemSeverity = "low" | "medium" | "high" | string;
export type AnalysisItemStatus = "open" | "updated" | "resolved" | "dismissed" | string;

export type AnalysisItem = {
  id: string;
  kind: AnalysisItemKind;
  subtype?: "discussion" | "confirmation" | "question" | "investigation" | string;
  severity: AnalysisItemSeverity;
  title: string;
  body: string;
  status: AnalysisItemStatus;
  informationStatus?: "grounded" | "tentative" | string;
  inactive?: boolean;
  suppressionReason?: string;
  linked_segment_ids?: string[];
  evidenceSequenceNos?: number[];
  resolvedAtVersion?: number;
  resolutionEvidenceSequenceNos?: number[];
  resolutionReason?: string;
  reopenedAtVersion?: number;
  reopenEvidenceSequenceNos?: number[];
  reopenReason?: string;
  // primary parentとは別の横断agenda参照。複数親edgeには変換しない。
  relatedAgendaIds?: string[];
  // サーバー管理の分類状態。tentativeは通常のtree nodeとして描画せず、
  // 候補論点のstaging件数として扱う。
  classificationStatus?: "assigned" | "tentative" | "unclassified" | string;
  candidateTopicId?: string;
  candidateInactive?: boolean;
};

export type AnalysisDeltaPayload = {
  items?: Array<{
    op?: "add" | "update" | "remove" | string;
    item?: AnalysisItem;
    id?: string;
  }>;
};

export type TreeNodePayload = {
  id: string;
  kind?: string;
  subtype?: "discussion" | "confirmation" | "question" | "investigation" | string;
  // parentId はバックエンドが正規化した唯一のツリー表示用の親。
  // 存在する場合、フロントはエッジから親を推論せずこれを使う。
  parentId?: string;
  label?: string;
  status?: string;
  description?: string;
  relatedItemIds?: string[];
  origin?: string;
  agendaRole?: "primary" | "action_summary" | string;
  agendaRefs?: string[];
  mergedFromNodeIds?: string[];
  agendaSplitGroupId?: string;
  materialized?: boolean;
  speaker_label?: string;
  segment_id?: string;
  linked_segment_ids?: string[];
  evidenceSequenceNos?: number[];
};

export type TreeEdgePayload = {
  id: string;
  source: string;
  target: string;
  kind?: string;
};

export type TreeUpdatePayload = {
  version?: number;
  mode?: string;
  nodes?: TreeNodePayload[];
  edges?: TreeEdgePayload[];
};

export type TreeChangesPayload = {
  treeVersion: number;
  newNodeIds?: string[];
  updatedNodeIds?: string[];
  reparentedNodeIds?: string[];
  resolvedNodeIds?: string[];
  promotedNodeIds?: string[];
};

export type SpeakerSummaryPayload = {
  speaker_label?: string;
  summary?: {
    claims?: string[];
    questions?: string[];
    todos?: string[];
  };
};

export type RuntimeErrorPayload = {
  code?: string;
  message?: string;
  retryable?: boolean;
};

export type RuntimePartial = TranscriptPartialPayload & {
  partial_id: string;
  ts_ms: number;
};

export type RuntimeSpeakerSummary = {
  speaker_label: string;
  claims: string[];
  questions: string[];
  todos: string[];
};

export type MeetingConnectionStatus =
  | "idle"
  | "loading"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

export type MeetingRuntimeState = {
  meeting: MeetingDto | null;
  connectionStatus: MeetingConnectionStatus;
  meetingState: MeetingStatePayload;
  segments: MeetingSegmentDto[];
  partials: Record<string, RuntimePartial>;
  analysisItems: AnalysisItem[];
  tree: TreeUpdatePayload | null;
  speakerSummaries: RuntimeSpeakerSummary[];
  events: MeetingRealtimeEventDto[];
  lastSeq: number;
  error: string | null;
};

export type MeetingRuntimeAction =
  | { type: "loading" }
  | {
      type: "loaded";
      meeting: MeetingDto;
      events: MeetingRealtimeEventDto[];
      segments: MeetingSegmentDto[];
    }
  | {
      type: "resynced";
      meeting: MeetingDto;
      events: MeetingRealtimeEventDto[];
      segments: MeetingSegmentDto[];
    }
  | { type: "connection"; status: MeetingConnectionStatus }
  | { type: "event"; event: MeetingRealtimeEventDto }
  | { type: "error"; message: string }
  | { type: "reset" };
