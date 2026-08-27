import { HiArrowLeft, HiArrowRight } from "react-icons/hi2";
import { Link } from "react-router";

import { BrandLogo } from "~/components/BrandLogo";
import {
  publicSampleAnalysisItems,
  publicSampleFinalAnalysis,
  publicSampleLiveAnalysis,
  publicSampleLiveHistory,
  publicSampleSession,
  publicSampleTranscriptSegments,
  publicSampleTree,
} from "~/components/landing/parts/publicSampleMeetingData";
import { AiFinalSummaryPanel } from "~/components/meeting/summary/AiFinalSummaryPanel";
import { deriveFinalSummaryState } from "~/components/meeting/summary/finalSummaryState";
import { PreMeetingContextPanel } from "~/components/meeting/summary/PreMeetingContextPanel";
import { SessionReviewWorkspace } from "~/components/meeting/summary/SessionReviewWorkspace";
import { SessionSummaryHeader } from "~/components/meeting/summary/SessionSummaryHeader";
import { summaryFromMeetingSession } from "~/components/meeting/summary/meetingSummaryViewModel";

const sampleSummary = summaryFromMeetingSession(publicSampleSession);
const sampleFinalSummaryState = deriveFinalSummaryState({
  sessionStatus: publicSampleSession.status,
  finalization: null,
  final: publicSampleFinalAnalysis,
  loading: false,
});

export default function PublicSampleMeetingPage() {
  return (
    <div className="ds-landing min-h-svh" style={{ background: "var(--ds-bg)" }}>
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          borderColor: "var(--lp-rule)",
          background: "color-mix(in srgb, var(--ds-bg) 88%, transparent)",
        }}
      >
        <div className="mx-auto flex w-full max-w-[96rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--ds-radius-control) border transition hover:opacity-70"
              style={{ borderColor: "var(--ds-border)", color: "var(--text-sub)" }}
              aria-label="トップページへ戻る"
            >
              <HiArrowLeft className="h-4 w-4" />
            </Link>
            <BrandLogo size="sm" />
            <span
              className="hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex"
              style={{ borderColor: "var(--lp-rule-strong)", color: "var(--brand)" }}
            >
              公開サンプル
            </span>
          </div>
          <Link
            to="/signup"
            className="inline-flex items-center gap-1.5 rounded-(--ds-radius-control) px-4 py-2 text-[12px] font-semibold transition hover:opacity-85"
            style={{ background: "var(--brand)", color: "var(--text-on-brand)" }}
          >
            Deciscopeをはじめる
            <HiArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 px-3 py-5 sm:px-6 sm:py-7">
        <div className="flex min-h-0 flex-col gap-4 rounded-(--ds-radius-panel)">
          <SessionSummaryHeader summary={sampleSummary} />
          <AiFinalSummaryPanel
            state={sampleFinalSummaryState}
            contextPanel={<PreMeetingContextPanel session={publicSampleSession} />}
          />
          <div
            data-testid="public-sample-review-workspace"
            className="min-h-0 lg:h-[calc(100dvh-6rem)] lg:shrink-0"
          >
            <SessionReviewWorkspace
              session={publicSampleSession}
              segments={publicSampleTranscriptSegments}
              tree={publicSampleTree}
              analysisItems={publicSampleAnalysisItems}
              liveAnalysis={publicSampleLiveAnalysis}
              liveHistory={publicSampleLiveHistory}
              sessionId={publicSampleSession.sessionId}
            />
          </div>
        </div>

        <div
          className="flex flex-col items-center justify-between gap-3 border-t py-5 sm:flex-row"
          style={{ borderColor: "var(--lp-rule)" }}
        >
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            このページは公開用の固定サンプルで、ワークスペース内の会議データには接続しません。
          </p>
          <div className="flex items-center gap-4 text-[12px] font-semibold">
            <Link to="/" className="hover:underline" style={{ color: "var(--text-sub)" }}>
              トップへ戻る
            </Link>
            <Link to="/signup" className="hover:underline" style={{ color: "var(--brand)" }}>
              無料ではじめる
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
