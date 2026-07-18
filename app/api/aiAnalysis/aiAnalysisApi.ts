import { requestJson } from "~/api/core/apiClient";
import type {
  AnalysisItem,
  TreeEdgePayload,
  TreeChangesPayload,
  TreeNodePayload,
  TreeUpdatePayload,
} from "~/api/meetings/meetingRuntimeTypes";

export type MeetingAIAnalysisType = "live" | "final";
export type MeetingAIAnalysisStatus = "running" | "completed" | "failed";
export type MeetingAIAnalysisImportance = "high" | "medium" | "low";

// ライブ分析payload v2。items/treeは既存の analysis.delta / tree.update の語彙
// (AnalysisItem / TreeUpdatePayload)と互換の形に正規化して保持する。
// 旧v1形式(decisions/actionItems/openQuestions/concerns/nextChecks)は
// normalizeLivePayload 内で items/tree に合成される(後方互換)。
export type LiveAnalysisPayload = {
  summary?: string;
  currentTopic?: string;
  items: AnalysisItem[];
  tree: TreeUpdatePayload | null;
  treeVersion?: number;
  treeChanges?: TreeChangesPayload;
  degraded?: boolean;
  degradedReason?: string;
  treeIntegrity?: TreeIntegrityDiagnostics;
  // full snapshotメタデータ(サーバー付与)。removedNodeIds/mergedNodeIdsは
  // 「前versionから消えたノード」の明示的な説明で、これに無い大量削除は
  // クライアント側でlast-known-good treeを保持する判断材料になる。
  payloadKind?: string;
  nodeCount?: number;
  edgeCount?: number;
  removedNodeIds?: string[];
  mergedNodeIds?: string[];
  treeHash?: string;
  basedOnTreeVersion?: number;
};

export type TreeIntegrityDiagnostics = {
  valid?: boolean;
  duplicateNodeIds?: string[];
  crossKindIdCollisions?: string[];
  reservedItemIds?: string[];
  selfParentNodeIds?: string[];
  missingFixedAgendaIds?: string[];
  movedFixedAgendaIds?: string[];
  fixedAgendaKindMismatchIds?: string[];
  actionSummaryTreeNodeIds?: string[];
  expectedFixedAgendaCount?: number;
  actualFixedAgendaCount?: number;
  clientDuplicateNodeIds?: string[];
  clientCrossKindIdCollisions?: string[];
};

export type FinalSummaryDecision = {
  text: string;
  importance?: MeetingAIAnalysisImportance;
};

export type FinalSummaryActionItem = {
  text: string;
  owner?: string;
  due?: string;
  priority?: MeetingAIAnalysisImportance;
};

export type FinalSummaryPayload = {
  suggestedTitle?: string;
  overview?: string;
  decisions: FinalSummaryDecision[];
  actionItems: FinalSummaryActionItem[];
  openIssues: string[];
  keyPoints: string[];
  nextMeetingTopics: string[];
};

export type MeetingAIAnalysis = {
  sessionId?: string;
  analysisType: MeetingAIAnalysisType;
  status: MeetingAIAnalysisStatus;
  version: number;
  payload: LiveAnalysisPayload | FinalSummaryPayload | null;
  model?: string;
  updatedAtUtc?: string;
  error?: string;
  // live分析のWSイベントに載る次回更新までの目安秒数(live時のみ)。
  intervalSeconds?: number;
};

// 会議終了時にバックエンドが保存するdurableなツリースナップショット。
// 履歴画面はライブpayloadより先にこれを表示する。
export type TreeSnapshotPayload = {
  treeVersion?: number;
  reason?: string;
  final?: boolean;
  generatedAtUtc?: string;
  tree: TreeUpdatePayload | null;
  degraded?: boolean;
  degradedReason?: string;
  treeIntegrity?: TreeIntegrityDiagnostics;
};

export type MeetingAIAnalyses = {
  sessionId: string;
  live: MeetingAIAnalysis | null;
  final: MeetingAIAnalysis | null;
  // 会議終了時に保存されたdurableツリースナップショット(未保存ならnull)。
  treeSnapshot: TreeSnapshotPayload | null;
  // GETレスポンスのトップレベルに載るlive分析の更新間隔(秒)。
  liveIntervalSeconds?: number;
};

