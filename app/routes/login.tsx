import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { syncFirebaseLogin } from "../lib/api";
import { signInWithMicrosoft } from "../lib/firebase";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ログイン | Deciscope" }];
}

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsSigningIn(true);
    try {
      const user = await signInWithMicrosoft();
      const idToken = await user.getIdToken();
      await syncFirebaseLogin(idToken);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました。");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--ds-bg)" }}>
      <div
        className="w-full max-w-[440px] bg-white rounded-[20px] px-10 py-10 flex flex-col gap-7"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <Logo size="sm" linkTo="/" />

        <div>
          <h1 className="text-[30px] font-bold leading-tight" style={{ color: "var(--text-main)" }}>ログイン</h1>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--text-muted)" }}>アカウントを選択してください</p>
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={isSigningIn}
          className="w-full flex items-center gap-3 px-5 py-[14px] rounded-[14px] border text-[14px] font-medium transition hover:opacity-80"
          style={{
            borderColor: "var(--ds-border)",
            color: "var(--text-main)",
            background: "white",
            opacity: isSigningIn ? 0.65 : 1,
          }}
        >
          <MicrosoftIcon />
          {isSigningIn ? "ログイン中..." : "Microsoft でログイン"}
        </button>

        {error && (
          <p className="text-[12px] leading-relaxed" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        <p className="text-center text-[12px]" style={{ color: "var(--text-sub)" }}>
          アカウントをお持ちでないですか？{" "}
          <Link to="/signup" className="font-semibold hover:underline" style={{ color: "var(--brand)" }}>
            新規登録
          </Link>
        </p>

        <div className="h-px" style={{ background: "var(--ds-border)" }} />

        <p className="text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          <Link to="/terms" className="hover:underline">利用規約</Link>
          <span className="mx-1">·</span>
          <a href="#" className="hover:underline">プライバシーポリシー</a>
        </p>
      </div>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 21 21" fill="none">
      <rect x="0" y="0" width="10" height="10" fill="#F25022" />
      <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
      <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
      <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}
