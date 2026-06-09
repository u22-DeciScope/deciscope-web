import { Link, useLocation } from "react-router";
import { Logo } from "~/components/Logo";
import { MicrosoftIcon } from "~/components/shared/MicrosoftIcon";
import { useMicrosoftAuthFlow } from "~/hooks/useMicrosoftAuthFlow";
import { demoWorkspacePath, workspaceIdFromPath } from "~/lib/workspace";

export default function Login() {
  const location = useLocation();
  const requestedPath =
    typeof location.state?.from === "string" && workspaceIdFromPath(location.state.from)
      ? location.state.from
      : null;
  const { error, isPending: isSigningIn, signIn } = useMicrosoftAuthFlow({
    redirectTo: requestedPath ?? demoWorkspacePath("/meetings"),
    fallbackMessage: "ログインに失敗しました。",
  });

  return (
    <div className="min-h-svh flex items-center justify-center p-4" style={{ background: "var(--ds-bg)" }}>
      <div
        className="w-full max-w-110 ds-surface rounded-[20px] px-10 py-10 flex flex-col gap-7"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <Logo size="sm" linkTo="/" />

        <div>
          <h1 className="text-[30px] font-bold leading-tight" style={{ color: "var(--text-main)" }}>ログイン</h1>
          <p className="text-[13px] mt-1.5" style={{ color: "var(--text-muted)" }}>アカウントを選択してください</p>
        </div>

        <button
          type="button"
          onClick={signIn}
          disabled={isSigningIn}
          className="w-full flex items-center gap-3 px-5 py-[14px] rounded-[14px] border text-[14px] font-medium transition hover:opacity-80"
          style={{
            borderColor: "var(--ds-border)",
            color: "var(--text-main)",
            background: "var(--ds-surface)",
            opacity: isSigningIn ? 0.65 : 1,
          }}
        >
          <MicrosoftIcon />
          {isSigningIn ? "ログイン中..." : "Microsoft でログイン"}
        </button>

        {error && (
          <div
            role="alert"
            className="rounded-[9px] border px-4 py-3"
            style={{
              background: "var(--ai-risk-bg)",
              borderColor: "var(--ai-risk-border)",
              color: "var(--ai-risk-fg)",
            }}
          >
            <p className="text-[13px] font-semibold">ログインできませんでした</p>
            <p className="mt-1 text-[12px] leading-relaxed">{error}</p>
          </div>
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
          <span title="プライバシーポリシーは準備中です">プライバシーポリシー</span>
        </p>
      </div>
    </div>
  );
}





