import { Link } from "react-router";

import { BrandLogo } from "~/components/BrandLogo";

export default function LandingPage() {
  return (
    <main className="min-h-svh px-6 py-8" style={{ background: "var(--ds-bg)" }}>
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <BrandLogo size="md" />
          <Link
            to="/login"
            className="rounded-[9px] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-80"
            style={{ background: "var(--brand)" }}
          >
            ログイン
          </Link>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="mb-4 text-sm font-semibold" style={{ color: "var(--brand)" }}>
            納得できる意思決定を、チームで。
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">Deciscope</h1>
          <p className="mt-6 max-w-2xl text-base leading-8" style={{ color: "var(--text-sub)" }}>
            このページはサービス紹介サイトとして拡張するための公開トップページです。
          </p>
        </section>
      </div>
    </main>
  );
}
