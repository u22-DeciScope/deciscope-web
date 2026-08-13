import { Suspense, lazy, useEffect, useRef, useState } from "react";

import { LiveStatusBadge } from "~/components/meeting/parts/LiveStatusBadge";
import { MeetingAssistantPanel } from "~/components/meeting/parts/MeetingAssistantPanel";
import { MeetingChatPanel } from "~/components/meeting/parts/MeetingChatPanel";
import {
  previewAnalysisItems,
  previewAnalysisVersion,
  previewLiveAnalysis,
  previewPartials,
  previewSegments,
  previewSpeakerSummaries,
  previewTreeEdges,
  previewTreeNodes,
  previewTreeVersion,
} from "~/components/landing/parts/workspacePreviewData";

// 会議中の画面プレビュー。3つのパネルは似せて作り直したものではなく、
// 会議画面がそのまま使っているコンポーネントに、APIのDTO型で書いた
// デモデータ(workspacePreviewData)を渡している。
//
// 議論ツリーは @xyflow/react と dagre を含む重いチャンクに入るため、
// 静的import すると公開トップページの初期JSがそのぶん増える。ここでは
// 動的importにして、プレビューが画面に近づいたときだけ読み込む。
const LazyDiscussionTree = lazy(async () => {
  const discussionTree = await import("~/components/meeting/parts/discussionTree/DiscussionTree");
  return { default: discussionTree.DiscussionTree };
});

export function WorkspaceColumns() {
  const previewRef = useRef<HTMLElement | null>(null);
  const [panelsMounted, setPanelsMounted] = useState(false);

  // パネル一式はクライアントでのみ組み立てる。ReactFlowはDOMの実測が前提で
  // サーバー描画に向かないうえ、タイムラインの時刻整形など描画結果が実行環境に
  // 依存しうる箇所があるため、hydration不一致を避けて後から差し込む。
  useEffect(() => {
    const element = previewRef.current;
    if (!element) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setPanelsMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPanelsMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <figure
      ref={previewRef}
      className="lp-workspace-preview mt-9"
      aria-label="会議中の3列画面のプレビュー"
    >
      <div className="lp-preview-scroll" tabIndex={0} aria-label="横にスクロールできます">
        <div className="lp-preview-app">
          <header className="lp-preview-toolbar">
            <div className="lp-preview-meeting-title">
              <span className="lp-preview-product-mark" aria-hidden="true" />
              <div>
                <p>プロダクト定例</p>
                <span>オンボーディング改善</span>
              </div>
            </div>
            <LiveStatusBadge label="記録中" status="recording" />
            <span className="lp-preview-time">00:15:24</span>
          </header>

          <div className="lp-preview-grid">
            {panelsMounted ? (
              <>
                <MeetingChatPanel partials={previewPartials} segments={previewSegments} />
                <Suspense fallback={<PanelPlaceholder label="議論ツリー" />}>
                  <LazyDiscussionTree
                    nodes={previewTreeNodes}
                    edges={previewTreeEdges}
                    analysisItems={previewAnalysisItems}
                    segments={previewSegments}
                    analysisVersion={previewAnalysisVersion}
                    treeVersion={previewTreeVersion}
                  />
                </Suspense>
                <MeetingAssistantPanel
                  insights={previewAnalysisItems}
                  speakerSummaries={previewSpeakerSummaries}
                  segments={previewSegments}
                  treeNodes={previewTreeNodes}
                  liveAnalysis={previewLiveAnalysis}
                />
              </>
            ) : (
              <>
                <PanelPlaceholder label="タイムライン" />
                <PanelPlaceholder label="議論ツリー" />
                <PanelPlaceholder label="AIアシスタント" />
              </>
            )}
          </div>
        </div>
      </div>
      <figcaption>
        <span className="lp-preview-caption-dot" aria-hidden="true" />
        表示内容はデモ用のテストデータです
        <span className="lp-preview-swipe-note">左右にスワイプして全体を確認できます</span>
      </figcaption>
    </figure>
  );
}

// パネルを読み込むまでの枠。実パネルと同じ面・角丸・ヘッダー高で置いておき、
// 差し替わったときに枠の位置が動かないようにする。
function PanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="lp-preview-placeholder">
      <header>{label}</header>
      <p>読み込み中…</p>
    </div>
  );
}
