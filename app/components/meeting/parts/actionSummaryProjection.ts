import type { AnalysisItem, TreeNodePayload } from "~/api/meetings/meetingRuntimeTypes";

export type ActionSummaryProjectionRow = {
  id: string;
  agendaId: string;
  sourceAgendaIds: string[];
  canonicalItemId: string;
  title: string;
  targetLabel: string;
  openIssueCount: number;
  questionCount: number;
};

// Builds one logical action view from every legacy/new action-summary source.
// It never creates React Flow nodes and globally deduplicates representatives.
export function buildActionSummaryProjection(
  nodes: TreeNodePayload[],
  analysisItems: AnalysisItem[],
): ActionSummaryProjectionRow[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceAgendaIds = new Set<string>();
  const legacyRelatedItems = new Set<string>();
  for (const node of nodes) {
    if (node.agendaRole !== "action_summary") {
      continue;
    }
    for (const agendaId of node.agendaRefs ?? []) {
      sourceAgendaIds.add(agendaId);
    }
    for (const itemId of node.relatedItemIds ?? []) {
      legacyRelatedItems.add(itemId);
    }
  }
  for (const item of analysisItems) {
    for (const agendaId of item.relatedAgendaIds ?? []) {
      sourceAgendaIds.add(agendaId);
    }
  }
  const sortedSourceAgendaIds = [...sourceAgendaIds].sort();
  if (sortedSourceAgendaIds.length === 0) {
    return [];
  }

  const related = analysisItems.filter(
    (item) =>
      legacyRelatedItems.has(item.id) ||
      (item.relatedAgendaIds ?? []).some((agendaId) => sourceAgendaIds.has(agendaId)),
  );
  const eligible = (item: AnalysisItem) =>
    item.status !== "resolved" &&
    item.status !== "dismissed" &&
    item.classificationStatus !== "tentative" &&
    item.classificationStatus !== "unclassified";
  const activeTodos = related.filter((item) => item.kind === "todo" && eligible(item));
  const activeOpenIssues = related.filter((item) => item.kind === "open_issue" && eligible(item));

  const topicFor = (itemId: string): TreeNodePayload | undefined => {
    const seen = new Set<string>();
    let current = nodeById.get(itemId)?.parentId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const node = nodeById.get(current);
      if (!node) {
        return undefined;
      }
      if (node.kind === "topic") {
        return node;
      }
      current = node.parentId;
    }
    return undefined;
  };
  const sameCluster = (left: AnalysisItem, right: AnalysisItem) => {
    if (
      left.candidateTopicId &&
      right.candidateTopicId &&
      left.candidateTopicId === right.candidateTopicId
    ) {
      return true;
    }
    const leftParent = nodeById.get(left.id)?.parentId;
    const rightParent = nodeById.get(right.id)?.parentId;
    if (leftParent && leftParent === rightParent && nodeById.get(leftParent)?.kind === "group") {
      return true;
    }
    const leftTopic = topicFor(left.id)?.id;
    if (!leftTopic || leftTopic !== topicFor(right.id)?.id) {
      return false;
    }
    const similarity = projectionTextSimilarity(
      `${left.title} ${left.body}`,
      `${right.title} ${right.body}`,
    );
    return similarity >= 0.3 || (similarity >= 0.12 && evidenceWithin(left, right, 2));
  };

  const representatives: AnalysisItem[] = [];
  for (const todo of activeTodos) {
    if (!representatives.some((item) => item.id === todo.id || sameCluster(item, todo))) {
      representatives.push(todo);
    }
  }
  for (const issue of activeOpenIssues) {
    const representedByTodo = activeTodos.some((todo) => sameCluster(todo, issue));
    if (
      !representedByTodo &&
      !representatives.some((item) => item.id === issue.id || sameCluster(item, issue))
    ) {
      representatives.push(issue);
    }
  }

  return representatives.map((representative) => {
    const companions = analysisItems.filter(
      (item) => item.id !== representative.id && sameCluster(representative, item),
    );
    return {
      id: `action:${representative.id}`,
      agendaId: sortedSourceAgendaIds[0],
      sourceAgendaIds: sortedSourceAgendaIds,
      canonicalItemId: representative.id,
      title: representative.title,
      targetLabel: topicFor(representative.id)?.label ?? "議論ツリー",
      openIssueCount:
        (representative.kind === "open_issue" ? 1 : 0) +
        companions.filter((item) => item.kind === "open_issue" && item.status !== "resolved")
          .length,
      questionCount: companions.filter(
        (item) => item.kind === "question" && item.status !== "resolved",
      ).length,
    };
  });
}

function evidenceWithin(left: AnalysisItem, right: AnalysisItem, maxDistance: number) {
  return (left.evidenceSequenceNos ?? []).some((leftSequence) =>
    (right.evidenceSequenceNos ?? []).some(
      (rightSequence) => Math.abs(leftSequence - rightSequence) <= maxDistance,
    ),
  );
}

function projectionTextSimilarity(left: string, right: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s、。！？!?・「」『』（）()\-_/]/g, "")
      .replace(/未確定|未解決|決定する|確認する|検討する|方針|対応/g, "");
  const leftKey = normalize(left);
  const rightKey = normalize(right);
  if (!leftKey || !rightKey) {
    return 0;
  }
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
    return Math.min(leftKey.length, rightKey.length) / Math.max(leftKey.length, rightKey.length);
  }
  const bigrams = (value: string) => {
    const values = new Map<string, number>();
    for (let index = 0; index + 1 < value.length; index += 1) {
      const gram = value.slice(index, index + 2);
      values.set(gram, (values.get(gram) ?? 0) + 1);
    }
    return values;
  };
  const leftBigrams = bigrams(leftKey);
  const rightBigrams = bigrams(rightKey);
  let intersection = 0;
  for (const [gram, count] of leftBigrams) {
    intersection += Math.min(count, rightBigrams.get(gram) ?? 0);
  }
  const leftTotal = [...leftBigrams.values()].reduce((sum, count) => sum + count, 0);
  const rightTotal = [...rightBigrams.values()].reduce((sum, count) => sum + count, 0);
  return leftTotal + rightTotal === 0 ? 0 : (2 * intersection) / (leftTotal + rightTotal);
}