const workspaceMeetingSessionsPath = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId.trim())}/meeting-sessions`;

const workspaceMeetingSessionAIAnalysesPath = (workspaceId: string, sessionId: string) =>
  `${workspaceMeetingSessionsPath(workspaceId)}/${encodeURIComponent(sessionId.trim())}/ai-analyses`;

export async function getWorkspaceMeetingSessionAIAnalyses(
  workspaceId: string,
  sessionId: string,
): Promise<MeetingAIAnalyses> {
  const payload = await requestJson<unknown>(
    workspaceMeetingSessionAIAnalysesPath(workspaceId, sessionId),
  );
  return normalizeAIAnalyses(payload, sessionId);
}

export function normalizeAIAnalysis(value: unknown): MeetingAIAnalysis | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const analysisType = isMeetingAIAnalysisType(source.analysisType) ? source.analysisType : null;
  const status = isMeetingAIAnalysisStatus(source.status) ? source.status : null;
  if (!analysisType || !status) {
    return null;
  }
  const sessionId = optionalString(source.sessionId) ?? optionalString(source.session_id);
  const version = optionalNumber(source.version) ?? 0;
  const model = optionalString(source.model);
  const updatedAtUtc = optionalString(source.updatedAtUtc) ?? optionalString(source.updated_at_utc);
  const error = optionalString(source.error)?.trim();
  const intervalSeconds =
    optionalPositiveNumber(source.intervalSeconds) ??
    optionalPositiveNumber(source.interval_seconds);
  const payload =
    analysisType === "live"
      ? normalizeLivePayload(source.payload)
      : normalizeFinalPayload(source.payload);

  return {
    ...(sessionId ? { sessionId } : {}),
    analysisType,
    status,
    version,
    payload,
    ...(model ? { model } : {}),
    ...(updatedAtUtc ? { updatedAtUtc } : {}),
    ...(error ? { error } : {}),
    ...(intervalSeconds !== undefined ? { intervalSeconds } : {}),
  };
}

function normalizeAIAnalyses(value: unknown, fallbackSessionId: string): MeetingAIAnalyses {
  if (!value || typeof value !== "object") {
    return { sessionId: fallbackSessionId, live: null, final: null, treeSnapshot: null };
  }
  const source = value as Record<string, unknown>;
  const sessionId =
    optionalString(source.sessionId) ?? optionalString(source.session_id) ?? fallbackSessionId;
  const liveIntervalSeconds =
    optionalPositiveNumber(source.liveIntervalSeconds) ??
    optionalPositiveNumber(source.live_interval_seconds);
  return {
    sessionId,
    live: normalizeAIAnalysis(source.live),
    final: normalizeAIAnalysis(source.final),
    treeSnapshot: normalizeTreeSnapshot(source.tree),
    ...(liveIntervalSeconds !== undefined ? { liveIntervalSeconds } : {}),
  };
}

// tree行(durableスナップショット)のpayloadを正規化する。payloadは
// {treeVersion, reason, final, generatedAtUtc, tree:{nodes,edges}} 形式。
function normalizeTreeSnapshot(value: unknown): TreeSnapshotPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const analysis = value as Record<string, unknown>;
  const payload = analysis.payload;
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const source = payload as Record<string, unknown>;
  const treeSource = source.tree;
  let tree: TreeUpdatePayload | null = null;
  if (treeSource && typeof treeSource === "object") {
    const treeRecord = treeSource as Record<string, unknown>;
    const nodes = normalizeTreeNodes(treeRecord.nodes, new Set<string>());
    if (nodes.length > 0) {
      tree = { nodes, edges: normalizeTreeEdges(treeRecord.edges) };
    }
  }
  if (!tree) {
    return null;
  }
  const treeVersion = optionalNumber(source.treeVersion);
  const reason = optionalString(source.reason);
  const generatedAtUtc = optionalString(source.generatedAtUtc);
  const degradedReason = optionalString(source.degradedReason)?.trim();
  const treeIntegrity = normalizeTreeIntegrity(source.treeIntegrity);
  return {
    ...(treeVersion !== undefined ? { treeVersion } : {}),
    ...(reason ? { reason } : {}),
    ...(typeof source.final === "boolean" ? { final: source.final } : {}),
    ...(generatedAtUtc ? { generatedAtUtc } : {}),
    ...(source.degraded === true ? { degraded: true } : {}),
    ...(degradedReason ? { degradedReason } : {}),
    ...(treeIntegrity ? { treeIntegrity } : {}),
    tree,
  };
}

function normalizeLivePayload(value: unknown): LiveAnalysisPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const summary = optionalString(source.summary)?.trim();
  const currentTopic = optionalString(source.currentTopic)?.trim();
  const items = Array.isArray(source.items)
    ? normalizeLiveAnalysisItems(source.items)
    : legacyLiveAnalysisItems(source);
  const itemIds = new Set(items.map((item) => item.id));
  const clientIntegrity = {
    duplicateNodeIds: [] as string[],
    crossKindIdCollisions: [] as string[],
  };
  const tree =
    normalizeLiveTree(source.tree, itemIds, clientIntegrity) ??
    synthesizeLiveTree(currentTopic, items);
  const treeVersion = optionalNumber(source.treeVersion);
  const treeChanges = normalizeTreeChanges(source.treeChanges);
  const serverIntegrity = normalizeTreeIntegrity(source.treeIntegrity);
  const clientDegraded = clientIntegrity.duplicateNodeIds.length > 0;
  const degraded = source.degraded === true || clientDegraded;
  const treeIntegrity =
    serverIntegrity || clientDegraded
      ? {
          ...(serverIntegrity ?? {}),
          ...(clientIntegrity.duplicateNodeIds.length > 0
            ? { clientDuplicateNodeIds: clientIntegrity.duplicateNodeIds }
            : {}),
          ...(clientIntegrity.crossKindIdCollisions.length > 0
            ? { clientCrossKindIdCollisions: clientIntegrity.crossKindIdCollisions }
            : {}),
        }
      : undefined;
  const payloadKind = optionalString(source.payloadKind)?.trim();
  const nodeCount = optionalNumber(source.nodeCount);
  const edgeCount = optionalNumber(source.edgeCount);
  const removedNodeIds = normalizeStringArray(source.removedNodeIds);
  const mergedNodeIds = normalizeStringArray(source.mergedNodeIds);
  const treeHash = optionalString(source.treeHash)?.trim();
  const basedOnTreeVersion = optionalNumber(source.basedOnTreeVersion);
  return {
    ...(summary ? { summary } : {}),
    ...(currentTopic ? { currentTopic } : {}),
    items,
    tree,
    ...(treeVersion !== undefined ? { treeVersion } : {}),
    ...(treeChanges ? { treeChanges } : {}),
    ...(degraded ? { degraded: true } : {}),
    ...(optionalString(source.degradedReason)?.trim()
      ? { degradedReason: optionalString(source.degradedReason)?.trim() }
      : clientDegraded
        ? { degradedReason: "duplicate_node_id_filtered" }
        : {}),
    ...(treeIntegrity ? { treeIntegrity } : {}),
    ...(payloadKind ? { payloadKind } : {}),
    ...(nodeCount !== undefined ? { nodeCount } : {}),
    ...(edgeCount !== undefined ? { edgeCount } : {}),
    ...(removedNodeIds.length > 0 ? { removedNodeIds } : {}),
    ...(mergedNodeIds.length > 0 ? { mergedNodeIds } : {}),
    ...(treeHash ? { treeHash } : {}),
    ...(basedOnTreeVersion !== undefined ? { basedOnTreeVersion } : {}),
  };
}

function normalizeTreeChanges(value: unknown): TreeChangesPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const treeVersion = optionalNumber(source.treeVersion);
  if (treeVersion === undefined) {
    return undefined;
  }
  const changes: TreeChangesPayload = { treeVersion };
  for (const [key, raw] of Object.entries({
    newNodeIds: source.newNodeIds,
    updatedNodeIds: source.updatedNodeIds,
    reparentedNodeIds: source.reparentedNodeIds,
    resolvedNodeIds: source.resolvedNodeIds,
    promotedNodeIds: source.promotedNodeIds,
  })) {
    const ids = [...new Set(normalizeStringArray(raw))];
    if (ids.length > 0) {
      changes[key as keyof Omit<TreeChangesPayload, "treeVersion">] = ids;
    }
  }
  return changes;
}

function normalizeLiveAnalysisItems(value: unknown[]): AnalysisItem[] {
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const source = item as Record<string, unknown>;
      const title = optionalString(source.title)?.trim() ?? "";
      const body = optionalString(source.body)?.trim() ?? "";
      if (!title && !body) {
        return null;
      }
      const id = optionalString(source.id)?.trim() || `live-item-${index}`;
      const kind = optionalString(source.kind)?.trim() || "issue";
      const severity = optionalString(source.severity)?.trim() || "medium";
      const status = optionalString(source.status)?.trim() || "open";
      const evidenceSequenceNos = normalizeNumberArray(source.evidenceSequenceNos);
      const resolutionEvidenceSequenceNos = normalizeNumberArray(
        source.resolutionEvidenceSequenceNos,
      );
      const reopenEvidenceSequenceNos = normalizeNumberArray(source.reopenEvidenceSequenceNos);
      const resolvedAtVersion = optionalNumber(source.resolvedAtVersion);
      const reopenedAtVersion = optionalNumber(source.reopenedAtVersion);
      const resolutionReason = optionalString(source.resolutionReason);
      const reopenReason = optionalString(source.reopenReason);
      const relatedAgendaIds = normalizeStringArray(source.relatedAgendaIds);
      const classificationStatus = optionalString(source.classificationStatus)?.trim();
      const candidateTopicId = optionalString(source.candidateTopicId)?.trim();
      return {
        id,
        kind,
        severity,
        title: title || truncateItemTitle(body),
        body,
        status,
        ...(evidenceSequenceNos.length > 0 ? { evidenceSequenceNos } : {}),
        ...(resolvedAtVersion !== undefined ? { resolvedAtVersion } : {}),
        ...(resolutionEvidenceSequenceNos.length > 0 ? { resolutionEvidenceSequenceNos } : {}),
        ...(resolutionReason ? { resolutionReason } : {}),
        ...(reopenedAtVersion !== undefined ? { reopenedAtVersion } : {}),
        ...(reopenEvidenceSequenceNos.length > 0 ? { reopenEvidenceSequenceNos } : {}),
        ...(reopenReason ? { reopenReason } : {}),
        ...(relatedAgendaIds.length > 0 ? { relatedAgendaIds } : {}),
        ...(classificationStatus ? { classificationStatus } : {}),
        ...(candidateTopicId ? { candidateTopicId } : {}),
        ...(typeof source.candidateInactive === "boolean"
          ? { candidateInactive: source.candidateInactive }
          : {}),
      };
    })
    .filter((item): item is AnalysisItem => item !== null);
}

// 旧v1形式のライブ分析payloadから items を合成する(後方互換)。
// concerns→risk / openQuestions→question / decisions→decision / actionItems→todo。
function legacyLiveAnalysisItems(source: Record<string, unknown>): AnalysisItem[] {
  const items: AnalysisItem[] = [];

  normalizeStringArray(source.concerns).forEach((text, index) => {
    items.push(legacyLiveAnalysisItem("risk", index, text));
  });
  normalizeStringArray(source.openQuestions).forEach((text, index) => {
    items.push(legacyLiveAnalysisItem("question", index, text));
  });
  legacyTextObjects(source.decisions).forEach(({ text }, index) => {
    items.push(legacyLiveAnalysisItem("decision", index, text));
  });
  legacyTextObjects(source.actionItems).forEach(({ text, owner, due }, index) => {
    const suffix = [owner, due].filter(Boolean).join(" / ");
    items.push(legacyLiveAnalysisItem("todo", index, text, suffix ? `${text}(${suffix})` : text));
  });

  return items;
}

function legacyLiveAnalysisItem(
  kind: string,
  index: number,
  text: string,
  body = text,
): AnalysisItem {
  return {
    id: `legacy-${kind}-${index}`,
    kind,
    severity: "medium",
    title: truncateItemTitle(text),
    body,
    status: "open",
  };
}

function legacyTextObjects(value: unknown): Array<{ text: string; owner?: string; due?: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const source = item as Record<string, unknown>;
      const text = optionalString(source.text)?.trim();
      if (!text) {
        return null;
      }
      const owner = optionalString(source.owner)?.trim();
      const due = optionalString(source.due)?.trim();
      return {
        text,
        ...(owner ? { owner } : {}),
        ...(due ? { due } : {}),
      };
    })
    .filter((item): item is { text: string; owner?: string; due?: string } => item !== null);
}

function truncateItemTitle(text: string, maxLength = 25) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

function normalizeLiveTree(
  value: unknown,
  itemIds: Set<string>,
  integrity?: { duplicateNodeIds: string[]; crossKindIdCollisions: string[] },
): TreeUpdatePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const nodes = normalizeTreeNodes(source.nodes, itemIds, integrity);
  if (nodes.length === 0) {
    return null;
  }
  return { nodes, edges: normalizeTreeEdges(source.edges) };
}

function normalizeTreeNodes(
  value: unknown,
  itemIds: Set<string>,
  integrity?: { duplicateNodeIds: string[]; crossKindIdCollisions: string[] },
): TreeNodePayload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed = value
    .map((node) => {
      if (!node || typeof node !== "object") {
        return null;
      }
      const source = node as Record<string, unknown>;
      const id = optionalString(source.id)?.trim();
      if (!id) {
        return null;
      }
      const kind = optionalString(source.kind)?.trim();
      const parentId =
        optionalString(source.parentId)?.trim() ?? optionalString(source.parent_id)?.trim();
      const label = optionalString(source.label)?.trim();
      const status = optionalString(source.status)?.trim();
      const description = truncateNodeDescription(
        optionalString(source.description)?.trim() ?? optionalString(source.summary)?.trim() ?? "",
      );
      const relatedItemIds = normalizeRelatedItemIds(source, id, itemIds);
      const origin = optionalString(source.origin)?.trim();
      const agendaRole = optionalString(source.agendaRole)?.trim();
      return {
        id,
        ...(kind ? { kind } : {}),
        ...(parentId ? { parentId } : {}),
        ...(label ? { label } : {}),
        ...(status ? { status } : {}),
        ...(description ? { description } : {}),
        ...(relatedItemIds.length > 0 ? { relatedItemIds } : {}),
        ...(origin ? { origin } : {}),
        ...(agendaRole ? { agendaRole } : {}),
      };
    })
    .filter((node): node is TreeNodePayload => node !== null);
  const selected = new Map<string, TreeNodePayload>();
  const order: string[] = [];
  for (const node of parsed) {
    const existing = selected.get(node.id);
    if (!existing) {
      selected.set(node.id, node);
      order.push(node.id);
      continue;
    }
    if (integrity) {
      if (!integrity.duplicateNodeIds.includes(node.id)) {
        integrity.duplicateNodeIds.push(node.id);
      }
      if (existing.kind !== node.kind && !integrity.crossKindIdCollisions.includes(node.id)) {
        integrity.crossKindIdCollisions.push(node.id);
      }
    }
    if (treeNodeIdentityPriority(node) > treeNodeIdentityPriority(existing)) {
      selected.set(node.id, node);
    }
  }
  return order
    .map((id) => selected.get(id))
    .filter((node): node is TreeNodePayload => Boolean(node));
}

function treeNodeIdentityPriority(node: TreeNodePayload) {
  const fixedAgenda =
    node.kind === "topic" &&
    node.agendaRole !== "action_summary" &&
    (node.origin === "agenda" || /^agenda-\d+$/.test(node.id));
  if (fixedAgenda) {
    return 100;
  }
  if (node.id === "root" && node.kind === "topic") {
    return 90;
  }
  if (node.kind === "topic") {
    return 60;
  }
  if (node.kind === "group") {
    return 50;
  }
  return 10;
}

function normalizeTreeIntegrity(value: unknown): TreeIntegrityDiagnostics | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const stringArrays: Array<keyof TreeIntegrityDiagnostics> = [
    "duplicateNodeIds",
    "crossKindIdCollisions",
    "reservedItemIds",
    "selfParentNodeIds",
    "missingFixedAgendaIds",
    "movedFixedAgendaIds",
    "fixedAgendaKindMismatchIds",
    "actionSummaryTreeNodeIds",
  ];
  const diagnostics: TreeIntegrityDiagnostics = {};
  if (typeof source.valid === "boolean") {
    diagnostics.valid = source.valid;
  }
  for (const key of stringArrays) {
    const values = normalizeStringArray(source[key]);
    if (values.length > 0) {
      diagnostics[key] = values as never;
    }
  }
  const expected = optionalNumber(source.expectedFixedAgendaCount);
  const actual = optionalNumber(source.actualFixedAgendaCount);
  if (expected !== undefined) {
    diagnostics.expectedFixedAgendaCount = expected;
  }
  if (actual !== undefined) {
    diagnostics.actualFixedAgendaCount = actual;
  }
  return diagnostics;
}

function normalizeRelatedItemIds(
  source: Record<string, unknown>,
  nodeId: string,
  itemIds: Set<string>,
): string[] {
  const rawIds = [
    ...normalizeStringArray(source.relatedItemIds),
    ...normalizeStringArray(source.related_item_ids),
    ...normalizeStringArray(source.linkedItemIds),
    ...normalizeStringArray(source.sourceItemIds),
  ];
  const normalized: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!id || !itemIds.has(id) || seen.has(id)) {
      return;
    }
    seen.add(id);
    normalized.push(id);
  };
  add(nodeId);
  rawIds.forEach(add);
  return normalized;
}

function truncateNodeDescription(value: string, maxLength = 120) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

function normalizeTreeEdges(value: unknown): TreeEdgePayload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((edge) => {
      if (!edge || typeof edge !== "object") {
        return null;
      }
      const source = edge as Record<string, unknown>;
      const from = optionalString(source.source)?.trim();
      const to = optionalString(source.target)?.trim();
      if (!from || !to) {
        return null;
      }
      const id = optionalString(source.id)?.trim() || `edge-${from}-${to}`;
      return { id, source: from, target: to };
    })
    .filter((edge): edge is TreeEdgePayload => edge !== null);
}

// treeが無くitemsがある場合、currentTopicをtopicノードにして
// itemsへ放射状にedgeを張った簡易ツリーを合成する。
function synthesizeLiveTree(
  currentTopic: string | undefined,
  items: AnalysisItem[],
): TreeUpdatePayload | null {
  if (items.length === 0) {
    return null;
  }
  const topicNode: TreeNodePayload = {
    id: "topic-current",
    kind: "topic",
    label: currentTopic || "現在のトピック",
  };
  const itemNodes: TreeNodePayload[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    label: item.title,
    status: item.status,
    ...(item.body ? { description: truncateNodeDescription(item.body) } : {}),
    relatedItemIds: [item.id],
  }));
  const edges: TreeEdgePayload[] = items.map((item) => ({
    id: `edge-${topicNode.id}-${item.id}`,
    source: topicNode.id,
    target: item.id,
  }));
  return { nodes: [topicNode, ...itemNodes], edges };
}

function normalizeFinalPayload(value: unknown): FinalSummaryPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const suggestedTitle = optionalString(source.suggestedTitle)?.trim();
  const overview = optionalString(source.overview)?.trim();
  return {
    ...(suggestedTitle ? { suggestedTitle } : {}),
    ...(overview ? { overview } : {}),
    decisions: normalizeFinalDecisions(source.decisions),
    actionItems: normalizeFinalActionItems(source.actionItems),
    openIssues: normalizeStringArray(source.openIssues),
    keyPoints: normalizeStringArray(source.keyPoints),
    nextMeetingTopics: normalizeStringArray(source.nextMeetingTopics),
  };
}

function normalizeFinalDecisions(value: unknown): FinalSummaryDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const source = item as Record<string, unknown>;
      const text = optionalString(source.text)?.trim();
      if (!text) {
        return null;
      }
      const importance = isMeetingAIAnalysisImportance(source.importance)
        ? source.importance
        : undefined;
      return {
        text,
        ...(importance ? { importance } : {}),
      };
    })
    .filter((item): item is FinalSummaryDecision => item !== null);
}

function normalizeFinalActionItems(value: unknown): FinalSummaryActionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const source = item as Record<string, unknown>;
      const text = optionalString(source.text)?.trim();
      if (!text) {
        return null;
      }
      const owner = optionalString(source.owner)?.trim();
      const due = optionalString(source.due)?.trim();
      const priority = isMeetingAIAnalysisImportance(source.priority) ? source.priority : undefined;
      return {
        text,
        ...(owner ? { owner } : {}),
        ...(due ? { due } : {}),
        ...(priority ? { priority } : {}),
      };
    })
    .filter((item): item is FinalSummaryActionItem => item !== null);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is number => typeof item === "number" && Number.isSafeInteger(item) && item > 0,
  );
}

function isMeetingAIAnalysisType(value: unknown): value is MeetingAIAnalysisType {
  return value === "live" || value === "final";
}

function isMeetingAIAnalysisStatus(value: unknown): value is MeetingAIAnalysisStatus {
  return value === "running" || value === "completed" || value === "failed";
}

function isMeetingAIAnalysisImportance(value: unknown): value is MeetingAIAnalysisImportance {
  return value === "high" || value === "medium" || value === "low";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalPositiveNumber(value: unknown) {
  const parsed = optionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}
