import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { syncFirebaseLogin } from "../lib/api";
import { signInWithMicrosoft } from "../lib/firebase";
import type { Route } from "./+types/signup";

export function meta({}: Route.MetaArgs) {
  return [{ title: "新規登録 | Deciscope" }];
}

export default function Signup() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  async function handleSignUp() {
    setError(null);
    setIsSigningUp(true);
    try {
      const user = await signInWithMicrosoft();
      const idToken = await user.getIdToken();
      await syncFirebaseLogin(idToken);
      navigate("/terms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました。");
    } finally {
      setIsSigningUp(false);
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
          <h1 className="text-[30px] font-bold leading-tight" style={{ color: "var(--text-main)" }}>新規登録</h1>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--text-muted)" }}>アカウントを選択してください</p>
        </div>

        <button
          type="button"
          onClick={handleSignUp}
          disabled={isSigningUp}
          className="w-full flex items-center gap-3 px-5 py-[14px] rounded-[14px] border text-[14px] font-medium transition hover:opacity-80"
          style={{
            borderColor: "var(--ds-border)",
            color: "var(--text-main)",
            background: "white",
            opacity: isSigningUp ? 0.65 : 1,
          }}
        >
          <MicrosoftIcon />
          {isSigningUp ? "登録中..." : "Microsoft で登録"}
        </button>

        {error && (
          <p className="text-[12px] leading-relaxed" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        <p className="text-center text-[12px]" style={{ color: "var(--text-sub)" }}>
          すでにアカウントをお持ちですか？{" "}
          <Link to="/login" className="font-semibold hover:underline" style={{ color: "var(--brand)" }}>
            ログイン
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
