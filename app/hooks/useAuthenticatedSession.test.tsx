import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  logoutSession: vi.fn(),
  signOutOfFirebase: vi.fn(),
}));

vi.mock("~/api/auth/authApi", () => ({
  fetchMe: api.fetchMe,
  logoutSession: api.logoutSession,
}));

vi.mock("~/api/firebase/firebaseAuthClient", () => ({
  signOutOfFirebase: api.signOutOfFirebase,
}));

import {
  AuthenticatedSessionProvider,
  useAuthenticatedSession,
} from "~/hooks/useAuthenticatedSession";

function AuthProbe() {
  const auth = useAuthenticatedSession();
  return (
    <>
      <span>{auth.status}</span>
      <button type="button" onClick={() => void auth.handleLogout()}>
        logout
      </button>
    </>
  );
}

describe("AuthenticatedSessionProvider logout", () => {
  beforeEach(() => {
    api.fetchMe.mockReset().mockResolvedValue({
      user: { id: "user-1", display_name: "Owner", email: "owner@example.test" },
      workspaces: [],
      current_workspace_id: "",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    api.logoutSession.mockReset();
    api.signOutOfFirebase.mockReset().mockResolvedValue(undefined);
  });

  it("removes authenticated React state before backend logout resolves", async () => {
    let releaseLogout!: () => void;
    api.logoutSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseLogout = resolve;
        }),
    );
    render(
      <MemoryRouter initialEntries={["/w/workspace-1/meetings"]}>
        <AuthenticatedSessionProvider>
          <AuthProbe />
        </AuthenticatedSessionProvider>
      </MemoryRouter>,
    );

    await screen.findByText("authenticated");
    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    expect(screen.getByText("unauthenticated")).toBeTruthy();
    releaseLogout();
  });
});
