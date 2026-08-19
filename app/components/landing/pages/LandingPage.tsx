import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";

import { BrandLogo } from "~/components/BrandLogo";
import { PhaseTimeline } from "~/components/landing/parts/PhaseTimeline";
import { TranscriptToTreeFigure } from "~/components/landing/parts/TranscriptToTreeFigure";
import { WorkspaceColumns } from "~/components/landing/parts/WorkspaceColumns";

export default function LandingPage() {
  return (
    <div className="ds-landing min-h-svh">
      <SiteHeader />
      <main>
        <Hero />
        <FlowSection />
        <WorkspaceSection />
        <ClosingSection />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{
        borderColor: "var(--lp-rule)",
        background: "color-mix(in srgb, var(--ds-bg) 82%, transparent)",
      }}
    >
      <Shell className="flex items-center justify-between gap-4 py-3.5">
        <BrandLogo size="md" />
        <nav className="flex items-center gap-1 sm:gap-4">
          <a
            href="#flow"
            className="hidden rounded-(--ds-radius-control) px-3 py-2 text-[13px] font-semibold transition hover:opacity-70 sm:inline-block"
            style={{ color: "var(--text-sub)" }}
          >
            使い方
          </a>
          <a
            href="#workspace"
            className="hidden rounded-(--ds-radius-control) px-3 py-2 text-[13px] font-semibold transition hover:opacity-70 sm:inline-block"
            style={{ color: "var(--text-sub)" }}
          >
            会議中の画面
          </a>
          <Link
            to="/login"
            className="rounded-(--ds-radius-control) px-3 py-2 text-[13px] font-semibold transition hover:opacity-70"
            style={{ color: "var(--text-sub)" }}
          >
            ログイン
          </Link>
          <PrimaryLink to="/signup">はじめる</PrimaryLink>
        </nav>
      </Shell>
    </header>
  );
}

function Hero() {
  return (
    <Shell className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
      <div>
        <span
          className="ds-landing-mono inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]"
          style={{ borderColor: "var(--lp-rule)", color: "var(--text-sub)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lp-flow)" }} />
          Teams会議に対応
        </span>

        <h1
          className="ds-landing-display mt-5 text-[30px] font-bold sm:text-[42px] lg:text-[46px]"
          style={{ color: "var(--text-main)" }}
        >
          会議の結論だけでなく、
          <br />
          そこに至った議論を残す。
        </h1>

        <p
          className="mt-6 max-w-xl text-[14px] leading-8 sm:text-[15px]"
          style={{ color: "var(--text-sub)" }}
        >
          Deciscopeは、Teams会議に参加して発言を文字起こしし、その場で議論ツリーへ組み立てます。
          論点・リスク・決定事項が枝としてつながるので、決まったことと、そう決めた理由が同じ場所に残ります。
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <PrimaryLink to="/signup" size="lg">
            はじめる
          </PrimaryLink>
          <SecondaryLink to="/login">ログイン</SecondaryLink>
        </div>

        <p className="ds-landing-mono mt-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Microsoft / Google アカウントでログイン
        </p>
      </div>

      {/* ページ全体を広げたぶんヒーロー右カラムも広がるが、図の中身は12px前後の
          小さな文字なので、伸ばしきると間延びする。図だけ幅を止める。 */}
      <div className="w-full lg:max-w-[32rem] lg:justify-self-end">
        <TranscriptToTreeFigure />
      </div>
    </Shell>
  );
}

function FlowSection() {
  return (
    <section id="flow" className="ds-landing-anchor">
      <Shell className="border-t py-16 sm:py-24" style={{ borderColor: "var(--lp-rule)" }}>
        <SectionHeading eyebrow="使い方" title="1回の会議で起きること" />
        <PhaseTimeline />
      </Shell>
    </section>
  );
}

