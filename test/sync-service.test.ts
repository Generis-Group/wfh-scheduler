import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAppSettingFindUnique,
  mockGetGoogleServices,
  mockGetJiraConnection,
  mockSyncRunCreate,
  mockSyncRunUpdate,
  mockUpsertImportedActivities,
  mockUserFindUnique,
  mockUserIntegrationSettingsUpsert
} = vi.hoisted(() => ({
  mockAppSettingFindUnique: vi.fn(),
  mockGetGoogleServices: vi.fn(),
  mockGetJiraConnection: vi.fn(),
  mockSyncRunCreate: vi.fn(),
  mockSyncRunUpdate: vi.fn(),
  mockUpsertImportedActivities: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserIntegrationSettingsUpsert: vi.fn()
}));

vi.mock("@/lib/integrations/google", () => ({
  getGoogleServices: mockGetGoogleServices
}));

vi.mock("@/lib/integrations/jira", () => ({
  getJiraConnection: mockGetJiraConnection
}));

vi.mock("@/lib/services/activity", () => ({
  upsertImportedActivities: mockUpsertImportedActivities
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: mockAppSettingFindUnique
    },
    syncRun: {
      create: mockSyncRunCreate,
      update: mockSyncRunUpdate
    },
    user: {
      findUnique: mockUserFindUnique
    },
    userIntegrationSettings: {
      upsert: mockUserIntegrationSettingsUpsert
    }
  }
}));

