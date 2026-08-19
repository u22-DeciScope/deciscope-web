import type { CSSProperties } from "react";

import {
  analysisKindLabel,
  analysisKindNodeSurfaceColor,
} from "~/components/meeting/parts/analysisKindPalette";

// 公開トップページの署名要素。「発言がそのまま流れていく文字起こし」と
// 「そこから組み上がる議論ツリー」を上下に並べ、間に変換を置く。
// 種別の色は会議画面と同じ analysisKindPalette を参照するため、
// この図はイラストではなく製品のミニチュアになっている。

type TranscriptLine = {
  at: string;
  speaker: string;
  text: string;
};

type FigureNode = {
  kind: string;
  text: string;
};

const transcript: TranscriptLine[] = [
  { at: "10:04", speaker: "田中", text: "原価が上がっていて、今の価格だと利益が出ません" },
  { at: "10:06", speaker: "佐藤", text: "ただ、値上げすると既存のお客様が離れないか心配です" },
  { at: "10:09", speaker: "田中", text: "では段階的な改定を3案作って、来週比較しましょう" },
];

const rootNode: FigureNode = { kind: "issue", text: "価格改定をどう進めるか" };

const childNodes: FigureNode[] = [
  { kind: "fact", text: "原価が想定を上回っている" },
  { kind: "risk", text: "値上げによる既存顧客の離反" },
  { kind: "decision", text: "段階改定の3案を来週比較する" },
];

// 枝の横棒を合わせる高さ。ノードの1行目の中心にあたる。
// テキストが折り返しても位置がずれないよう、中央ではなく上端からの固定値で置く。
const BRANCH_OFFSET_PX = 15;
// ルートノードと最初の子ノードの間隔。幹はこのぶん上へ伸ばす。
const ROOT_GAP_PX = 10;

// 秒の計算で 1.2999999999999998 のような値がDOMへ出ないよう丸める。
function delaySeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

export function TranscriptToTreeFigure() {
  return (
    <figure className="ds-lp-rise m-0 w-full" style={{ "--lp-delay": "0.05s" } as CSSProperties}>
      <TranscriptCard />
      <ConversionRule />
      <TreeCard />
    </figure>
  );
}

function TranscriptCard() {
  return (
    <div
      className="rounded-(--ds-radius-panel) border px-4 py-3.5 sm:px-5"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--ds-border)",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      <CardHeader label="文字起こし" reading="Teams · 10:04-10:09" />
      <ol className="mt-3 space-y-2.5">
        {transcript.map((line, index) => (
          <li
            key={line.at}
            className="ds-lp-enter-left flex gap-2.5"
            style={{ "--lp-delay": delaySeconds(0.2 + index * 0.15) } as CSSProperties}
          >
            <span
              className="ds-landing-mono shrink-0 pt-px text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {line.at}
            </span>
            <span
              className="shrink-0 text-[12px] font-semibold"
              style={{ color: "var(--text-sub)" }}
            >
              {line.speaker}
            </span>
            <span className="text-[12px] leading-relaxed" style={{ color: "var(--text-main)" }}>
              {line.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// 文字起こしとツリーをつなぐ「変換が起きている場所」。
// ロゴマークに実在するシアン→パープルを、このページで唯一ここにだけ使う。
function ConversionRule() {
  return (
    <div className="relative flex flex-col items-center py-1">
      <FlowLine delay="0.7s" />
      <span
        className="ds-lp-rise ds-landing-mono my-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide"
        style={
          {
            background: "var(--ds-surface)",
            borderColor: "var(--lp-rule)",
            color: "var(--text-sub)",
            "--lp-delay": "0.85s",
          } as CSSProperties
        }
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lp-flow)" }} />
        AIが構造化
      </span>
      <FlowLine delay="0.85s" />
    </div>
  );
}

function FlowLine({ delay }: { delay: string }) {
  return (
    <span
      aria-hidden="true"
      className="ds-lp-draw-y block h-5 w-0.5 rounded-full"
      style={
        {
          background: "linear-gradient(180deg, var(--lp-cyan), var(--lp-violet))",
          "--lp-delay": delay,
        } as CSSProperties
      }
    />
  );
}

function TreeCard() {
  return (
    <div
      className="rounded-(--ds-radius-panel) border px-4 py-3.5 sm:px-5"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--ds-border)",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      <CardHeader label="議論ツリー" reading="ノード 4 · 決定 1" />
      <div className="mt-3">
        <div style={{ marginBottom: ROOT_GAP_PX }}>
          <TreeNode node={rootNode} delay="1.05s" />
        </div>
        <ul className="pl-6">
          {childNodes.map((node, index) => {
            const isFirst = index === 0;
            const isLast = index === childNodes.length - 1;
            const top = isFirst ? -ROOT_GAP_PX : 0;
            // 幹は次の子へつなぐため要素の下端まで伸ばすが、最後の子だけは
            // 自分の枝の高さで止める。
            const trunkStyle: CSSProperties & Record<string, string | number> = {
              top,
              background: "var(--lp-rule-strong)",
              "--lp-delay": delaySeconds(1.15 + index * 0.15),
            };
            if (isLast) {
              trunkStyle.height = BRANCH_OFFSET_PX - top;
            } else {
              trunkStyle.bottom = 0;
            }
            return (
              <li key={node.text} className="relative pb-2 last:pb-0">
                <span
                  aria-hidden="true"
                  className="ds-lp-draw-y absolute left-[-14px] w-px"
                  style={trunkStyle}
                />
                <span
                  aria-hidden="true"
                  className="ds-lp-draw-x absolute left-[-14px] h-px w-3.5"
                  style={
                    {
                      top: BRANCH_OFFSET_PX,
                      background: "var(--lp-rule-strong)",
                      "--lp-delay": delaySeconds(1.25 + index * 0.15),
                    } as CSSProperties
                  }
                />
                <TreeNode node={node} delay={delaySeconds(1.25 + index * 0.15)} />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TreeNode({ node, delay }: { node: FigureNode; delay: string }) {
  const surface = analysisKindNodeSurfaceColor(node.kind);
  return (
    <div
      className="ds-lp-enter-left flex items-start gap-2 rounded-(--ds-radius-control) border px-2.5 py-1.5"
      style={
        {
          background: surface.background,
          borderColor: surface.borderColor,
          "--lp-delay": delay,
        } as CSSProperties
      }
    >
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ background: surface.bg, color: surface.fg }}
      >
        {analysisKindLabel(node.kind)}
      </span>
      <span className="text-[12px] leading-5" style={{ color: "var(--text-main)" }}>
        {node.text}
      </span>
    </div>
  );
}

function CardHeader({ label, reading }: { label: string; reading: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b pb-2.5"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <span className="text-[12px] font-bold" style={{ color: "var(--text-main)" }}>
        {label}
      </span>
      <span className="ds-landing-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
        {reading}
      </span>
    </div>
  );
}
