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

export type AnalysisItemKind = "issue" | "question" | "risk" | string;
export type AnalysisItemSeverity = "low" | "medium" | "high" | string;
export type AnalysisItemStatus = "open" | "updated" | "resolved" | "dismissed" | string;

export type AnalysisItem = {
  id: string;
  kind: AnalysisItemKind;
  severity: AnalysisItemSeverity;
  title: string;
  body: string;
  status: AnalysisItemStatus;
  linked_segment_ids?: string[];
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
  label?: string;
  status?: string;
  description?: string;
  relatedItemIds?: string[];
  speaker_label?: string;
  segment_id?: string;
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
  | { type: "connection"; status: MeetingConnectionStatus }
  | { type: "event"; event: MeetingRealtimeEventDto }
  | { type: "error"; message: string }
  | { type: "reset" };
