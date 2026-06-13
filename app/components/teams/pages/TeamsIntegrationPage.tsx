import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  HiArrowRightOnRectangle,
  HiCalendarDays,
  HiCheckCircle,
  HiShieldCheck,
  HiSignal,
} from "react-icons/hi2";

import {
  connectTeamsIntegration,
  disconnectTeamsIntegration,
  getTeamsIntegrationStatus,
  requestTeamsAdminConsent,
  type TeamsIntegrationStatusDto,
} from "~/api/teams/teamsIntegrationApi";
import { DsButton } from "~/components/DsButton";
import { MicrosoftIcon } from "~/components/shared/MicrosoftIcon";
import { ConfirmDialog } from "~/components/shared/modal/ConfirmDialog";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export default function TeamsIntegrationPage() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const upcomingPath = workspacePath(workspaceId, "/meetings/upcoming");
  const [status, setStatus] = useState<TeamsIntegrationStatusDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"connect" | "disconnect" | "consent" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const chrome = useMemo(
    () => ({
      header: {
        title: "Teams 連携",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "Teams 連携" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  useEffect(() => {
    let active = true;
    getTeamsIntegrationStatus()
      .then((result) => {
        if (active) {
          setStatus(result);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "連携状態を取得できませんでした。");
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function runAction(
    action: "connect" | "disconnect" | "consent",
    request: () => Promise<TeamsIntegrationStatusDto>,
  ) {
    setPendingAction(action);
    setError(null);
    try {
      setStatus(await request());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作に失敗しました。");
    } finally {
      setPendingAction(null);
    }
  }

  const connected = status?.connected ?? false;
  const consent = status?.admin_consent ?? "not_requested";
  const ready = connected && consent === "granted";

  return (
    <div className="mx-auto flex w-full max-w-160 flex-col gap-3">
      <MockNotice />

      {error && (
        <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
          {error}
        </p>
      )}

      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiSignal className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
              接続状態
            </h2>
          </div>
          <StatusBadge
            tone={connected ? "success" : "muted"}
            label={isLoading ? "確認中..." : connected ? "接続済み" : "未接続"}
          />
        </div>

        {!connected && (
          <>
            <p className="mb-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Microsoft アカウントを接続すると、予定された Teams 会議の一覧を取得し、会議に分析 Bot
              を参加させられるようになります。
            </p>
            <DsButton
              type="button"
              variant="secondary"
              disabled={isLoading || pendingAction !== null}
              onClick={() => runAction("connect", connectTeamsIntegration)}
            >
              <MicrosoftIcon />
              {pendingAction === "connect" ? "接続中..." : "Microsoft アカウントで接続"}
            </DsButton>
          </>
        )}

        {connected && status && (
          <>
            <dl className="grid grid-cols-[120px_1fr] gap-2 text-[12px]">
              <dt style={{ color: "var(--text-muted)" }}>アカウント</dt>
              <dd style={{ color: "var(--text-main)" }}>
                {status.account_name}({status.account_email})
              </dd>
              <dt style={{ color: "var(--text-muted)" }}>テナント</dt>
              <dd style={{ color: "var(--text-main)" }}>{status.tenant_name}</dd>
              <dt style={{ color: "var(--text-muted)" }}>テナント ID</dt>
              <dd className="font-mono" style={{ color: "var(--text-main)" }}>
                {status.tenant_id}
              </dd>
              <dt style={{ color: "var(--text-muted)" }}>接続日時</dt>
              <dd style={{ color: "var(--text-main)" }}>{formatDateTime(status.connected_at)}</dd>
            </dl>
            <div className="mt-4 flex justify-end">
              <DsButton
                type="button"
                variant="ghost"
                disabled={pendingAction !== null}
                onClick={() => setShowDisconnectConfirm(true)}
              >
                <HiArrowRightOnRectangle className="h-3.5 w-3.5" />
                接続を解除
              </DsButton>
            </div>
          </>
        )}
      </section>

      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiShieldCheck className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
              管理者の同意
            </h2>
          </div>
          <StatusBadge
            tone={consent === "granted" ? "success" : consent === "pending" ? "warning" : "muted"}
            label={formatConsent(consent)}
          />
        </div>

        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Bot が会議に参加して音声を取得するには、会議が属するテナントの管理者が
          アプリケーション権限に同意する必要があります。
        </p>
        <ul className="mt-2 list-disc pl-5 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <li>
            <code className="font-mono">Calls.JoinGroupCall.All</code> — 会議への参加
          </li>
          <li>
            <code className="font-mono">Calls.AccessMedia.All</code> — 会議音声の取得
          </li>
        </ul>

        {consent !== "granted" && (
          <div className="mt-4">
            <DsButton
              type="button"
              variant="secondary"
              disabled={!connected || pendingAction !== null}
              onClick={() => runAction("consent", requestTeamsAdminConsent)}
            >
              <HiCheckCircle className="h-3.5 w-3.5" />
              {pendingAction === "consent" ? "リクエスト中..." : "管理者の同意をリクエスト"}
            </DsButton>
            {!connected && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                先に Microsoft アカウントを接続してください。
              </p>
            )}
          </div>
        )}
      </section>

      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
          Bot の動作ポリシー
        </h2>
        <dl className="flex flex-col gap-3 text-[12px]">
          <PolicyRow
            label="録音中の表示"
            description="Bot が音声を取得している間、Teams の会議画面に録音中の通知を常時表示します。"
          />
          <PolicyRow
            label="入室の許可"
            description="ロビーが有効な会議では、主催者が Bot の入室を許可するまで音声を取得しません。"
          />
          <PolicyRow
            label="データの取り扱い"
            description="取得した音声は文字起こしと分析にのみ使用します。保存期間と削除ポリシーは管理画面で設定できるようになる予定です。"
          />
        </dl>
      </section>

      {ready && (
        <div className="flex justify-end">
          <Link to={upcomingPath}>
            <DsButton>
              <HiCalendarDays className="h-3.5 w-3.5" />
              予定会議から Bot を招待する
            </DsButton>
          </Link>
        </div>
      )}

      {showDisconnectConfirm && (
        <ConfirmDialog
          title="Teams 連携を解除しますか?"
          description="予約済みの Bot 参加もすべて取り消されます。再接続すればいつでもやり直せます。"
          confirmLabel={pendingAction === "disconnect" ? "解除中..." : "接続を解除"}
          cancelLabel="キャンセル"
          onCancel={() => setShowDisconnectConfirm(false)}
          onConfirm={async () => {
            await runAction("disconnect", disconnectTeamsIntegration);
            setShowDisconnectConfirm(false);
          }}
        />
      )}
    </div>
  );
}

function MockNotice() {
  return (
    <div
      className="rounded-(--ds-radius-panel) border p-4 text-[12px] leading-relaxed"
      style={{
        background: "var(--ds-surface-muted)",
        borderColor: "var(--ds-border)",
        color: "var(--text-sub)",
      }}
    >
      Teams 連携は現在モックです。実際の Microsoft アカウント連携・会議参加は行われず、
      このブラウザ内にのみ状態が保存されます。
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "muted" }) {
  const colors = {
    success: { background: "var(--tag-idea-bg)", color: "var(--success)" },
    warning: { background: "var(--tag-concern-bg)", color: "var(--warning)" },
    muted: { background: "var(--input-bg)", color: "var(--text-muted)" },
  };
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={colors[tone]}
    >
      {label}
    </span>
  );
}

function PolicyRow({ description, label }: { description: string; label: string }) {
  return (
    <div>
      <dt className="font-semibold" style={{ color: "var(--text-sub)" }}>
        {label}
      </dt>
      <dd className="mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {description}
      </dd>
    </div>
  );
}

function formatConsent(consent: TeamsIntegrationStatusDto["admin_consent"]) {
  switch (consent) {
    case "granted":
      return "同意済み";
    case "pending":
      return "承認待ち";
    default:
      return "未リクエスト";
  }
}

function formatDateTime(value?: string) {
  if (!value) {
    return "";
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
