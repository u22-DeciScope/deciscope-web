import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { fetchMe, type BackendSession } from "~/api/auth/authApi";
import { ApiError } from "~/api/core/apiClient";
import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreviewDto,
} from "~/api/workspaces/workspaceApi";
import { BrandLogo } from "~/components/BrandLogo";
import { DsButton } from "~/components/DsButton";
import { RoleBadge } from "~/components/workspace/parts/RoleBadge";
import { notifyAuthenticatedSessionChanged } from "~/hooks/useAuthenticatedSession";
import { workspacePath } from "~/routing/workspacePaths";

type PageState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; preview: InvitationPreviewDto };

export default function InvitationAcceptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const currentPath = `/invitations/accept?token=${encodeURIComponent(token)}`;

  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [session, setSession] = useState<BackendSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "招待リンクが正しくありません。" });
      return;
    }
    let active = true;
    previewInvitation(token)
      .then((preview) => {
        if (active) {
          setState({ kind: "ready", preview });
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setState({ kind: "invalid", message: previewErrorMessage(cause) });
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((value) => {
        if (active) {
          setSession(value);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
        }
      })
      .finally(() => {
        if (active) {
          setSessionChecked(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const emailMismatch = useMemo(() => {
    if (!session || state.kind !== "ready") {
      return false;
    }
    return normalizeEmail(session.user.email) !== normalizeEmail(state.preview.email);
  }, [session, state]);

  async function handleAccept() {
    setIsAccepting(true);
    setAcceptError(null);
    try {
      const workspace = await acceptInvitation(token);
      try {
        notifyAuthenticatedSessionChanged(await fetchMe());
      } catch {
        // セッション更新に失敗しても遷移先で再取得される。
      }
      navigate(workspacePath(workspace.id, "/meetings"), { replace: true });
    } catch (cause) {
      setAcceptError(acceptErrorMessage(cause));
    } finally {
      setIsAccepting(false);
    }
  }

  function goToLogin() {
    navigate("/login", { state: { from: currentPath } });
  }

  return (
    <div className="min-h-dvh bg-(--ds-bg) px-4 py-10">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <BrandLogo size="sm" linkTo="/" />
        <section className="ds-surface rounded-(--ds-radius-panel) p-6">
          <h1 className="text-lg font-bold">ワークスペースへの招待</h1>

          {state.kind === "loading" && (
            <p className="mt-4 text-sm text-(--text-muted)">招待情報を確認しています...</p>
          )}

          {state.kind === "invalid" && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="rounded-(--ds-radius-control) border px-3 py-2 text-sm text-red-600">
                {state.message}
              </p>
              <p className="text-xs text-(--text-muted)">
                ワークスペース管理者に再招待を依頼してください。
              </p>
            </div>
          )}

          {state.kind === "ready" && (
            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-(--ds-radius-control) border p-4">
                <p className="text-xs text-(--text-muted)">招待されたワークスペース</p>
                <p className="mt-1 text-base font-bold">{state.preview.workspace_name}</p>
                <div className="mt-3 flex flex-col gap-1 text-sm">
                  <p>
                    <span className="text-(--text-muted)">招待先: </span>
                    {state.preview.email}
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-(--text-muted)">付与されるロール: </span>
                    <RoleBadge role={state.preview.role} />
                  </p>
                  {state.preview.expires_at && (
                    <p>
                      <span className="text-(--text-muted)">有効期限: </span>
                      {formatDateTime(state.preview.expires_at)}
                    </p>
                  )}
                </div>
              </div>

              {state.preview.status === "expired" ? (
                <StatusMessage>
                  この招待リンクは期限切れです。ワークスペース管理者に再招待を依頼してください。
                </StatusMessage>
              ) : state.preview.status === "revoked" ? (
                <StatusMessage>
                  この招待は取り消されています。ワークスペース管理者に再招待を依頼してください。
                </StatusMessage>
              ) : state.preview.status === "accepted" ? (
                <StatusMessage>この招待リンクは使用済みです。</StatusMessage>
              ) : !sessionChecked ? (
                <p className="text-sm text-(--text-muted)">ログイン状態を確認しています...</p>
              ) : !session ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-(--text-muted)">
                    参加するには、招待されたメールアドレス ({state.preview.email})
                    でログインしてください。Microsoft または Google アカウントでログインできます。
                  </p>
                  <DsButton type="button" onClick={goToLogin}>
                    ログインして参加する
                  </DsButton>
                </div>
              ) : emailMismatch ? (
                <div className="flex flex-col gap-2">
                  <p className="rounded-(--ds-radius-control) border px-3 py-2 text-sm text-red-600">
                    ログイン中のメールアドレス ({session.user.email})
                    が招待先メールアドレスと一致しません。招待されたメールアドレスのアカウントでログインしてください。
                  </p>
                  <DsButton type="button" variant="secondary" onClick={goToLogin}>
                    別のアカウントでログイン
                  </DsButton>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-(--text-muted)">
                    {session.user.email} として参加します。
                  </p>
                  {acceptError && (
                    <p className="rounded-(--ds-radius-control) border px-3 py-2 text-sm text-red-600">
                      {acceptError}
                    </p>
                  )}
                  <DsButton type="button" disabled={isAccepting} onClick={handleAccept}>
                    {isAccepting ? "参加しています..." : "ワークスペースに参加する"}
                  </DsButton>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusMessage({ children }: { children: string }) {
  return (
    <p className="rounded-(--ds-radius-control) border px-3 py-2 text-sm text-(--text-muted)">
      {children}
    </p>
  );
}

function previewErrorMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.status === 404) {
      return "この招待リンクは無効です。URLが正しいか確認してください。";
    }
    if (cause.status === 410) {
      return "この招待リンクは期限切れ、または取り消されています。";
    }
  }
  return "招待情報を取得できませんでした。時間をおいて再度お試しください。";
}

function acceptErrorMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    switch (cause.status) {
      case 401:
        return "ログインの有効期限が切れています。ログインし直してください。";
      case 403:
        return "ログイン中のメールアドレスが招待先メールアドレスと一致しません。招待されたメールアドレスのアカウントでログインしてください。";
      case 409:
        return "この招待リンクは使用済みです。";
      case 410:
        return "この招待リンクは期限切れ、または取り消されています。";
      default:
        break;
    }
  }
  return "ワークスペースへの参加に失敗しました。時間をおいて再度お試しください。";
}

function normalizeEmail(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatDateTime(value: string) {
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
