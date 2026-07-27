import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateAgendaProgressOverride } from "./agendaProgressApi";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("updateAgendaProgressOverride", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes the workspace-scoped agenda-progress endpoint with the status override body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        agendaProgress: {
          computedCurrentTopicId: "agenda-1",
          effectiveCurrentTopicId: "agenda-1",
          entries: [
            {
              id: "agenda-1",
              sourceType: "fixed_agenda",
              title: "予算計画",
              computedStatus: "discussing",
              manualStatus: "discussed",
              effectiveStatus: "discussed",
            },
          ],
        },
      }),
    );

    const result = await updateAgendaProgressOverride("workspace-1", "session-1", {
      entryId: "agenda-1",
      manualStatus: "discussed",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain(
      "/v1/workspaces/workspace-1/meeting-sessions/session-1/agenda-progress",
    );
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      entryId: "agenda-1",
      manualStatus: "discussed",
    });
    expect(result?.entries[0]).toMatchObject({
      id: "agenda-1",
      manualStatus: "discussed",
      effectiveStatus: "discussed",
    });
  });

  it("sends manualCurrentTopicId: null as the clear-override body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ agendaProgress: { entries: [] } }));

    await updateAgendaProgressOverride("workspace-1", "session-1", {
      manualCurrentTopicId: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ manualCurrentTopicId: null });
  });

  it("normalizes the { agendaProgress } response envelope", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        agendaProgress: {
          entries: [
            {
              id: "agenda-1",
              sourceType: "fixed_agenda",
              title: "予算計画",
              computedStatus: "not_started",
              // server-internal tracking field should be dropped by normalization
              activeRounds: 3,
            },
          ],
        },
      }),
    );

    const result = await updateAgendaProgressOverride("workspace-1", "session-1", {
      manualCurrentTopicId: "agenda-1",
    });

    expect(result).toEqual({
      entries: [
        {
          id: "agenda-1",
          sourceType: "fixed_agenda",
          title: "予算計画",
          computedStatus: "not_started",
          effectiveStatus: "not_started",
          focusNodeIds: [],
          linkState: "not-linkable",
        },
      ],
    });
  });

  it("throws ApiError when the response is not ok", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: "権限がありません" } }, { status: 403 }),
    );

    await expect(
      updateAgendaProgressOverride("workspace-1", "session-1", {
        manualCurrentTopicId: "agenda-1",
      }),
    ).rejects.toThrow("権限がありません");
  });
});
