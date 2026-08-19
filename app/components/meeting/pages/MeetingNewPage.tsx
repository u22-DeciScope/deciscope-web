import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { HiChevronRight, HiVideoCamera } from "react-icons/hi2";

import { canManageMeetingSessions } from "~/api/auth/authApi";
import { createWorkspaceMeetingSession } from "~/api/meetingSessions/meetingSessionsApi";
import {
  readPendingMeetingNavigation,
  savePendingMeetingNavigation,
} from "~/api/meetingSessions/pendingMeetingNavigation";
import { validateTeamsJoinUrl } from "~/api/teams/teamsIntegrationApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { useAuthenticatedSession } from "~/hooks/useAuthenticatedSession";
import { workspaceMeetingPath, workspacePath } from "~/routing/workspacePaths";

export default function MeetingNewPage() {
  const navigate = useNavigate();
  const { hash, pathname, search } = useLocation();
  const { workspace, workspaceId } = useAuthenticatedLayout();
  const { user } = useAuthenticatedSession();
  const currentPath = `${pathname}${search}${hash}`;
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [joinUrl, setJoinUrl] = useState("");
  const [title, setTitle] = useState("");
  // 入力の認知負荷を下げるため、事前情報は「目的・ゴール」「前提・背景」「アジェンダ」の
  // 3項目に集約している(旧: 決定したいこと/懸念点/期待するアウトプットは目的・前提へ統合)。
  // DBカラムやAPIの旧フィールドは互換のため残っており、過去の会議はそのまま表示される。
  const [purpose, setPurpose] = useState("");
  const [context, setContext] = useState("");
  const [agenda, setAgenda] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreateMeeting = canManageMeetingSessions(workspace.role);
  const submitInFlightRef = useRef(false);
  const inFlightJoinUrlRef = useRef("");

  const chrome = useMemo(
    () => ({
      header: {
        title: "会議に入室",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "会議に入室" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  useEffect(() => {
    const pending = readPendingMeetingNavigation(workspaceId);
    if (!pending) {
      return;
    }

    navigate(pending.path, { replace: true });
  }, [currentPath, navigate, workspaceId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateMeeting) {
      setError("閲覧者権限のため、Botを会議に参加させることはできません。");
      return;
    }
    const normalizedJoinUrl = normalizeMeetingUrlForClient(joinUrl);
    const createdByEmail = user?.email?.trim() || "";

    if (submitInFlightRef.current && inFlightJoinUrlRef.current === normalizedJoinUrl) {
      return;
    }
    if (submitInFlightRef.current) {
      return;
    }
    setError(null);

    const validationError = validateTeamsJoinUrl(normalizedJoinUrl);
    if (validationError) {
      setError(validationError);
      return;
    }

    submitInFlightRef.current = true;
    inFlightJoinUrlRef.current = normalizedJoinUrl;
    setIsSubmitting(true);

    try {
      const session = await createWorkspaceMeetingSession(workspaceId, normalizedJoinUrl, {
        title,
        userProvidedTitle: title,
        candidateUserPrincipalNames: createdByEmail ? [createdByEmail] : undefined,
        createdByEmail: createdByEmail || undefined,
        purpose,
        context,
        agenda,
        customInstruction,
      });

      const targetWorkspaceId = session.workspaceId || workspaceId;
      const meetingPath = workspaceMeetingPath(targetWorkspaceId, session.sessionId);
      savePendingMeetingNavigation({
        workspaceId: targetWorkspaceId,
        sessionId: session.sessionId,
        path: meetingPath,
      });

      navigate(meetingPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "会議に入室できませんでした。");
    } finally {
      submitInFlightRef.current = false;
      inFlightJoinUrlRef.current = "";
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mx-auto flex w-full max-w-160 flex-col gap-3" onSubmit={handleSubmit}>
      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="flex flex-col gap-4">
          <DsInput
            label="会議URL"
            placeholder="https://teams.microsoft.com/l/meetup-join/..."
            value={joinUrl}
            disabled={isSubmitting || !canCreateMeeting}
            onChange={(event) => setJoinUrl(event.currentTarget.value)}
          />
          <DsInput
            label="会議名"
            placeholder="例: 週次定例"
            value={title}
            disabled={isSubmitting || !canCreateMeeting}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />

          <TextArea
            label="目的・ゴール"
            placeholder="この会議で決めたいこと・期待する成果も書いてください"
            value={purpose}
            disabled={isSubmitting || !canCreateMeeting}
            onChange={setPurpose}
          />
          <TextArea
            label="前提・背景"
            placeholder="経緯や現状の共有事項、気になっている懸念点など"
            value={context}
            disabled={isSubmitting || !canCreateMeeting}
            onChange={setContext}
          />
          <TextArea
            label="アジェンダ"
            placeholder={"例: 1. 現状確認\n2. 対応案の比較\n3. 決定"}
            value={agenda}
            disabled={isSubmitting || !canCreateMeeting}
            onChange={setAgenda}
          />

          <details className="group">
            <summary
              className="flex cursor-pointer select-none items-center gap-1 text-[12px] font-semibold [&::-webkit-details-marker]:hidden"
              style={{ color: "var(--text-sub)" }}
            >
              <HiChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
              AIへの補足指示(任意)
            </summary>
            <div className="mt-2">
              <TextArea
                ariaLabel="AIへの補足指示"
                placeholder="例: 財務影響は数値で示すこと"
                value={customInstruction}
                disabled={isSubmitting || !canCreateMeeting}
                onChange={setCustomInstruction}
              />
            </div>
          </details>

          {!canCreateMeeting && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-(--text-muted)">
              閲覧者権限のため、Botを会議に参加させることはできません。
            </p>
          )}

          {error && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}

          <DsButton type="submit" disabled={isSubmitting || !canCreateMeeting} fullWidth>
            <HiVideoCamera className="h-3.5 w-3.5" />
            {isSubmitting ? "会議に接続中…" : "会議に入室"}
          </DsButton>
        </div>
      </section>
    </form>
  );
}

function normalizeMeetingUrlForClient(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    url.hash = "";
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function TextArea({
  label,
  ariaLabel,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  // ラベルを表示しない場合(折りたたみのsummaryが視覚上のラベルを兼ねる場合)は
  // label を省略し、ariaLabel でスクリーンリーダー向けの名前を与える。
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
          {label}
        </span>
      )}
      <textarea
        className="min-h-20 w-full resize-y rounded-(--ds-radius-control) px-3 py-2.5 text-[13px] outline-none transition"
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--text-main)",
        }}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
