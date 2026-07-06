import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { HiPlus } from "react-icons/hi2";

import { fetchMe, normalizeWorkspaceRole, type WorkspaceDto } from "~/api/auth/authApi";
import { ApiError } from "~/api/core/apiClient";
import { createWorkspace, listWorkspaces } from "~/api/workspaces/workspaceApi";
import { BrandLogo } from "~/components/BrandLogo";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { notifyAuthenticatedSessionChanged } from "~/hooks/useAuthenticatedSession";
import { workspacePath } from "~/routing/workspacePaths";

export default function WorkspaceListPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listWorkspaces();
      setWorkspaces(result.workspaces ?? []);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        navigate("/login", { replace: true, state: { from: "/workspaces" } });
        return;
      }
      setWorkspaces([]);
      setLoadError(errorMessage(cause) || "ワークスペース一覧を取得できませんでした。");
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setCreateError("ワークスペース名を入力してください。");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await createWorkspace(trimmedName, description.trim());
      // 認証セッションのキャッシュを更新してから遷移しないと、
      // レイアウト側が新ワークスペースを認識できずリゾルバへ戻されてしまう。
      try {
        notifyAuthenticatedSessionChanged(await fetchMe());
      } catch {
        // セッション更新に失敗しても遷移先の再取得で回復できる。
      }
      navigate(workspacePath(created.id, "/meetings"));
    } catch (cause) {
      setCreateError(errorMessage(cause) || "ワークスペースを作成できませんでした。");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="min-h-dvh bg-(--ds-bg) px-4 py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <BrandLogo size="sm" linkTo="/workspaces" />
        </div>

        <section className="ds-surface rounded-(--ds-radius-panel) p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold">ワークスペース</h1>
              <p className="mt-1 text-xs text-(--text-muted)">
                所属しているワークスペースの一覧です。
              </p>
            </div>
            <DsButton type="button" onClick={() => setShowCreateForm((current) => !current)}>
              <HiPlus className="h-3.5 w-3.5" />
              新規作成
            </DsButton>
          </div>

          {showCreateForm && (
            <form
              className="mb-4 flex flex-col gap-2 rounded-(--ds-radius-control) border p-3"
              onSubmit={handleCreate}
            >
              <DsInput
                label="ワークスペース名"
                value={name}
                disabled={isCreating}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <DsInput
                label="説明(任意)"
                value={description}
                disabled={isCreating}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex justify-end gap-2">
                <DsButton
                  type="button"
                  variant="secondary"
                  disabled={isCreating}
                  onClick={() => setShowCreateForm(false)}
                >
                  キャンセル
                </DsButton>
                <DsButton type="submit" disabled={isCreating}>
                  {isCreating ? "作成中" : "作成"}
                </DsButton>
              </div>
            </form>
          )}

          {isLoading ? (
            <EmptyLine>ワークスペースを読み込んでいます...</EmptyLine>
          ) : loadError ? (
            <div className="flex flex-col gap-2">
              <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
                {loadError}
              </p>
              <DsButton type="button" variant="secondary" onClick={loadWorkspaces}>
                再読み込み
              </DsButton>
            </div>
          ) : workspaces.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-(--ds-radius-control) border px-4 py-10 text-center">
              <p className="text-sm font-semibold">ワークスペースを作成してください</p>
              <p className="text-xs text-(--text-muted)">
                会議の記録やAI分析をチームで共有するには、まずワークスペースが必要です。
              </p>
              <DsButton type="button" onClick={() => setShowCreateForm(true)}>
                <HiPlus className="h-3.5 w-3.5" />
                最初のワークスペースを作成
              </DsButton>
            </div>
          ) : (
            workspaces.map((workspace) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0"
                key={workspace.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{workspace.name}</p>
                  {workspace.description ? (
                    <p className="truncate text-xs text-(--text-muted)">{workspace.description}</p>
                  ) : null}
                  <p className="mt-0.5 text-[11px] text-(--text-muted)">
                    更新: {formatDate(workspace.updated_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <RoleBadge role={workspace.role} />
                  <Link to={workspacePath(workspace.id, "/meetings")}>
                    <DsButton variant="secondary">開く</DsButton>
                  </Link>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-(--ds-radius-control) border px-2 py-1 text-[11px] font-semibold">
      {normalizeWorkspaceRole(role)}
    </span>
  );
}

function EmptyLine({ children }: { children: string }) {
  return (
    <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-(--text-muted)">
      {children}
    </p>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "";
}
