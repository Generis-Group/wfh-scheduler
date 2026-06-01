import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedActivity } from "@/lib/normalizers";

const {
  mockAppSettingFindUnique,
  mockActivityItemFindUnique,
  mockActivityItemUpsert,
  mockDailyReportFindUnique,
  mockDailyReportUpdate,
  mockDailyReportUpsert,
  mockGetGoogleServices,
  mockGetJiraConnection,
  mockReportRevisionCreate,
  mockSyncRunCreate,
  mockSyncRunUpdate,
  mockUpsertImportedActivities,
  mockUserFindUnique,
  mockUserIntegrationSettingsUpsert
} = vi.hoisted(() => ({
  mockAppSettingFindUnique: vi.fn(),
  mockActivityItemFindUnique: vi.fn(),
  mockActivityItemUpsert: vi.fn(),
  mockDailyReportFindUnique: vi.fn(),
  mockDailyReportUpdate: vi.fn(),
  mockDailyReportUpsert: vi.fn(),
  mockGetGoogleServices: vi.fn(),
  mockGetJiraConnection: vi.fn(),
  mockReportRevisionCreate: vi.fn(),
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
    activityItem: {
      findUnique: mockActivityItemFindUnique,
      upsert: mockActivityItemUpsert
    },
    dailyReport: {
      findUnique: mockDailyReportFindUnique,
      update: mockDailyReportUpdate,
      upsert: mockDailyReportUpsert
    },
    reportRevision: {
      create: mockReportRevisionCreate
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
    mockActivityItemFindUnique.mockResolvedValue(null);
    mockActivityItemUpsert.mockResolvedValue({});
    mockDailyReportFindUnique.mockResolvedValue(null);
    mockDailyReportUpdate.mockResolvedValue({});
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      status: "DRAFT"
    });
    mockReportRevisionCreate.mockResolvedValue({});
    mockUpsertImportedActivities.mockResolvedValue({ importedCount: 1, skippedCount: 0, staleCount: 0 });
    mockUserFindUnique.mockResolvedValue({ email: "employee@generisgp.com" });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: []
    });
  });

  it("paginates Jira requests and aggregates same-day evidence by issue", async () => {
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
          worklogs: [
            {
              id: "w1",
              started: "2026-05-14T13:00:00.000Z",
              timeSpentSeconds: 1800,
              author: { accountId: "jira-user-1" }
            }
          ]
        };
      }

      if (path.includes("/worklog") && path.includes("GEN-1") && path.includes("startAt=1")) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          worklogs: [
            {
              id: "w2",
              started: "2026-05-14T14:00:00.000Z",
              timeSpentSeconds: 2700,
              author: { accountId: "jira-user-1" }
            }
          ]
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
              author: { accountId: "jira-user-1" },
              body: "Second current-user comment"
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
    await syncJira("user-1", "2026-05-14");

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
    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? []) as NormalizedActivity[];
    expect(activities.map((activity) => activity.sourceId)).toEqual(["issue:10001"]);
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "issue:10001",
          description: "Commented 2 times, Logged 1h 15m, Changed status, Updated assignee",
          durationMinutes: 75,
          metadata: expect.objectContaining({
            kind: "issue-day",
            activityTypes: ["comment", "worklog", "changelog"],
            commentCount: 2,
            worklogCount: 2,
            changedFields: ["status", "assignee"],
            statusTransitions: [{ from: "To Do", to: "Done" }]
          })
        })
      ])
    );
    expect(activities.map((activity) => activity.sourceId)).not.toEqual(
      expect.arrayContaining(["worklog:w1", "worklog:w2", "changelog:10001:c1", "comment:10001:m1"])
    );
  }, 20_000);

  it("imports Jira comments and worklogs from issues the user does not own as issue rows", async () => {
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
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? []) as NormalizedActivity[];

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "issue:10004",
          description: "Commented",
          metadata: expect.objectContaining({
            activityTypes: ["comment"],
            commentCount: 1
          })
        }),
        expect.objectContaining({
          sourceId: "issue:10005",
          description: "Logged 30m",
          durationMinutes: 30,
          metadata: expect.objectContaining({
            activityTypes: ["worklog"],
            worklogCount: 1
          })
        })
      ])
    );
    expect(activities.map((activity) => activity.sourceId)).not.toEqual(
      expect.arrayContaining(["comment:10004:m4", "worklog:w5"])
    );
  });

  it("imports Jira comment edits as comment evidence", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        return String(body.jql).includes("worklogDate")
          ? { issues: [] }
          : {
              issues: [
                {
                  id: "10011",
                  key: "GEN-11",
                  fields: {
                    summary: "Edited comment issue",
                    updated: "2026-05-14T19:00:00.000Z",
                    assignee: { accountId: "someone-else" },
                    reporter: { accountId: "someone-else" }
                  }
                }
              ]
            };
      }

      if (path.includes("GEN-11/comment")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          comments: [
            {
              id: "m11",
              created: "2026-05-10T12:00:00.000Z",
              updated: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              updateAuthor: { accountId: "jira-user-1" },
              body: "Clarified the note today"
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
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10011",
        description: "Commented",
        startedAt: new Date("2026-05-14T19:00:00.000Z"),
        endedAt: new Date("2026-05-14T19:00:00.000Z"),
        metadata: expect.objectContaining({
          activityTypes: ["comment"],
          commentCount: 1
        })
      })
    ]);
  });

  it("imports meaningful Jira changelog-only activity as one issue row", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        return String(body.jql).includes("worklogDate")
          ? { issues: [] }
          : {
              issues: [
                {
                  id: "10006",
                  key: "GEN-6",
                  fields: {
                    summary: "Changed by user",
                    updated: "2026-05-14T19:00:00.000Z",
                    assignee: { accountId: "someone-else" },
                    reporter: { accountId: "someone-else" }
                  }
                }
              ]
            };
      }

      if (path.includes("GEN-6/changelog")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          values: [
            {
              id: "c6",
              created: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [{ field: "status", fromString: "To Do", toString: "In Progress" }]
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
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10006",
        description: "Changed status",
        metadata: expect.objectContaining({
          activityTypes: ["changelog"],
          changedFields: ["status"],
          statusTransitions: [{ from: "To Do", to: "In Progress" }]
        })
      })
    ]);
  });

  it("imports Jira changelog display-name fields as meaningful activity", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        return String(body.jql).includes("worklogDate")
          ? { issues: [] }
          : {
              issues: [
                {
                  id: "10010",
                  key: "GEN-10",
                  fields: {
                    summary: "Release field updates",
                    updated: "2026-05-14T19:00:00.000Z",
                    assignee: { accountId: "someone-else" },
                    reporter: { accountId: "someone-else" }
                  }
                }
              ]
            };
      }

      if (path.includes("GEN-10/changelog")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          values: [
            {
              id: "c10",
              created: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [
                { field: "Fix Version/s", fromString: null, toString: "Release 1" },
                { field: "Component/s", fromString: null, toString: "Platform" }
              ]
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
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10010",
        description: "Updated Fix Version/s and Component/s",
        metadata: expect.objectContaining({
          activityTypes: ["changelog"],
          changedFields: ["Fix Version/s", "Component/s"]
        })
      })
    ]);
  });

  it("imports newly created Jira issues as issue rows", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        return String(body.jql).includes("worklogDate")
          ? { issues: [] }
          : {
              issues: [
                {
                  id: "10009",
                  key: "GEN-9",
                  fields: {
                    summary: "Created today",
                    created: "2026-05-14T13:00:00.000Z",
                    updated: "2026-05-14T13:00:00.000Z",
                    creator: { accountId: "jira-user-1" },
                    reporter: { accountId: "jira-user-1" }
                  }
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
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ?? []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10009",
        description: "Updated issue",
        metadata: expect.objectContaining({
          activityTypes: ["issue"]
        })
      })
    ]);
  });

  it("ignores noisy Jira changelog-only activity", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        return String(body.jql).includes("worklogDate")
          ? { issues: [] }
          : {
              issues: [
                {
                  id: "10007",
                  key: "GEN-7",
                  fields: {
                    summary: "Rank shuffled",
                    updated: "2026-05-14T19:00:00.000Z",
                    assignee: { accountId: "someone-else" },
                    reporter: { accountId: "someone-else" }
                  }
                }
              ]
            };
      }

      if (path.includes("GEN-7/changelog")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          values: [
            {
              id: "c7",
              created: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [{ field: "Rank", fromString: "1", toString: "2" }]
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
    await syncJira("user-1", "2026-05-14");

    expect(mockUpsertImportedActivities.mock.calls.at(-1)?.[3]).toEqual([]);
  });

  it("ignores noisy Jira changelog-only activity on issues owned by the user", async () => {
    const jiraFetch = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === "/rest/api/3/myself") {
        return { accountId: "jira-user-1", displayName: "Employee" };
      }

      if (path === "/rest/api/3/search/jql") {
        const body = JSON.parse(String(init?.body ?? "{}"));

        return String(body.jql).includes("worklogDate")
          ? { issues: [] }
          : {
              issues: [
                {
                  id: "10008",
                  key: "GEN-8",
                  fields: {
                    summary: "Owned rank shuffle",
                    updated: "2026-05-14T19:00:00.000Z",
                    assignee: { accountId: "jira-user-1" },
                    reporter: { accountId: "jira-user-1" }
                  }
                }
              ]
            };
      }

      if (path.includes("GEN-8/changelog")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          values: [
            {
              id: "c8",
              created: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [{ field: "Rank", fromString: "1", toString: "2" }]
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
    await syncJira("user-1", "2026-05-14");

    expect(mockUpsertImportedActivities.mock.calls.at(-1)?.[3]).toEqual([]);
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
    await syncGoogleCalendar("user-1", "2026-05-14");

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

  it("records a revision when adding an unfinished Google Task to a submitted report", async () => {
    const tasklistsList = vi.fn(async () => ({
      data: { items: [{ id: "list-1", title: "Primary tasks" }] }
    }));
    const tasksGet = vi.fn(async () => ({
      data: {
        id: "task-1",
        title: "Draft rollout plan",
        status: "needsAction",
        updated: "2026-05-14T15:00:00.000Z",
        notes: "Please update the agenda PDF",
        webViewLink: "https://tasks.google.com/task/1"
      }
    }));
    const submittedReport = {
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      workLocation: "OFFICE",
      summary: "Submitted summary",
      status: "SUBMITTED",
      submittedAt: new Date("2026-05-14T20:00:00.000Z"),
      activities: [{ id: "activity-old", selected: true, employeeNote: null }]
    };

    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { get: tasksGet }
      }
    });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: ["list-1"]
    });
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      status: "SUBMITTED"
    });
    mockDailyReportFindUnique
      .mockResolvedValueOnce(submittedReport)
      .mockResolvedValueOnce({ ...submittedReport, revisions: [], comments: [], readReceipts: [] });

    const { addGoogleTaskReference } = await import("@/lib/services/sync");
    await addGoogleTaskReference("user-1", "2026-05-14", "list-1", "task-1");

    expect(mockReportRevisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "report-1",
          editedById: "user-1"
        })
      })
    );
    expect(mockActivityItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          dailyReportId: "report-1",
          selected: true,
          status: "in progress"
        }),
        create: expect.objectContaining({
          dailyReportId: "report-1",
          selected: true,
          status: "in progress"
        })
      })
    );
    expect(mockDailyReportUpdate).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: { updatedAt: expect.any(Date) }
    });
  });

  it("preserves a local title override when manually adding the same unfinished Google Task", async () => {
    const tasklistsList = vi.fn(async () => ({
      data: { items: [{ id: "list-1", title: "Primary tasks" }] }
    }));
    const tasksGet = vi.fn(async () => ({
      data: {
        id: "task-1",
        title: "Remote rollout plan",
        status: "needsAction",
        updated: "2026-05-14T15:00:00.000Z",
        notes: "Please update the agenda PDF",
        webViewLink: "https://tasks.google.com/task/1"
      }
    }));

    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { get: tasksGet }
      }
    });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: ["list-1"]
    });
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      status: "DRAFT"
    });
    mockDailyReportFindUnique
      .mockResolvedValueOnce({
        id: "report-1",
        status: "DRAFT"
      })
      .mockResolvedValueOnce({
        id: "report-1",
        status: "DRAFT",
        activities: []
      });
    mockActivityItemFindUnique.mockResolvedValue({
      title: "Local rollout title",
      metadata: {
        generisLocalTitleOverride: true,
        generisRemoteTitle: "Old remote title"
      }
    });

    const { addGoogleTaskReference } = await import("@/lib/services/sync");
    await addGoogleTaskReference("user-1", "2026-05-14", "list-1", "task-1");

    expect(mockActivityItemFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_reportDate_source_sourceId: {
            userId: "user-1",
            reportDate: new Date("2026-05-14T00:00:00.000Z"),
            source: "GOOGLE_TASKS",
            sourceId: "task-1"
          }
        },
        select: {
          title: true,
          metadata: true
        }
      })
    );
    expect(mockActivityItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          title: "Local rollout title",
          metadata: expect.objectContaining({
            generisLocalTitleOverride: true,
            generisRemoteTitle: "Remote rollout plan",
            manuallyAdded: true
          })
        }),
        create: expect.objectContaining({
          title: "Local rollout title",
          metadata: expect.objectContaining({
            generisLocalTitleOverride: true,
            generisRemoteTitle: "Remote rollout plan",
            manuallyAdded: true
          })
        })
      })
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
    await syncGoogleTasks("user-1", "2026-05-14");

    expect(tasklistsList).toHaveBeenCalledWith(expect.objectContaining({ pageToken: "task-list-page-2" }));
    expect(tasksList).toHaveBeenCalledWith(expect.objectContaining({ pageToken: "task-page-2" }));
    expect(tasksList).toHaveBeenCalledWith(expect.objectContaining({ showAssigned: true, showCompleted: true, showHidden: true }));
    expect(tasksList.mock.calls.map(([params]) => params)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dueMin: expect.any(String) }),
        expect.objectContaining({ updatedMin: expect.any(String) }),
        expect.objectContaining({ showCompleted: false })
      ])
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_TASKS",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "task-1", status: "completed" }),
        expect.objectContaining({ sourceId: "task-2", status: "completed" })
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
    await syncGoogleTasks("user-1", "2026-05-14");

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