describe("sync service pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockSyncRunCreate.mockResolvedValue({ id: "sync-run-1" });
    mockSyncRunUpdate.mockResolvedValue({});
    mockUpsertImportedActivities.mockResolvedValue({ importedCount: 1, skippedCount: 0, staleCount: 0 });
    mockUserFindUnique.mockResolvedValue({ email: "employee@generisgp.com" });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: []
    });
  });

  it("paginates Jira search, worklogs, and changelog requests", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (String(body.jql).includes("worklogDate")) {
          return { issues: [{ id: "10003", key: "GEN-3", fields: { summary: "Worklog only", updated: "2026-05-13T15:00:00.000Z" } }] };
        }

        return body.nextPageToken
          ? { issues: [{ id: "10002", key: "GEN-2", fields: { summary: "Second", updated: "2026-05-14T15:00:00.000Z", assignee: { accountId: "jira-user-1" } } }] }
          : {
              issues: [{ id: "10001", key: "GEN-1", fields: { summary: "First", updated: "2026-05-14T14:00:00.000Z", assignee: { accountId: "jira-user-1" } } }],
              nextPageToken: "search-page-2"
            };
      }

      if (path.includes("/worklog") && path.includes("GEN-1") && path.includes("startAt=0")) {
        return {
          startAt: 0,
          maxResults: 1,
          total: 2,
          worklogs: [{ id: "w1", started: "2026-05-14T13:00:00.000Z", author: { accountId: "jira-user-1" } }]
        };
      }

      if (path.includes("/worklog") && path.includes("GEN-1") && path.includes("startAt=1")) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          worklogs: [{ id: "w2", started: "2026-05-14T14:00:00.000Z", author: { accountId: "jira-user-1" } }]
        };
      }

      if (path.includes("/changelog") && path.includes("GEN-1") && path.includes("startAt=0")) {
        return {
          startAt: 0,
          maxResults: 1,
          total: 2,
          values: [
            {
              id: "c1",
              created: "2026-05-14T15:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [{ field: "status", fromString: "To Do", toString: "Done" }]
            }
          ]
        };
      }

      if (path.includes("/changelog") && path.includes("GEN-1") && path.includes("startAt=1")) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          values: [
            {
              id: "c2",
              created: "2026-05-14T16:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [{ field: "assignee", fromString: "A", toString: "B" }]
            }
          ]
        };
      }

      if (path.includes("/comment") && path.includes("GEN-1") && path.includes("startAt=0")) {
        return {
          startAt: 0,
          maxResults: 1,
          total: 2,
          comments: [
            {
              id: "m1",
              created: "2026-05-14T17:00:00.000Z",
              author: { accountId: "jira-user-1" },
              body: "Done"
            }
          ]
        };
      }

      if (path.includes("/comment") && path.includes("GEN-1") && path.includes("startAt=1")) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          comments: [
            {
              id: "m2",
              created: "2026-05-14T18:00:00.000Z",
              author: { accountId: "someone-else" },
              body: "Other comment"
            }
          ]
        };
      }

      return { startAt: 0, maxResults: 100, total: 0, worklogs: [], values: [], comments: [] };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14", "America/Toronto");

    expect(jiraFetch).toHaveBeenCalledWith(
      "/rest/api/3/search/jql",
      expect.objectContaining({ body: expect.stringContaining("search-page-2") })
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      "/rest/api/3/search/jql",
      expect.objectContaining({ body: expect.stringContaining('updatedBy(\\"jira-user-1\\", \\"2026-05-14\\", \\"2026-05-15\\")') })
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      "/rest/api/3/search/jql",
      expect.objectContaining({ body: expect.stringContaining("worklogDate") })
    );
    expect(
      jiraFetch.mock.calls
        .filter(([path]) => path === "/rest/api/3/search/jql")
        .map(([, init]) => String(init?.body ?? ""))
    ).not.toEqual(expect.arrayContaining([expect.stringContaining("updated >=")]));
    expect(jiraFetch).toHaveBeenCalledWith(expect.stringContaining("GEN-1/worklog"));
    expect(jiraFetch).toHaveBeenCalledWith(expect.stringContaining("GEN-1/changelog?startAt=1"));
    expect(jiraFetch).toHaveBeenCalledWith(expect.stringContaining("GEN-1/comment?startAt=1"));
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "JIRA",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "issue:10001" }),
        expect.objectContaining({ sourceId: "issue:10002" }),
        expect.objectContaining({ sourceId: "worklog:w1" }),
        expect.objectContaining({ sourceId: "worklog:w2" }),
        expect.objectContaining({ sourceId: "changelog:10001:c1" }),
        expect.objectContaining({ sourceId: "changelog:10001:c2" }),
        expect.objectContaining({ sourceId: "comment:10001:m1" })
      ])
    );
  });

  it("imports Jira comments and worklogs from issues the user does not own", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        if (String(body.jql).includes("worklogDate")) {
          return {
            issues: [
              {
                id: "10005",
                key: "GEN-5",
                fields: {
                  summary: "Worklogged issue",
                  updated: "2026-05-13T20:00:00.000Z",
                  assignee: { accountId: "someone-else" },
                  reporter: { accountId: "someone-else" }
                }
              }
            ]
          };
        }

        return {
          issues: [
            {
              id: "10004",
              key: "GEN-4",
              fields: {
                summary: "Commented issue",
                updated: "2026-05-14T19:00:00.000Z",
                assignee: { accountId: "someone-else" },
                reporter: { accountId: "someone-else" }
              }
            }
          ]
        };
      }

      if (path.includes("GEN-4/comment")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          comments: [
            {
              id: "m4",
              created: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              body: "Investigated this today"
            }
          ]
        };
      }

      if (path.includes("GEN-5/worklog")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          worklogs: [
            {
              id: "w5",
              started: "2026-05-14T20:00:00.000Z",
              timeSpentSeconds: 1800,
              author: { accountId: "jira-user-1" }
            }
          ]
        };
      }

      return { startAt: 0, maxResults: 100, total: 0, worklogs: [], values: [], comments: [] };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14", "America/Toronto");

    const activities = mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? [];

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "comment:10004:m4" }),
        expect.objectContaining({ sourceId: "worklog:w5" })
      ])
    );
    expect(activities).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "issue:10004" }),
        expect.objectContaining({ sourceId: "issue:10005" })
      ])
    );
  });

  it("paginates Google Calendar events", async () => {
    const eventsList = vi.fn(async (params) =>
      params.pageToken
        ? {
            data: {
              items: [{ id: "event-2", summary: "Second", start: { dateTime: "2026-05-14T10:00:00-04:00" }, end: { dateTime: "2026-05-14T10:30:00-04:00" } }]
            }
          }
        : {
            data: {
              items: [{ id: "event-1", summary: "First", start: { dateTime: "2026-05-14T09:00:00-04:00" }, end: { dateTime: "2026-05-14T09:30:00-04:00" } }],
              nextPageToken: "event-page-2"
            }
          }
    );
    mockGetGoogleServices.mockResolvedValue({
      calendar: { events: { list: eventsList } },
      tasks: {}
    });

    const { syncGoogleCalendar } = await import("@/lib/services/sync");
    await syncGoogleCalendar("user-1", "2026-05-14", "America/Toronto");

    expect(eventsList).toHaveBeenCalledWith(expect.objectContaining({ pageToken: "event-page-2" }));
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_CALENDAR",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "event-1" }),
        expect.objectContaining({ sourceId: "event-2" })
      ])
    );
  });

  it("paginates Google Task lists and tasks", async () => {
    const tasklistsList = vi.fn(async (params) =>
      params.pageToken
        ? { data: { items: [] } }
        : { data: { items: [{ id: "list-1", title: "Primary tasks" }], nextPageToken: "task-list-page-2" } }
    );
    const tasksList = vi.fn(async (params) => {
      if (params.completedMin && !params.pageToken) {
        return {
          data: {
            items: [{ id: "task-1", title: "First task", status: "completed", completed: "2026-05-14T14:00:00.000Z" }],
            nextPageToken: "task-page-2"
          }
        };
      }

      if (params.pageToken === "task-page-2") {
        return {
          data: {
            items: [{ id: "task-2", title: "Second task", status: "completed", completed: "2026-05-14T15:00:00.000Z" }]
          }
        };
      }

      return { data: { items: [] } };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { list: tasksList }
      }
    });

    const { syncGoogleTasks } = await import("@/lib/services/sync");
    await syncGoogleTasks("user-1", "2026-05-14", "America/Toronto");

    expect(tasklistsList).toHaveBeenCalledWith(expect.objectContaining({ pageToken: "task-list-page-2" }));
    expect(tasksList).toHaveBeenCalledWith(expect.objectContaining({ pageToken: "task-page-2" }));
    expect(tasksList).toHaveBeenCalledWith(expect.objectContaining({ showAssigned: true, showCompleted: true, showHidden: true }));
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_TASKS",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "task-1" }),
        expect.objectContaining({ sourceId: "task-2" })
      ])
    );
  });

  it("imports completed assigned Google Chat space tasks", async () => {
    const tasklistsList = vi.fn(async () => ({ data: { items: [{ id: "assigned", title: "Assigned to me" }] } }));
    const tasksList = vi.fn(async (params) => {
      if (params.completedMin) {
        return {
          data: {
            items: [
              {
                id: "chat-task-1",
                title: "Finish rollout note",
                status: "completed",
                hidden: true,
                completed: "2026-05-14T15:00:00.000Z",
                assignmentInfo: {
                  surfaceType: "SPACE",
                  linkToTask: "https://chat.google.com/space/task",
                  spaceInfo: { space: "spaces/AAAA" }
                }
              }
            ]
          }
        };
      }

      return { data: { items: [] } };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { list: tasksList }
      }
    });

    const { syncGoogleTasks } = await import("@/lib/services/sync");
    await syncGoogleTasks("user-1", "2026-05-14", "America/Toronto");

    expect(tasksList).toHaveBeenCalledWith(expect.objectContaining({ showAssigned: true, showHidden: true }));
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_TASKS",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "chat-task-1",
          sourceUrl: "https://chat.google.com/space/task",
          metadata: expect.objectContaining({
            assignmentSurface: "SPACE",
            assignmentSpace: "spaces/AAAA"
          })
        })
      ])
    );
  });
});
