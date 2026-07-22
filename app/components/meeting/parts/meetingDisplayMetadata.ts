import type { AgendaAnchorPayload } from "~/api/aiAnalysis/aiAnalysisApi";
import type { MeetingSegmentDto } from "~/api/meetings/meetingEventsApi";
import type { AnalysisItem, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

export type MeetingMomentIndex = {
  byId: Map<string, MeetingSegmentDto>;
  bySequence: Map<number, MeetingSegmentDto>;
};

export function buildMeetingMomentIndex(segments: MeetingSegmentDto[]): MeetingMomentIndex {
  return {
    byId: new Map(segments.map((segment) => [segment.segment_id, segment])),
    bySequence: new Map(segments.map((segment) => [segment.seq, segment])),
  };
}

export function analysisItemMomentLabel(item: AnalysisItem, index: MeetingMomentIndex) {
  const candidates = [
    ...(item.linked_segment_ids ?? []).map((id) => index.byId.get(id)),
    ...(item.evidenceSequenceNos ?? []).map((sequence) => index.bySequence.get(sequence)),
    ...(item.resolutionEvidenceSequenceNos ?? []).map((sequence) => index.bySequence.get(sequence)),
    ...(item.reopenEvidenceSequenceNos ?? []).map((sequence) => index.bySequence.get(sequence)),
  ].filter((segment): segment is MeetingSegmentDto => segment !== undefined);
  return formatLatestMeetingMoment(candidates);
}

export function treeNodeMomentLabel(
  node: TreeNodePayload,
  analysisItems: AnalysisItem[],
  index: MeetingMomentIndex,
) {
  const directSegments = [
    ...(node.segment_id ? [index.byId.get(node.segment_id)] : []),
    ...(node.linked_segment_ids ?? []).map((id) => index.byId.get(id)),
    ...(node.evidenceSequenceNos ?? []).map((sequence) => index.bySequence.get(sequence)),
  ].filter((segment): segment is MeetingSegmentDto => segment !== undefined);
  const directLabel = formatLatestMeetingMoment(directSegments);
  if (directLabel) {
    return directLabel;
  }

  const relatedIds = new Set([node.id, ...(node.relatedItemIds ?? [])]);
  const relatedLabels = analysisItems
    .filter((item) => relatedIds.has(item.id))
    .map((item) => analysisItemMomentLabel(item, index))
    .filter((label): label is string => Boolean(label));
  return relatedLabels.at(-1) ?? "";
}

function formatLatestMeetingMoment(segments: MeetingSegmentDto[]) {
  if (segments.length === 0) {
    return "";
  }
  const latest = segments.reduce((current, candidate) =>
    candidate.start_ms >= current.start_ms ? candidate : current,
  );
  return `経過 ${formatElapsedTime(latest.start_ms)}`;
}

export function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(totalMinutes)}:${twoDigits(seconds)}`;
}

export function buildAgendaLabelMap(
  nodes: TreeNodePayload[] = [],
  anchors: AgendaAnchorPayload[] = [],
) {
  const labels = new Map<string, string>();
  for (const node of nodes) {
    const label = node.label?.trim();
    if (label && label !== node.id) {
      labels.set(node.id, label);
    }
  }
  for (const anchor of anchors) {
    const label = anchor.originalTitle.trim();
    if (label) {
      labels.set(anchor.agendaId, label);
    }
  }
  return labels;
}

export function humanizeAgendaReferences(value: string, labels: Map<string, string>) {
  let result = value;
  const entries = [...labels.entries()].sort(([left], [right]) => right.length - left.length);
  for (const [id, label] of entries) {
    if (!id || !result.includes(id)) {
      continue;
    }
    result = result.replace(
      new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(id)}(?![A-Za-z0-9_-])`, "g"),
      label,
    );
  }
  return result.replace(/\bagenda[-_](\d+)\b/gi, (_, number: string) => `議題${Number(number)}`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
