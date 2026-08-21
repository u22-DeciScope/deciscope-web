import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedSession = vi.hoisted(() => ({
  handleLogout: vi.fn(),
  session: {
    current_workspace_id: "workspace-1",
    expires_at: "2099-01-01T00:00:00Z",
    user: {
      displayName: "Owner",
      display_name: "Owner",
      email: "owner@example.test",
      id: "user-1",
      photoURL: null,
    },
    workspaces: [
      {
        created_at: "2026-01-01T00:00:00Z",
        description: "",
        id: "workspace-1",
        name: "Responsive workspace",
        role: "owner" as const,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
}));

vi.mock("~/hooks/useAuthenticatedSession", () => ({
  useAuthenticatedSession: () => ({
    error: null,
    handleLogout: authenticatedSession.handleLogout,
    session: authenticatedSession.session,
    status: "authenticated",
    today: "2026年8月20日",
    user: authenticatedSession.session.user,
  }),
}));

import { AuthenticatedWorkspaceLayout } from "~/components/shared/layout/AuthenticatedWorkspaceLayout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/w/workspace-1/meetings"]}>
      <Routes>
        <Route path="/w/:workspaceId" element={<AuthenticatedWorkspaceLayout />}>
          <Route path="meetings" element={<div>会議一覧</div>} />
          <Route path="meetings/new" element={<div>会議作成画面</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthenticatedWorkspaceLayout mobile navigation", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("opens as a modal drawer and closes with Escape", () => {
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));

    expect(screen.getByRole("dialog", { name: "メインメニュー" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "メインメニュー" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "メニューを開く" }));
  });

  it("closes after navigating to another page", () => {
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.click(screen.getAllByRole("link", { name: "会議作成" })[0]);

    expect(screen.getByText("会議作成画面")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "メインメニュー" })).toBeNull();
  });

  it("keeps logout clickable inside the portal menu", () => {
    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.click(screen.getByRole("button", { name: /Owner/ }));

    const logoutButton = screen.getByRole("menuitem", { name: "ログアウト" });
    fireEvent.pointerDown(logoutButton);
    fireEvent.click(logoutButton);

    expect(screen.getByRole("dialog", { name: "ログアウトしますか？" })).toBeTruthy();
  });
});
