import type { MeetingRealtimeEventDto, MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { MeetingDto } from "~/api/meetings/meetingsApi";
import type {
  AnalysisDeltaPayload,
  AnalysisItem,
  MeetingRuntimeAction,
  MeetingRuntimeState,
  MeetingStatePayload,
  RuntimeErrorPayload,
  RuntimePartial,
  RuntimeSpeakerSummary,
  SpeakerSummaryPayload,
  TranscriptFinalPayload,
  TranscriptPartialPayload,
  TreeUpdatePayload,
} from "~/api/meetings/meetingRuntimeTypes";

export const initialMeetingRuntimeState: MeetingRuntimeState = {
  meeting: null,
  connectionStatus: "idle",
  meetingState: {},
  segments: [],
  partials: {},
  analysisItems: [],
  tree: null,
  speakerSummaries: [],
  events: [],
  lastSeq: 0,
  error: null,
};

export function meetingRuntimeReducer(
  state: MeetingRuntimeState,
  action: MeetingRuntimeAction,
): MeetingRuntimeState {
  switch (action.type) {
    case "loading":
      return { ...state, connectionStatus: "loading", error: null };
    case "loaded": {
      let next: MeetingRuntimeState = {
        ...initialMeetingRuntimeState,
        meeting: action.meeting,
        segments: mergeSegments([], action.segments),
        connectionStatus: "connecting",
      };
      for (const event of action.events) {
        next = applyRuntimeEvent(next, event);
      }
      return next;
    }
    case "resynced": {
      let next: MeetingRuntimeState = {
        ...state,
        meeting: mergeMeetingSnapshot(state.meeting, action.meeting),
        segments: mergeSegments(state.segments, action.segments),
        error: null,
      };
      for (const event of [...action.events].sort(
        (left, right) => (left.seq ?? 0) - (right.seq ?? 0),
      )) {
        next = applyRuntimeEvent(next, event);
      }
      return next;
    }
    case "connection":
      return { ...state, connectionStatus: action.status };
    case "event":
      return applyRuntimeEvent(state, action.event);
    case "error":
      return { ...state, connectionStatus: "error", error: action.message };
    case "reset":
      return initialMeetingRuntimeState;
    default:
      return state;
  }
}

function applyRuntimeEvent(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  // REST再同期とWebSocket catch-upが競合しても、適用済みsequenceのイベントで
  // tree/meeting.state等を古い状態へ巻き戻さない。
  if (event.seq && event.seq <= state.lastSeq) {
    return state;
  }
  const nextSeq = event.seq && event.seq > state.lastSeq ? event.seq : state.lastSeq;
  const nextEvents = event.seq ? upsertEvent(state.events, event) : state.events;
  const base = { ...state, events: nextEvents, lastSeq: nextSeq };

  switch (event.type) {
    case "meeting.state":
      return applyMeetingState(base, event);
    case "transcript.partial":
      return applyTranscriptPartial(base, event);
    case "transcript.final":
      return applyTranscriptFinal(base, event);
    case "analysis.delta":
      return applyAnalysisDelta(base, event);
    case "tree.update":
      return { ...base, tree: asObject<TreeUpdatePayload>(event.payload) };
    case "speaker.summary.delta":
      return applySpeakerSummary(base, event);
    case "error":
      return applyRuntimeError(base, event);
    default:
      return base;
  }
}

function applyMeetingState(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  const payload = asObject<MeetingStatePayload>(event.payload);
  return {
    ...state,
    meetingState: { ...state.meetingState, ...payload },
    meeting: state.meeting
      ? {
          ...state.meeting,
          status: payload.status ?? state.meeting.status,
          updated_at: new Date(event.ts_ms).toISOString(),
          ...(payload.status === "ended"
            ? { ended_at: state.meeting.ended_at || new Date(event.ts_ms).toISOString() }
            : {}),
        }
      : state.meeting,
  };
}

function applyTranscriptPartial(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  const payload = asObject<TranscriptPartialPayload>(event.payload);
  const partialId = payload.partial_id;
  if (!partialId) {
    return state;
  }
  const partial: RuntimePartial = {
    ...payload,
    partial_id: partialId,
    ts_ms: event.ts_ms,
  };
  return {
    ...state,
    partials: {
      ...state.partials,
      [partialId]: partial,
    },
  };
}

function applyTranscriptFinal(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  const payload = asObject<TranscriptFinalPayload>(event.payload);
  const segmentId = payload.segment_id ?? `seg_${event.seq ?? event.ts_ms}`;
  const segment: MeetingSegmentDto = {
    meeting_id: event.meeting_id,
    seq: event.seq ?? state.lastSeq,
    segment_id: segmentId,
    speaker_label: payload.speaker_label ?? "Speaker",
    text: payload.text ?? "",
    start_ms: payload.start_ms ?? 0,
    end_ms: payload.end_ms ?? payload.start_ms ?? 0,
    created_at: new Date(event.ts_ms).toISOString(),
  };
  const partials = { ...state.partials };
  for (const [partialId, partial] of Object.entries(partials)) {
    if (
      partial.speaker_label === segment.speaker_label &&
      partial.text &&
      segment.text.startsWith(partial.text)
    ) {
      delete partials[partialId];
    }
  }
  return {
    ...state,
    partials,
    segments: mergeSegments(state.segments, [segment]),
  };
}

function applyAnalysisDelta(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  const payload = asObject<AnalysisDeltaPayload>(event.payload);
  let items = [...state.analysisItems];
  for (const delta of payload.items ?? []) {
    const item = delta.item;
    const id = delta.id ?? item?.id;
    if (!id) {
      continue;
    }
    if (delta.op === "remove") {
      items = items.filter((current) => current.id !== id);
      continue;
    }
    if (!item) {
      continue;
    }
    const normalized: AnalysisItem = {
      id: item.id,
      kind: item.kind ?? "issue",
      severity: item.severity ?? "medium",
      title: item.title ?? "Untitled insight",
      body: item.body ?? "",
      status: item.status ?? "open",
      linked_segment_ids: item.linked_segment_ids ?? [],
    };
    const index = items.findIndex((current) => current.id === normalized.id);
    if (index >= 0) {
      items[index] = { ...items[index], ...normalized };
    } else {
      items.push(normalized);
    }
  }
  return { ...state, analysisItems: items };
}

function applySpeakerSummary(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  const payload = asObject<SpeakerSummaryPayload>(event.payload);
  const speakerLabel = payload.speaker_label;
  if (!speakerLabel) {
    return state;
  }
  const summary: RuntimeSpeakerSummary = {
    speaker_label: speakerLabel,
    claims: payload.summary?.claims ?? [],
    questions: payload.summary?.questions ?? [],
    todos: payload.summary?.todos ?? [],
  };
  const summaries = [...state.speakerSummaries];
  const index = summaries.findIndex((item) => item.speaker_label === speakerLabel);
  if (index >= 0) {
    summaries[index] = summary;
  } else {
    summaries.push(summary);
  }
  return { ...state, speakerSummaries: summaries };
}

function applyRuntimeError(state: MeetingRuntimeState, event: MeetingRealtimeEventDto) {
  const payload = asObject<RuntimeErrorPayload>(event.payload);
  return {
    ...state,
    error: payload.message ?? payload.code ?? "リアルタイム処理でエラーが発生しました。",
  };
}

function upsertEvent(events: MeetingRealtimeEventDto[], event: MeetingRealtimeEventDto) {
  if (!event.seq) {
    return events;
  }
  const next = events.filter((current) => current.seq !== event.seq);
  next.push(event);
  next.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return next;
}

function mergeSegments(current: MeetingSegmentDto[], incoming: MeetingSegmentDto[]) {
  const byId = new Map<string, MeetingSegmentDto>();
  for (const segment of current) {
    byId.set(segment.segment_id, segment);
  }
  for (const segment of incoming) {
    byId.set(segment.segment_id, segment);
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

function mergeMeetingSnapshot(current: MeetingDto | null, incoming: MeetingDto) {
  if (!current) {
    return incoming;
  }
  if (current.status === "ended" && incoming.status !== "ended") {
    return current;
  }
  const currentUpdatedAt = Date.parse(current.updated_at);
  const incomingUpdatedAt = Date.parse(incoming.updated_at);
  if (
    !Number.isNaN(currentUpdatedAt) &&
    !Number.isNaN(incomingUpdatedAt) &&
    incomingUpdatedAt < currentUpdatedAt
  ) {
    return current;
  }
  return { ...current, ...incoming };
}

function asObject<T>(payload: Record<string, unknown> | unknown): T {
  if (payload && typeof payload === "object") {
    return payload as T;
  }
  return {} as T;
}
