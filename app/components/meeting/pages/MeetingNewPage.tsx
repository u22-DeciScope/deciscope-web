import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { HiCircleStack, HiPlay, HiPlus, HiVideoCamera } from "react-icons/hi2";

import { createMeeting } from "~/api/meetings/meetingsApi";
import {
  listReplayFixtures,
  startFixtureReplay,
  type FixtureInfoDto,
} from "~/api/replay/fixtureReplayApi";
import {
  getTeamsIntegrationStatus,
  validateTeamsJoinUrl,
  type TeamsIntegrationStatusDto,
} from "~/api/teams/teamsIntegrationApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspaceMeetingPath, workspacePath } from "~/routing/workspacePaths";

type MeetingSource = "fixture" | "teams";

const sourceOptions: { id: MeetingSource; label: string; icon: typeof HiCircleStack }[] = [
  { id: "fixture", label: "テストデータ", icon: HiCircleStack },
  { id: "teams", label: "Teams 会議", icon: HiVideoCamera },
];

export default function MeetingNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const integrationPath = workspacePath(workspaceId, "/settings/integrations");
  const [source, setSource] = useState<MeetingSource>(
    searchParams.get("source") === "teams" ? "teams" : "fixture",
  );
  const [title, setTitle] = useState("MVP0 テスト会議");
  const [fixtures, setFixtures] = useState<FixtureInfoDto[]>([]);
  const [selectedFixture, setSelectedFixture] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);
  const [joinUrl, setJoinUrl] = useState("");
  const [teamsStatus, setTeamsStatus] = useState<TeamsIntegrationStatusDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chrome = useMemo(
    () => ({
      header: {
        title: "会議を作成",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "会議を作成" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  useEffect(() => {
    let active = true;
    listReplayFixtures()
      .then((result) => {
        if (!active) {
          return;
        }
        setFixtures(result.fixtures);
        setSelectedFixture(result.fixtures[0]?.name ?? "");
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "fixture を取得できませんでした。");
        }
      });
    getTeamsIntegrationStatus()
      .then((result) => {
        if (active) {
          setTeamsStatus(result);
        }
      })
      .catch(() => {
        // Teams 連携状態が取れなくてもテストデータ会議の作成は妨げない。
      });
    return () => {
      active = false;
    };
  }, []);

  const teamsReady = teamsStatus?.connected === true && teamsStatus.admin_consent === "granted";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (source === "teams") {
      const validationError = validateTeamsJoinUrl(joinUrl);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (source === "fixture") {
        const meeting = await createMeeting(workspaceId, title, "fixture_replay");
        if (startImmediately && selectedFixture) {
          await startFixtureReplay(meeting.id, selectedFixture);
        }
        navigate(workspaceMeetingPath(workspaceId, meeting.id));
      } else {
        const meeting = await createMeeting(workspaceId, title, "teams_bot");
        navigate(workspaceMeetingPath(workspaceId, meeting.id));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "会議を作成できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mx-auto flex w-full max-w-160 flex-col gap-3" onSubmit={handleSubmit}>
      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <div className="mb-5">
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>
            会議を作成
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            会議の入力ソースを選択します。テストデータはバックエンドの再生で進行し、Teams 会議は分析
            Bot を参加させて音声を取得します。
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
              入力ソース
            </span>
            <div className="grid grid-cols-2 gap-2">
              {sourceOptions.map((option) => {
                const Icon = option.icon;
                const active = option.id === source;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setSource(option.id);
                      setError(null);
                    }}
                    className="flex items-center justify-center gap-2 rounded-(--ds-radius-control) px-3 py-2.5 text-[13px] font-semibold transition"
                    style={
                      active
                        ? {
                            background: "var(--brand-light)",
                            border: "1px solid var(--brand)",
                            color: "var(--brand)",
                          }
                        : {
                            background: "var(--input-bg)",
                            border: "1px solid var(--input-border)",
                            color: "var(--text-sub)",
                          }
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <DsInput
            label="会議名"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />

          {source === "fixture" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
                  テストデータ
                </span>
                <select
                  className="w-full rounded-(--ds-radius-control) px-3 py-2.5 text-[13px] outline-none"
                  style={{
                    background: "var(--input-bg)",
                    border: "1px solid var(--input-border)",
                    color: "var(--text-main)",
                  }}
                  value={selectedFixture}
                  onChange={(event) => setSelectedFixture(event.currentTarget.value)}
                >
                  {fixtures.length === 0 ? (
                    <option value="">テストデータがありません</option>
                  ) : (
                    fixtures.map((fixture) => (
                      <option key={fixture.name} value={fixture.name}>
                        {fixture.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label
                className="flex items-center gap-2 text-[12px]"
                style={{ color: "var(--text-sub)" }}
              >
                <input
                  type="checkbox"
                  checked={startImmediately}
                  onChange={(event) => setStartImmediately(event.currentTarget.checked)}
                />
                作成後にテストデータ再生を開始する
              </label>
            </>
          )}

          {source === "teams" && (
            <>
              <DsInput
                label="Teams 会議リンク"
                placeholder="https://teams.microsoft.com/l/meetup-join/..."
                value={joinUrl}
                onChange={(event) => setJoinUrl(event.currentTarget.value)}
              />
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Teams の会議招待に含まれる「会議に参加」リンクを貼り付けてください。Bot
                が会議に参加し、ロビーが有効な場合は主催者の入室許可を待ちます。
              </p>

              {!teamsReady && (
                <div
                  className="rounded-(--ds-radius-control) border px-3 py-2.5 text-[12px] leading-relaxed"
                  style={{
                    background: "var(--ds-surface-muted)",
                    borderColor: "var(--ds-border)",
                    color: "var(--text-sub)",
                  }}
                >
                  {teamsStatus?.connected
                    ? "テナント管理者の同意が完了していません。"
                    : "Teams 連携が未接続です。"}
                  <Link to={integrationPath} className="ml-1 font-semibold text-(--brand)">
                    Teams 連携を設定する
                  </Link>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <DsButton type="button" variant="secondary" onClick={() => navigate(meetingsPath)}>
          キャンセル
        </DsButton>
        {source === "fixture" ? (
          <DsButton type="submit" disabled={isSubmitting}>
            {startImmediately ? (
              <HiPlay className="h-3.5 w-3.5" />
            ) : (
              <HiPlus className="h-3.5 w-3.5" />
            )}
            {isSubmitting ? "作成中..." : "会議を作成"}
          </DsButton>
        ) : (
          <DsButton type="submit" disabled={isSubmitting || !teamsReady}>
            <HiVideoCamera className="h-3.5 w-3.5" />
            {isSubmitting ? "招待中..." : "Bot を招待して作成"}
          </DsButton>
        )}
      </div>
    </form>
  );
}
