import { Link } from "react-router";
import { Logo } from "../components/Logo";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ログイン | Deciscope" }];
}

export default function Login() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "var(--ds-bg)" }}>

      <div className="mb-8">
        <Logo size="lg" linkTo="/" />
      </div>

      <div
        className="w-full max-w-[320px] bg-white rounded-[14px] px-8 py-8 flex flex-col gap-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>おかえりなさい</h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>アカウントにサインインしてください</p>
        </div>

        <button
          type="button"
          className="w-full flex items-center justify-center gap-2.5 rounded-[9px] py-[11px] text-[13px] font-medium transition hover:opacity-80 border"
          style={{ background: "var(--input-bg)", borderColor: "var(--ds-border)", color: "var(--text-main)" }}
        >
          <TeamsIcon />
          Microsoft Teams でサインイン
        </button>
      </div>

      <p className="mt-5 text-[12px]" style={{ color: "var(--text-sub)" }}>
        アカウントをお持ちでないですか？{" "}
        <Link to="/signup" className="font-semibold" style={{ color: "var(--brand)" }}>
          新規登録
        </Link>
      </p>
    </div>
  );
}

function TeamsIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#6264A7" />
      <rect x="7" y="9" width="18" height="3" rx="1.5" fill="white" />
      <rect x="14.5" y="12" width="3" height="12" rx="1.5" fill="white" />
    </svg>
  );
}
