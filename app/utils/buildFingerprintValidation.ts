const productionCommitSHA = /^[0-9a-fA-F]{7,64}$/;
const productionTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function validateProductionBuildFingerprint(
  mode: string,
  env: Record<string, string | undefined>,
) {
  if (mode !== "production") return;
  const version = env.VITE_FRONTEND_BUILD_VERSION?.trim() ?? "";
  const sha = env.VITE_COMMIT_SHA?.trim() ?? "";
  const timestamp = env.VITE_BUILD_TIMESTAMP?.trim() ?? "";
  const dirty = env.VITE_DIRTY_BUILD?.trim() ?? "";
  if (!version || version === "dev" || version === "unknown") {
    throw new Error("production frontend build version is not injected");
  }
  if (!productionCommitSHA.test(sha)) {
    throw new Error("production frontend git commit SHA is invalid");
  }
  if (!productionTimestamp.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("production frontend build timestamp is invalid");
  }
  if (dirty !== "true" && dirty !== "false") {
    throw new Error("production frontend dirty-build flag is invalid");
  }
}
