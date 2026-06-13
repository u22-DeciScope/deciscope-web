import { useEffect, useMemo, useState } from "react";
import { HiArchiveBox, HiClipboardDocumentList, HiShieldCheck } from "react-icons/hi2";

import {
  getRetentionSettings,
  listAuditLogEntries,
  RETENTION_OPTIONS,
  updateRetentionSettings,
  type AuditEventType,
  type AuditLogEntryDto,
  type RetentionDays,
  type RetentionSettingsDto,
} from "~/api/audit/auditApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export default function AuditPage() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);
  const [retention, setRetention] = useState<RetentionSettingsDto | null>(null);
  const [selectedDays, setSelectedDays] = useState<RetentionDays>(90);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chrome = useMemo(
    () => ({
      header: {
        title: "監査とプライバシー",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "監査とプライバシー" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  useEffect(() => {
    let active = true;
    Promise.all([listAuditLogEntries(), getRetentionSettings()])
      .then(([logResult, retentionResult]) => {
        if (!active) {
          return;
        }
        setEntries(logResult.entries);
        setRetention(retentionResult);
        setSelectedDays(retentionResult.retention_days);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "監査ログを取得できませんでした。");
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

  async function handleSaveRetention() {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateRetentionSettings(selectedDays);
      setRetention(updated);
      const logResult = await listAuditLogEntries();
      setEntries(logResult.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保持期間を変更できませんでした。");
    } finally {
      setIsSaving(false);
    }
  }

  const retentionChanged = retention !== null && selectedDays !== retention.retention_days;

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
        <div className="mb-3 flex items-center gap-2">
          <HiArchiveBox className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
            データ保持期間
          </h2>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          会議の音声・文字起こし・分析結果を保持する期間を設定します。期間を超過したデータは
          自動的に削除され、削除の記録が監査ログに残ります。
        </p>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
              保持期間
            </span>
            <select
              className="w-full rounded-(--ds-radius-control) px-3 py-2.5 text-[13px] outline-none"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--text-main)",
              }}
              value={selectedDays}
              disabled={isLoading || isSaving}
              onChange={(event) =>
                setSelectedDays(Number(event.currentTarget.value) as RetentionDays)
              }
            >
              {RETENTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <DsButton
            type="button"
            disabled={isLoading || isSaving || !retentionChanged}
            onClick={handleSaveRetention}
          >
            {isSaving ? "保存中..." : "保存"}
          </DsButton>
        </div>
        {retention?.updated_at && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            最終変更: {formatDateTime(retention.updated_at)}
            {retention.updated_by ? `(${retention.updated_by})` : ""}
          </p>
        )}
      </section>

      <section
        className="ds-surface overflow-hidden rounded-(--ds-radius-panel)"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div
          className="flex h-10 items-center border-b px-5"
          style={{ borderColor: "var(--ds-border)" }}
        >
          <HiClipboardDocumentList
            className="mr-2 h-4 w-4 shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
            監査ログ
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
          {isLoading && <EmptyRow label="監査ログを読み込んでいます..." />}
          {!isLoading && entries.length === 0 && <EmptyRow label="監査ログはまだありません。" />}
          {!isLoading && entries.map((entry) => <AuditLogRow key={entry.id} entry={entry} />)}
        </div>
      </section>

      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-3 flex items-center gap-2">
          <HiShieldCheck className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
            同意とプライバシー
          </h2>
        </div>
        <dl className="flex flex-col gap-3 text-[12px]">
          <PolicyRow
            label="録音の通知"
            description="Bot が音声を取得している間、Teams の会議画面に録音中の通知を常時表示し、参加者全員が録音を認識できる状態を保ちます。"
          />
          <PolicyRow
            label="参加者の同意"
            description="録音と解析は会議の主催者が Bot の入室を許可した場合にのみ行われます。参加者から異議があった場合、主催者はいつでも Bot を退出させられます。"
          />
          <PolicyRow
            label="データの利用目的"
            description="取得した音声は文字起こし・決定事項の抽出・要約の生成にのみ使用し、それ以外の目的(モデル学習など)には使用しません。"
          />
          <PolicyRow
            label="アクセスの記録"
            description="どの会議でいつ録音・解析が行われ、誰が Bot を招待したかは、すべて上記の監査ログに記録されます。"
          />
          <PolicyRow
            label="削除リクエスト"
            description="保持期間の設定によらず、会議データは会議詳細ページからいつでも手動で削除できます(実装予定)。"
          />
        </dl>
      </section>
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
      監査ログとデータ保持設定は現在モックです。表示されるログはデモ用で、
      設定はこのブラウザ内にのみ保存されます。
    </div>
  );
}

function AuditLogRow({ entry }: { entry: AuditLogEntryDto }) {
  return (
    <div className="flex items-start gap-4 px-5 py-3">
      <div className="min-w-28 shrink-0">
        <p className="text-[12px] font-medium" style={{ color: "var(--text-main)" }}>
          {formatDateTime(entry.occurred_at)}
        </p>
      </div>
      <EventBadge eventType={entry.event_type} />
      <div className="min-w-0 flex-1">
        {entry.meeting_subject && (
          <p className="truncate text-[12px] font-medium" style={{ color: "var(--text-main)" }}>
            {entry.meeting_subject}
          </p>
        )}
        {entry.detail && (
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {entry.detail}
          </p>
        )}
      </div>
      <p className="shrink-0 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {entry.actor_name}
      </p>
    </div>
  );
}

function EventBadge({ eventType }: { eventType: AuditEventType }) {
  const { label, tone } = formatEventType(eventType);
  const colors = {
    success: { background: "var(--tag-idea-bg)", color: "var(--success)" },
    warning: { background: "var(--tag-concern-bg)", color: "var(--warning)" },
    brand: { background: "var(--brand-light)", color: "var(--brand)" },
    muted: { background: "var(--input-bg)", color: "var(--text-muted)" },
  };
  return (
    <span
      className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={colors[tone]}
    >
      {label}
    </span>
  );
}

function formatEventType(eventType: AuditEventType): {
  label: string;
  tone: "success" | "warning" | "brand" | "muted";
} {
  switch (eventType) {
    case "bot_invited":
      return { label: "Bot 招待", tone: "brand" };
    case "bot_cancelled":
      return { label: "招待取消", tone: "muted" };
    case "recording_started":
      return { label: "録音開始", tone: "success" };
    case "recording_stopped":
      return { label: "録音終了", tone: "muted" };
    case "analysis_completed":
      return { label: "解析完了", tone: "success" };
    case "retention_updated":
      return { label: "保持期間変更", tone: "warning" };
    case "data_deleted":
      return { label: "データ削除", tone: "warning" };
    default:
      return { label: eventType, tone: "muted" };
  }
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

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-5 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
      {label}
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
