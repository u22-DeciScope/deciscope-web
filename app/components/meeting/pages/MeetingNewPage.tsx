import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { HiPlay, HiPlus } from "react-icons/hi2";

import { createMeeting } from "~/api/meetings/meetingsApi";
import { listReplayFixtures, startFixtureReplay, type FixtureInfoDto } from "~/api/replay/fixtureReplayApi";
import { DsButton } from "~/components/DsButton";
import { DsInput } from "~/components/DsInput";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspaceMeetingPath, workspacePath } from "~/routing/workspacePaths";

export default function MeetingNewPage() {
  const navigate = useNavigate();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [title, setTitle] = useState("MVP0 テスト会議");
  const [fixtures, setFixtures] = useState<FixtureInfoDto[]>([]);
  const [selectedFixture, setSelectedFixture] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chrome = useMemo(
    () => ({
      header: {
        title: "会議を作成",
        breadcrumbs: [
          { label: "ホーム", to: meetingsPath },
          { label: "会議を作成" },
        ],
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
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const meeting = await createMeeting(title, "fixture_replay");
      if (startImmediately && selectedFixture) {
        await startFixtureReplay(meeting.id, selectedFixture);
      }
      navigate(workspaceMeetingPath(workspaceId, meeting.id));
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
            MVP0 会議を作成
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            ローカル会議を作成し、バックエンドのテストデータ再生で会議を進行します。
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <DsInput
            label="会議名"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />

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

          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-sub)" }}>
            <input
              type="checkbox"
              checked={startImmediately}
              onChange={(event) => setStartImmediately(event.currentTarget.checked)}
            />
            作成後にテストデータ再生を開始する
          </label>

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
        <DsButton type="submit" disabled={isSubmitting}>
          {startImmediately ? <HiPlay className="h-3.5 w-3.5" /> : <HiPlus className="h-3.5 w-3.5" />}
          {isSubmitting ? "作成中..." : "会議を作成"}
        </DsButton>
      </div>
    </form>
  );
}
