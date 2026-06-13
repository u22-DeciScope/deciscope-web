import { useMemo, useState } from "react";
import { HiArrowUpTray } from "react-icons/hi2";

import { getJob, type BackendJobDto } from "~/api/jobs/jobsApi";
import { uploadFile, type BackendUploadDto } from "~/api/uploads/uploadsApi";
import { DsButton } from "~/components/DsButton";
import { useWorkspaceChrome } from "~/components/shared/layout/WorkspaceChromeContext";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export default function UploadPage() {
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<BackendUploadDto | null>(null);
  const [job, setJob] = useState<BackendJobDto | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chrome = useMemo(
    () => ({
      header: {
        title: "ファイル処理",
        breadcrumbs: [{ label: "ホーム", to: meetingsPath }, { label: "ファイル処理" }],
      },
    }),
    [meetingsPath],
  );
  useWorkspaceChrome(chrome);

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadFile(workspaceId, file);
      setUpload(result.upload);
      setJob(result.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ファイルをアップロードできませんでした。");
    } finally {
      setIsUploading(false);
    }
  }

  async function refreshJob() {
    if (!job) {
      return;
    }
    setJob(await getJob(job.id));
  }

  return (
    <form className="mx-auto flex w-full max-w-160 flex-col gap-3" onSubmit={submitUpload}>
      <section
        className="ds-surface rounded-(--ds-radius-panel) p-5"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        <h1 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>
          ファイル処理の骨格
        </h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          MVP0 ではファイルをローカルに保存し、完了済みのモックジョブを返します。
        </p>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
            音声または動画ファイル
          </span>
          <input
            type="file"
            className="w-full rounded-(--ds-radius-control) px-3 py-2.5 text-[13px]"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              color: "var(--text-main)",
            }}
            onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
          />
        </label>

        {error && (
          <p className="mt-4 rounded-(--ds-radius-control) border px-3 py-2 text-[12px] text-red-600">
            {error}
          </p>
        )}
      </section>

      <div className="flex justify-end gap-2">
        {job && (
          <DsButton type="button" variant="secondary" onClick={refreshJob}>
            ジョブを更新
          </DsButton>
        )}
        <DsButton type="submit" disabled={!file || isUploading}>
          <HiArrowUpTray className="h-3.5 w-3.5" />
          {isUploading ? "アップロード中..." : "アップロード"}
        </DsButton>
      </div>

      {(upload || job) && (
        <section
          className="ds-surface rounded-(--ds-radius-panel) p-5"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <h2 className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text-main)" }}>
            結果
          </h2>
          <dl className="grid grid-cols-[120px_1fr] gap-2 text-[12px]">
            {upload && (
              <>
                <dt style={{ color: "var(--text-muted)" }}>アップロード</dt>
                <dd className="font-mono" style={{ color: "var(--text-main)" }}>
                  {upload.id}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>ファイル</dt>
                <dd style={{ color: "var(--text-main)" }}>{upload.filename}</dd>
              </>
            )}
            {job && (
              <>
                <dt style={{ color: "var(--text-muted)" }}>ジョブ</dt>
                <dd className="font-mono" style={{ color: "var(--text-main)" }}>
                  {job.id}
                </dd>
                <dt style={{ color: "var(--text-muted)" }}>状態</dt>
                <dd style={{ color: "var(--text-main)" }}>{job.status}</dd>
              </>
            )}
          </dl>
        </section>
      )}
    </form>
  );
}
