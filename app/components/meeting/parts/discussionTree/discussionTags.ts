// tree.update のノード kind と語彙を一致させる。バックエンド（analysis.delta / fixtures）が
// 出す kind は topic / issue / question / risk / decision。未知の kind は topic にフォールバックする。
export const tagStyle: Record<string, { bg: string; fg: string }> = {
  topic: { bg: "var(--tag-topic-bg)", fg: "var(--tag-topic-fg)" },
  issue: { bg: "var(--tag-idea-bg)", fg: "var(--tag-idea-fg)" },
  question: { bg: "var(--tag-counter-bg)", fg: "var(--tag-counter-fg)" },
  risk: { bg: "var(--tag-concern-bg)", fg: "var(--tag-concern-fg)" },
  decision: { bg: "var(--tag-policy-bg)", fg: "var(--tag-policy-fg)" },
};
