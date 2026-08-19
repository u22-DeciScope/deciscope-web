import { describe, expect, it } from "vitest";

import { validateProductionBuildFingerprint } from "./buildFingerprintValidation";

const valid = {
  VITE_FRONTEND_BUILD_VERSION: "main-42",
  VITE_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
  VITE_BUILD_TIMESTAMP: "2026-08-02T12:34:56Z",
  VITE_DIRTY_BUILD: "false",
};

describe("production frontend build fingerprint", () => {
  it("accepts a complete release identity and permits local development fallbacks", () => {
    expect(() => validateProductionBuildFingerprint("production", valid)).not.toThrow();
    expect(() => validateProductionBuildFingerprint("development", {})).not.toThrow();
  });

  it.each([
    ["development version", { ...valid, VITE_FRONTEND_BUILD_VERSION: "dev" }],
    ["missing SHA", { ...valid, VITE_COMMIT_SHA: "unknown" }],
    ["malformed SHA", { ...valid, VITE_COMMIT_SHA: "not-a-sha" }],
    ["missing timestamp", { ...valid, VITE_BUILD_TIMESTAMP: "unknown" }],
    ["invalid dirty flag", { ...valid, VITE_DIRTY_BUILD: "unknown" }],
  ])("rejects %s", (_name, fingerprint) => {
    expect(() => validateProductionBuildFingerprint("production", fingerprint)).toThrow();
  });
});
