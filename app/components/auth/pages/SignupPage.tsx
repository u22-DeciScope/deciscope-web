import { Link } from "react-router";
import { BrandLogo } from "~/components/BrandLogo";
import { MicrosoftIcon } from "~/components/shared/MicrosoftIcon";
import { useMicrosoftAuthFlow } from "~/hooks/useMicrosoftAuthFlow";

export default function Signup() {
  const { error, isPending: isSigningUp, signIn } = useMicrosoftAuthFlow({
    redirectTo: "/terms",
    fallbackMessage: "登録に失敗しました。",
  });

  return (
    <div className="min-h-svh flex items-center justify-center p-4" style={{ background: "var(--ds-bg)" }}>
      <div
        className="w-full max-w-110 ds-surface rounded-[20px] px-10 py-10 flex flex-col gap-7"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <BrandLogo size="sm" linkTo="/" />

        <div>
          <h1 className="text-[30px] font-bold leading-tight" style={{ color: "var(--text-main)" }}>新規登録</h1>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--text-muted)" }}>アカウントを選択してください</p>
        </div>

        <button
          type="button"
          onClick={signIn}
          disabled={isSigningUp}
          className="w-full flex items-center gap-3 px-5 py-3.5 rounded-[14px] border text-[14px] font-medium transition hover:opacity-80"
          style={{
            borderColor: "var(--ds-border)",
            color: "var(--text-main)",
            background: "var(--ds-surface)",
            opacity: isSigningUp ? 0.65 : 1,
          }}
        >
          <MicrosoftIcon />
          {isSigningUp ? "登録中..." : "Microsoft で登録"}
        </button>

        {error && (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--danger)" }}>
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
          <span title="プライバシーポリシーは準備中です">プライバシーポリシー</span>
        </p>
      </div>
    </div>
  );
}





