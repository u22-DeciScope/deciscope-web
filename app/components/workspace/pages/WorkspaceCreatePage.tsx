import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { fetchMe } from "~/api/auth/authApi";
import { ApiError } from "~/api/core/apiClient";
import { createWorkspace } from "~/api/workspaces/workspaceApi";
import { BrandLogo } from "~/components/BrandLogo";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { notifyAuthenticatedSessionChanged } from "~/hooks/useAuthenticatedSession";
import { saveLastWorkspaceId } from "~/routing/lastWorkspace";
import { workspacePath } from "~/routing/workspacePaths";

export default function WorkspaceCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWorkspaces, setHasWorkspaces] = useState(false);

  // 未ログインならログイン画面へ。所属済みなら一覧への戻り導線を出す。
  useEffect(() => {
    let active = true;
    fetchMe()
      .then((session) => {
        if (active) {
          setHasWorkspaces((session.workspaces ?? []).length > 0);
        }
      })
      .catch((cause: unknown) => {
        if (active && cause instanceof ApiError && cause.status === 401) {
          navigate("/login", { replace: true, state: { from: "/workspaces/new" } });
        }
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("ワークスペース名を入力してください。");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const created = await createWorkspace(trimmedName, description.trim());
      saveLastWorkspaceId(created.id);
      // 認証セッションのキャッシュを更新してから遷移しないと、
      // レイアウト側が新ワークスペースを認識できない。
      try {
        notifyAuthenticatedSessionChanged(await fetchMe());
      } catch {
        // セッション更新に失敗しても遷移先の再取得で回復できる。
      }
      navigate(workspacePath(created.id, "/meetings"), { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        navigate("/login", { replace: true, state: { from: "/workspaces/new" } });
        return;
      }
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "ワークスペースを作成できませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="min-h-dvh bg-(--ds-bg) px-4 py-10">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <BrandLogo size="sm" linkTo="/" />
        <section className="ds-surface rounded-(--ds-radius-panel) p-6">
          <h1 className="text-lg font-bold">ワークスペースを作成</h1>
          <p className="mt-2 text-sm text-(--text-muted)">
            DeciScopeでは、会議・文字起こし・AI分析をワークスペースごとに管理します。
            まずは最初のワークスペースを作成してください。
          </p>

          <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
            <div>
              <DsInput
                label="ワークスペース名 (必須)"
                value={name}
                disabled={isCreating}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                例: 営業企画チーム、プロダクト開発部
              </p>
            </div>
            <div>
              <DsInput
                label="説明 (任意)"
                value={description}
                disabled={isCreating}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                何のためのワークスペースかをメンバーに伝えるメモです。あとから変更できます。
              </p>
            </div>

            <div
              className="rounded-(--ds-radius-control) border px-3 py-2.5 text-[12px] leading-relaxed"
              style={{ borderColor: "var(--ds-border)", color: "var(--text-muted)" }}
            >
              作成すると、あなたがこのワークスペースの owner になります。
              初回作成時は、使い方が分かるサンプル会議 (文字起こし・AI分析付き) が追加されます。
            </div>

            {error && (
              <p className="rounded-(--ds-radius-control) border px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <DsButton type="submit" disabled={isCreating} fullWidth>
              {isCreating ? "作成しています..." : "ワークスペースを作成"}
            </DsButton>
          </form>

          {hasWorkspaces && (
            <p className="mt-4 text-center text-xs">
              <Link className="text-(--brand) hover:underline" to="/workspaces">
                ワークスペース一覧に戻る
              </Link>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
