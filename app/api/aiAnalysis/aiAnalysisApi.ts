import { requestJson } from "~/api/core/apiClient";
import type {
  AnalysisItem,
  TreeEdgePayload,
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

export type MeetingAIAnalyses = {
  sessionId: string;
  live: MeetingAIAnalysis | null;
  final: MeetingAIAnalysis | null;
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
    return { sessionId: fallbackSessionId, live: null, final: null };
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
    ...(liveIntervalSeconds !== undefined ? { liveIntervalSeconds } : {}),
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
  const tree = normalizeLiveTree(source.tree) ?? synthesizeLiveTree(currentTopic, items);
  return {
    ...(summary ? { summary } : {}),
    ...(currentTopic ? { currentTopic } : {}),
    items,
    tree,
  };
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
      return {
        id,
        kind,
        severity,
        title: title || truncateItemTitle(body),
        body,
        status,
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

function normalizeLiveTree(value: unknown): TreeUpdatePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const nodes = normalizeTreeNodes(source.nodes);
  if (nodes.length === 0) {
    return null;
  }
  return { nodes, edges: normalizeTreeEdges(source.edges) };
}

function normalizeTreeNodes(value: unknown): TreeNodePayload[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
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
      const label = optionalString(source.label)?.trim();
      return {
        id,
        ...(kind ? { kind } : {}),
        ...(label ? { label } : {}),
      };
    })
    .filter((node): node is TreeNodePayload => node !== null);
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
