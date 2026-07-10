import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { HiChevronRight, HiPlus, HiUserGroup } from "react-icons/hi2";

import { type WorkspaceDto } from "~/api/auth/authApi";
import { ApiError } from "~/api/core/apiClient";
import { listWorkspaces } from "~/api/workspaces/workspaceApi";
import { BrandLogo } from "~/components/BrandLogo";
import { DsButton } from "~/components/DsButton";
import { RoleBadge } from "~/components/workspace/parts/RoleBadge";
import { workspacePath } from "~/routing/workspacePaths";

export default function WorkspaceListPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="min-h-dvh bg-(--ds-bg) px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <BrandLogo size="sm" linkTo="/workspaces" />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-main)" }}>
              ワークスペース
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              会議・文字起こし・AI分析を管理する単位です。
            </p>
          </div>
          <Link to="/workspaces/new">
            <DsButton type="button">
              <HiPlus className="h-3.5 w-3.5" />
              新規作成
            </DsButton>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map((index) => (
              <div
                key={index}
                className="ds-surface h-36 animate-pulse rounded-(--ds-radius-panel)"
                style={{ boxShadow: "var(--ds-shadow)" }}
              />
            ))}
          </div>
        ) : loadError ? (
          <div
            className="ds-surface flex flex-col items-start gap-3 rounded-(--ds-radius-panel) p-6"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <p className="text-sm text-red-600">{loadError}</p>
            <DsButton type="button" variant="secondary" onClick={loadWorkspaces}>
              再読み込み
            </DsButton>
          </div>
        ) : workspaces.length === 0 ? (
          <div
            className="ds-surface flex flex-col items-center gap-4 rounded-(--ds-radius-panel) px-6 py-16 text-center"
            style={{ boxShadow: "var(--ds-shadow)" }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "var(--brand-light)" }}
            >
              <HiUserGroup className="h-7 w-7" style={{ color: "var(--brand)" }} />
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: "var(--text-main)" }}>
                まだワークスペースがありません
              </p>
              <p
                className="mt-2 max-w-md text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                DeciScopeでは、会議・文字起こし・AI分析をワークスペースごとに管理します。
                まずは最初のワークスペースを作成してください。
              </p>
            </div>
            <Link to="/workspaces/new">
              <DsButton type="button">
                <HiPlus className="h-3.5 w-3.5" />
                ワークスペースを作成
              </DsButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                to={workspacePath(workspace.id, "/meetings")}
                className="ds-surface group flex flex-col gap-3 rounded-(--ds-radius-panel) p-5 transition hover:opacity-90"
                style={{ boxShadow: "var(--ds-shadow)" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="min-w-0 truncate text-base font-bold"
                    style={{ color: "var(--text-main)" }}
                  >
                    {workspace.name}
                  </p>
                  <RoleBadge role={workspace.role} />
                </div>
                <p
                  className="line-clamp-2 min-h-10 text-sm leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {workspace.description || "説明はまだ設定されていません。"}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    更新: {formatDate(workspace.updated_at)}
                  </span>
                  <span
                    className="flex items-center gap-1 text-sm font-medium"
                    style={{ color: "var(--brand)" }}
                  >
                    開く
                    <HiChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
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
  });
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "";
}
