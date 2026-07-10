// AI分析の種別(issue/question/risk/decision/todo/topic)ごとの表示色を一元管理する。
// AIアシスタントパネルのカード(旧 insightStyle)と議論ツリーのタグ・ノード(旧 tagStyle /
// NodeDetailCard フォールバック)が別々に色を定義していたため、種別ごとの色が食い違って
// いた(question はカード青・ノード紫、issue はカード琥珀・ノード紫)。
// カード側の色を正として揃えるが、issue は todo(--badge-action-*)と同系の琥珀
// (--ai-point-*)であるため、そのまま踏襲すると「カードとノードの一致」は満たせても
// issue と todo が両方とも同じ琥珀になり、カード・ツリーの両方で見分けが付かなくなる。
// 「同一種別はカードとノードで同じ色になること」を最優先しつつ、種別間の視認性も保つため、
// issue は既存のツリー側の紫(--tag-idea-*)を正としてカード側をそちらに合わせた。
export type AnalysisKindColor = {
  bg: string;
  fg: string;
  border: string;
};

export const analysisKindPalette: Record<string, AnalysisKindColor> = {
  topic: {
    bg: "var(--tag-topic-bg)",
    fg: "var(--tag-topic-fg)",
    border: "color-mix(in srgb, var(--tag-topic-fg) 35%, transparent)",
  },
  issue: {
    bg: "var(--tag-idea-bg)",
    fg: "var(--tag-idea-fg)",
    border: "color-mix(in srgb, var(--tag-idea-fg) 35%, transparent)",
  },
  question: {
    bg: "var(--ai-quest-bg)",
    fg: "var(--ai-quest-fg)",
    border: "var(--ai-quest-border)",
  },
  risk: {
    bg: "var(--ai-risk-bg)",
    fg: "var(--ai-risk-fg)",
    border: "var(--ai-risk-border)",
  },
  decision: {
    bg: "var(--badge-decision-bg)",
    fg: "var(--badge-decision-fg)",
    border: "var(--ds-border)",
  },
  todo: {
    bg: "var(--badge-action-bg)",
    fg: "var(--badge-action-fg)",
    border: "var(--ai-point-border)",
  },
};

const defaultAnalysisKind = "issue";

export function analysisKindColor(kind?: string | null): AnalysisKindColor {
  return analysisKindPalette[kind ?? defaultAnalysisKind] ?? analysisKindPalette[defaultAnalysisKind];
}

// 種別(kind)の日本語表示ラベル。AIアシスタントパネルのカードで定義されていた
// 表記(旧 insightKindLabels)を正として一元化し、議論ツリー側(タグ・ノード・
// 関連チップ)で英語のkindがそのまま表示されていた不整合を解消する。
// 未知のkindはフォールバックとして生の値をそのまま表示する。
export const analysisKindLabels: Record<string, string> = {
  topic: "トピック",
  issue: "論点",
  question: "質問",
  risk: "リスク",
  decision: "決定",
  todo: "TODO",
};

export function analysisKindLabel(kind?: string | null): string {
  if (kind == null) {
    return "";
  }
  return analysisKindLabels[kind] ?? kind;
}

// resolved(解決済)を示す共通バッジの配色。種別色(analysisKindColor)とは独立して
// 緑系(--badge-decision-*)で統一し、「解決済」であることが種別の色相に関わらず
// 一目でわかるようにする。ノード・カード・チップの全箇所で同じ色を使う。
export const resolvedBadgeColor = {
  bg: "var(--badge-decision-bg)",
  fg: "var(--badge-decision-fg)",
};

// resolved(解決済)状態のノード・カード・チップで共通利用する減衰ヘルパー。
// 種別の色相は維持したまま、色を transparent 方向へ color-mix することで
// 背景・枠線の主張を弱める。入力には CSS変数(var(--x))だけでなく、
// 呼び出し側で組み立て済みの color-mix(...) 文字列もそのまま渡せる
// (color-mix は入れ子にしても有効な <color> を返すため)。
// ratio は「元の色を何%残すか」で、既定の45%は背景・枠線向け
// (目安40-55%)。文字色に使う場合は読みやすさを保つため80%以上を指定すること。
export function dimmedColor(cssColor: string, ratio = 45): string {
  return `color-mix(in srgb, ${cssColor} ${ratio}%, transparent)`;
}