function WorkspaceSection() {
  return (
    <section id="workspace" className="ds-landing-anchor">
      <Shell className="border-t py-16 sm:py-24" style={{ borderColor: "var(--lp-rule)" }}>
        <SectionHeading
          eyebrow="会議中の画面"
          title="話しながら、議論の形が見える"
          lead="画面は3つの領域に分かれています。左で発言を追い、中央で議論の構造を見て、右でAIの指摘を受け取ります。"
        />
        <WorkspaceColumns />
      </Shell>
    </section>
  );
}

function ClosingSection() {
  return (
    <Shell className="py-16 sm:py-24">
      <div
        className="overflow-hidden rounded-(--ds-radius-dialog) border"
        style={{
          background: "var(--ds-surface)",
          borderColor: "var(--ds-border)",
          boxShadow: "var(--ds-shadow)",
        }}
      >
        <div className="h-1" style={{ background: "var(--lp-flow)" }} />
        <div className="px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2
            className="ds-landing-display text-[24px] font-bold sm:text-[32px]"
            style={{ color: "var(--text-main)" }}
          >
            納得できる意思決定を、チームで。
          </h2>
          <p className="mt-4 text-[14px] leading-8" style={{ color: "var(--text-sub)" }}>
            Teams会議のURLを貼るところから始められます。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryLink to="/signup" size="lg">
              はじめる
            </PrimaryLink>
            <SecondaryLink to="/login">ログイン</SecondaryLink>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--lp-rule)" }}>
      <Shell className="flex flex-col items-start justify-between gap-5 py-8 sm:flex-row sm:items-center">
        <BrandLogo size="sm" />
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]"
          style={{ color: "var(--text-muted)" }}
        >
          <Link to="/terms" className="hover:underline">
            利用規約
          </Link>
          <span title="プライバシーポリシーは準備中です">プライバシーポリシー</span>
          <Link to="/login" className="hover:underline">
            ログイン
          </Link>
          <span className="ds-landing-mono">© Deciscope</span>
        </div>
      </Shell>
    </footer>
  );
}

function SectionHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
}) {
  return (
    <div>
      <p className="ds-landing-mono text-[11px] tracking-widest" style={{ color: "var(--brand)" }}>
        {eyebrow}
      </p>
      <h2
        className="ds-landing-display mt-2 text-[24px] font-bold sm:text-[32px]"
        style={{ color: "var(--text-main)" }}
      >
        {title}
      </h2>
      {lead && (
        <p className="mt-4 max-w-2xl text-[14px] leading-8" style={{ color: "var(--text-sub)" }}>
          {lead}
        </p>
      )}
    </div>
  );
}

// セクションの左右余白と最大幅を1か所に集約する。
function Shell({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  // 最大幅は「会議中の画面」プレビューが要求する幅で決めている。プレビューの窓は
  // 1280px(landing.css の .lp-preview-app)で、これを下回るとAIアシスタント列が
  // 狭まってタブが2行に折り返す。本文の行長は各セクション側で max-w-xl / max-w-2xl
  // に抑えているので、ここを広げても読みやすさは変わらない。
  return (
    <div className="mx-auto w-full max-w-[84rem] px-5 sm:px-8">
      <div className={className} style={style}>
        {children}
      </div>
    </div>
  );
}

function PrimaryLink({
  children,
  to,
  size = "md",
}: {
  children: ReactNode;
  to: string;
  size?: "md" | "lg";
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-(--ds-radius-control) font-semibold transition hover:opacity-85 ${
        size === "lg" ? "px-6 py-3 text-[14px]" : "px-4 py-2 text-[13px]"
      }`}
      style={{ background: "var(--brand)", color: "var(--text-on-brand)" }}
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-(--ds-radius-control) border px-6 py-3 text-[14px] font-semibold transition hover:opacity-70"
      style={{
        background: "var(--ds-surface)",
        borderColor: "var(--ds-border)",
        color: "var(--text-main)",
      }}
    >
      {children}
    </Link>
  );
}
