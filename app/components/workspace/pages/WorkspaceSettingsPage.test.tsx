import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  layout: { current: null as unknown },
  listWorkspaceMembers: vi.fn(),
  listWorkspaceInvitations: vi.fn(),
}));

vi.mock("~/context/AuthenticatedLayoutContext", () => ({
  useAuthenticatedLayout: () => mocks.layout.current,
}));

vi.mock("~/api/workspaces/workspaceApi", () => ({
  listWorkspaceMembers: mocks.listWorkspaceMembers,
  listWorkspaceInvitations: mocks.listWorkspaceInvitations,
  inviteWorkspaceMember: vi.fn(),
  removeWorkspaceMember: vi.fn(),
  revokeWorkspaceInvitation: vi.fn(),
  updateWorkspace: vi.fn(),
  updateWorkspaceMemberRole: vi.fn(),
}));

import WorkspaceSettingsPage from "~/components/workspace/pages/WorkspaceSettingsPage";

function layout(workspaceId: string, name: string) {
  const workspace = {
    id: workspaceId,
    name,
    description: "",
    role: "owner",
    created_at: "",
    updated_at: "",
  };
  return {
    user: { id: "user-1", email: "owner@example.test", displayName: "Owner" },
    workspace,
    workspaceId,
    workspaces: [workspace],
  };
}

describe("WorkspaceSettingsPage request race", () => {
  beforeEach(() => {
    mocks.listWorkspaceMembers.mockReset();
    mocks.listWorkspaceInvitations.mockReset();
    mocks.listWorkspaceInvitations.mockResolvedValue({ invitations: [] });
  });

  it("does not apply workspace A after workspace B became active", async () => {
    const workspaceA = deferred<{ members: Array<Record<string, string>> }>();
    const workspaceB = deferred<{ members: Array<Record<string, string>> }>();
    mocks.listWorkspaceMembers.mockImplementation((workspaceId: string) =>
      workspaceId === "workspace-a" ? workspaceA.promise : workspaceB.promise,
    );
    mocks.layout.current = layout("workspace-a", "Workspace A");
    const view = render(
      <MemoryRouter>
        <WorkspaceSettingsPage />
      </MemoryRouter>,
    );

    mocks.layout.current = layout("workspace-b", "Workspace B");
    view.rerender(
      <MemoryRouter>
        <WorkspaceSettingsPage />
      </MemoryRouter>,
    );

    await act(async () => {
      workspaceB.resolve({
        members: [
          {
            workspace_id: "workspace-b",
            user_id: "user-b",
            display_name: "Member B",
            email: "b@example.test",
            role: "viewer",
          },
        ],
      });
    });
    await screen.findByText("Member B");

    await act(async () => {
      workspaceA.resolve({
        members: [
          {
            workspace_id: "workspace-a",
            user_id: "user-a",
            display_name: "Member A",
            email: "a@example.test",
            role: "viewer",
          },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Member A")).toBeNull();
      expect(screen.getByText("Member B")).toBeTruthy();
    });
  });
});
