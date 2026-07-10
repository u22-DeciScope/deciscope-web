import { describe, expect, it, vi } from "vitest";

import { performSecureLogout } from "~/utils/secureLogout";

describe("performSecureLogout", () => {
  it("clears authenticated UI state and navigates before remote logout finishes", async () => {
    let releaseBackend!: () => void;
    const backend = new Promise<void>((resolve) => {
      releaseBackend = resolve;
    });
    const clearLocalAuthentication = vi.fn();
    const navigateAway = vi.fn();

    const completion = performSecureLogout({
      clearLocalAuthentication,
      notifyOtherTabs: vi.fn(),
      navigateAway,
      logoutBackend: () => backend,
      signOutIdentityProvider: () => Promise.reject(new Error("provider unavailable")),
    });

    expect(clearLocalAuthentication).toHaveBeenCalledOnce();
    expect(navigateAway).toHaveBeenCalledOnce();
    releaseBackend();
    await completion;
  });
});
