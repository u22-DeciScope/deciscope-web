import { analysisKindPalette } from "~/components/meeting/parts/analysisKindPalette";

// tree.update のノード kind と語彙を一致させる。バックエンド（analysis.delta / fixtures）が
// 出す kind は topic / group / issue / open_issue / question / risk / fact / decision / todo。
// 種別ごとの色は analysisKindPalette (AIアシスタントパネルのカードと共通) を正として参照する。
export const tagStyle: Record<string, { bg: string; fg: string }> = Object.fromEntries(
  Object.entries(analysisKindPalette).map(([kind, { bg, fg }]) => [kind, { bg, fg }]),
);
