import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedActivity } from "@/lib/normalizers";

vi.mock("server-only", () => ({}));

const {
  mockAppSettingFindUnique,
  mockActivityItemFindMany,
  mockActivityItemFindUnique,
  mockActivityItemUpsert,
  mockDailyReportFindUnique,
  mockDailyReportUpdate,
  mockDailyReportUpsert,
  mockGetGoogleServices,
  mockGetHubSpotLoggedHoursConfig,
  mockGetJiraConnection,
  mockSearchHubSpotLoggedHours,
  mockExtractGmailActivitiesWithAI,
  mockDedupeGmailActivities,
  mockExtractGoogleChatActivitiesWithAI,
  mockDedupeGoogleChatActivities,
  mockReportRevisionCreate,
  mockSyncRunCreate,
  mockSyncRunUpdate,
  mockUpsertImportedActivities,
  mockUserFindUnique,
  mockUserIntegrationSettingsUpsert,
} = vi.hoisted(() => ({
  mockAppSettingFindUnique: vi.fn(),
  mockActivityItemFindMany: vi.fn(),
  mockActivityItemFindUnique: vi.fn(),
  mockActivityItemUpsert: vi.fn(),
  mockDailyReportFindUnique: vi.fn(),
  mockDailyReportUpdate: vi.fn(),
  mockDailyReportUpsert: vi.fn(),
  mockGetGoogleServices: vi.fn(),
  mockGetHubSpotLoggedHoursConfig: vi.fn(),
  mockGetJiraConnection: vi.fn(),
  mockSearchHubSpotLoggedHours: vi.fn(),
  mockExtractGmailActivitiesWithAI: vi.fn(),
  mockDedupeGmailActivities: vi.fn((activities) => activities),
  mockExtractGoogleChatActivitiesWithAI: vi.fn(),
  mockDedupeGoogleChatActivities: vi.fn((activities) => activities),
  mockReportRevisionCreate: vi.fn(),
  mockSyncRunCreate: vi.fn(),
  mockSyncRunUpdate: vi.fn(),
  mockUpsertImportedActivities: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockUserIntegrationSettingsUpsert: vi.fn(),
}));

vi.mock("@/lib/integrations/google", () => ({
  getGoogleServices: mockGetGoogleServices,
}));

vi.mock("@/lib/integrations/hubspot", () => ({
  getHubSpotLoggedHoursConfig: mockGetHubSpotLoggedHoursConfig,
  searchHubSpotLoggedHours: mockSearchHubSpotLoggedHours,
}));

vi.mock("@/lib/integrations/jira", () => ({
  getJiraConnection: mockGetJiraConnection,
}));

vi.mock("@/lib/services/activity", () => ({
  upsertImportedActivities: mockUpsertImportedActivities,
}));

vi.mock("@/lib/services/gmail-ai-import", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/gmail-ai-import")
  >("@/lib/services/gmail-ai-import");

  return {
    ...actual,
    extractGmailActivitiesWithAI: mockExtractGmailActivitiesWithAI,
    dedupeGmailActivities: mockDedupeGmailActivities,
  };
});

vi.mock("@/lib/services/google-chat-ai-import", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/services/google-chat-ai-import")
  >("@/lib/services/google-chat-ai-import");

  return {
    ...actual,
    extractGoogleChatActivitiesWithAI: mockExtractGoogleChatActivitiesWithAI,
    dedupeGoogleChatActivities: mockDedupeGoogleChatActivities,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: mockAppSettingFindUnique,
    },
    activityItem: {
      findMany: mockActivityItemFindMany,
      findUnique: mockActivityItemFindUnique,
      upsert: mockActivityItemUpsert,
    },
    dailyReport: {
      findUnique: mockDailyReportFindUnique,
      update: mockDailyReportUpdate,
      upsert: mockDailyReportUpsert,
    },
    reportRevision: {
      create: mockReportRevisionCreate,
    },
    syncRun: {
      create: mockSyncRunCreate,
      update: mockSyncRunUpdate,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
    userIntegrationSettings: {
      upsert: mockUserIntegrationSettingsUpsert,
    },
  },
}));

describe("sync service pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppSettingFindUnique.mockResolvedValue(null);
    mockSyncRunCreate.mockResolvedValue({ id: "sync-run-1" });
    mockSyncRunUpdate.mockResolvedValue({});
    mockActivityItemFindMany.mockResolvedValue([]);
    mockActivityItemFindUnique.mockResolvedValue(null);
    mockActivityItemUpsert.mockResolvedValue({});
    mockDailyReportFindUnique.mockResolvedValue(null);
    mockDailyReportUpdate.mockResolvedValue({});
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      status: "DRAFT",
    });
    mockReportRevisionCreate.mockResolvedValue({});
    mockExtractGmailActivitiesWithAI.mockResolvedValue([]);
    mockDedupeGmailActivities.mockImplementation((activities) => activities);
    mockExtractGoogleChatActivitiesWithAI.mockResolvedValue([]);
    mockDedupeGoogleChatActivities.mockImplementation(
      (activities) => activities,
    );
    mockGetHubSpotLoggedHoursConfig.mockReturnValue({
      apiBaseUrl: "https://api.hubapi.com",
      crmApiVersion: "2026-03",
      token: "hubspot-token",
      objectType: "time_entries",
      dateProperty: "work_date",
      durationProperty: "hours",
      durationUnit: "hours",
      userEmailProperty: "user_email",
      titleProperties: ["task_name"],
      descriptionProperties: ["notes"],
      pageLimit: 100,
      dateFilterFormat: "epochMillis",
    });
    mockSearchHubSpotLoggedHours.mockResolvedValue([]);
    mockUpsertImportedActivities.mockResolvedValue({
      importedCount: 1,
      skippedCount: 0,
      staleCount: 0,
    });
    mockUserFindUnique.mockResolvedValue({ email: "employee@generisgp.com" });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: [],
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
          return {
            issues: [
              {
                id: "10003",
                key: "GEN-3",
                fields: {
                  summary: "Worklog only",
                  updated: "2026-05-13T15:00:00.000Z",
                },
              },
            ],
          };
        }

        return body.nextPageToken
          ? {
              issues: [
                {
                  id: "10002",
                  key: "GEN-2",
                  fields: {
                    summary: "Second",
                    updated: "2026-05-14T15:00:00.000Z",
                    assignee: { accountId: "jira-user-1" },
                  },
                },
              ],
            }
          : {
              issues: [
                {
                  id: "10001",
                  key: "GEN-1",
                  fields: {
                    summary: "First",
                    updated: "2026-05-14T14:00:00.000Z",
                    assignee: { accountId: "jira-user-1" },
                  },
                },
              ],
              nextPageToken: "search-page-2",
            };
      }

      if (
        path.includes("/worklog") &&
        path.includes("GEN-1") &&
        path.includes("startAt=0")
      ) {
        return {
          startAt: 0,
          maxResults: 1,
          total: 2,
          worklogs: [
            {
              id: "w1",
              started: "2026-05-14T13:00:00.000Z",
              timeSpentSeconds: 1800,
              author: { accountId: "jira-user-1" },
            },
          ],
        };
      }

      if (
        path.includes("/worklog") &&
        path.includes("GEN-1") &&
        path.includes("startAt=1")
      ) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          worklogs: [
            {
              id: "w2",
              started: "2026-05-14T14:00:00.000Z",
              timeSpentSeconds: 2700,
              author: { accountId: "jira-user-1" },
            },
          ],
        };
      }

      if (
        path.includes("/changelog") &&
        path.includes("GEN-1") &&
        path.includes("startAt=0")
      ) {
        return {
          startAt: 0,
          maxResults: 1,
          total: 2,
          values: [
            {
              id: "c1",
              created: "2026-05-14T15:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [
                { field: "status", fromString: "To Do", toString: "Done" },
              ],
            },
          ],
        };
      }

      if (
        path.includes("/changelog") &&
        path.includes("GEN-1") &&
        path.includes("startAt=1")
      ) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          values: [
            {
              id: "c2",
              created: "2026-05-14T16:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [{ field: "assignee", fromString: "A", toString: "B" }],
            },
          ],
        };
      }

      if (
        path.includes("/comment") &&
        path.includes("GEN-1") &&
        path.includes("startAt=0")
      ) {
        return {
          startAt: 0,
          maxResults: 1,
          total: 2,
          comments: [
            {
              id: "m1",
              created: "2026-05-14T17:00:00.000Z",
              author: { accountId: "jira-user-1" },
              body: "Done",
            },
          ],
        };
      }

      if (
        path.includes("/comment") &&
        path.includes("GEN-1") &&
        path.includes("startAt=1")
      ) {
        return {
          startAt: 1,
          maxResults: 1,
          total: 2,
          comments: [
            {
              id: "m2",
              created: "2026-05-14T18:00:00.000Z",
              author: { accountId: "jira-user-1" },
              body: "Second current-user comment",
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    expect(jiraFetch).toHaveBeenCalledWith(
      "/rest/api/3/search/jql",
      expect.objectContaining({
        body: expect.stringContaining("search-page-2"),
      }),
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      "/rest/api/3/search/jql",
      expect.objectContaining({
        body: expect.stringContaining(
          'updatedBy(\\"jira-user-1\\", \\"2026-05-14\\", \\"2026-05-15\\")',
        ),
      }),
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      "/rest/api/3/search/jql",
      expect.objectContaining({ body: expect.stringContaining("worklogDate") }),
    );
    expect(
      jiraFetch.mock.calls
        .filter(([path]) => path === "/rest/api/3/search/jql")
        .map(([, init]) => String(init?.body ?? "")),
    ).not.toEqual(
      expect.arrayContaining([expect.stringContaining("updated >=")]),
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      expect.stringContaining("GEN-1/worklog"),
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      expect.stringContaining("GEN-1/changelog?startAt=1"),
    );
    expect(jiraFetch).toHaveBeenCalledWith(
      expect.stringContaining("GEN-1/comment?startAt=1"),
    );
    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ??
      []) as NormalizedActivity[];
    expect(activities.map((activity) => activity.sourceId)).toEqual([
      "issue:10001",
    ]);
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "issue:10001",
          description:
            "Commented 2 times, Logged 1h 15m, Changed status, Updated assignee",
          durationMinutes: 75,
          metadata: expect.objectContaining({
            kind: "issue-day",
            activityTypes: ["comment", "worklog", "changelog"],
            commentCount: 2,
            worklogCount: 2,
            changedFields: ["status", "assignee"],
            statusTransitions: [{ from: "To Do", to: "Done" }],
          }),
        }),
      ]),
    );
    expect(activities.map((activity) => activity.sourceId)).not.toEqual(
      expect.arrayContaining([
        "worklog:w1",
        "worklog:w2",
        "changelog:10001:c1",
        "comment:10001:m1",
      ]),
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
                  reporter: { accountId: "someone-else" },
                },
              },
            ],
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
                reporter: { accountId: "someone-else" },
              },
            },
          ],
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
              body: "Investigated this today",
            },
          ],
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
              author: { accountId: "jira-user-1" },
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ??
      []) as NormalizedActivity[];

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: "issue:10004",
          description: "Commented",
          metadata: expect.objectContaining({
            activityTypes: ["comment"],
            commentCount: 1,
          }),
        }),
        expect.objectContaining({
          sourceId: "issue:10005",
          description: "Logged 30m",
          durationMinutes: 30,
          metadata: expect.objectContaining({
            activityTypes: ["worklog"],
            worklogCount: 1,
          }),
        }),
      ]),
    );
    expect(activities.map((activity) => activity.sourceId)).not.toEqual(
      expect.arrayContaining(["comment:10004:m4", "worklog:w5"]),
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
                    reporter: { accountId: "someone-else" },
                  },
                },
              ],
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
              body: "Clarified the note today",
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ??
      []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10011",
        description: "Commented",
        startedAt: new Date("2026-05-14T19:00:00.000Z"),
        endedAt: new Date("2026-05-14T19:00:00.000Z"),
        metadata: expect.objectContaining({
          activityTypes: ["comment"],
          commentCount: 1,
        }),
      }),
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
                    reporter: { accountId: "someone-else" },
                  },
                },
              ],
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
              items: [
                {
                  field: "status",
                  fromString: "To Do",
                  toString: "In Progress",
                },
              ],
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ??
      []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10006",
        description: "Changed status",
        metadata: expect.objectContaining({
          activityTypes: ["changelog"],
          changedFields: ["status"],
          statusTransitions: [{ from: "To Do", to: "In Progress" }],
        }),
      }),
    ]);
  });

  it("keeps Jira display-name fields as supporting detail with status changes", async () => {
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
                    reporter: { accountId: "someone-else" },
                  },
                },
              ],
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
                {
                  field: "status",
                  fromString: "To Do",
                  toString: "In Progress",
                },
                {
                  field: "Fix Version/s",
                  fromString: null,
                  toString: "Release 1",
                },
                {
                  field: "Component/s",
                  fromString: null,
                  toString: "Platform",
                },
              ],
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ??
      []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10010",
        description: "Changed status, Updated Fix Version/s and Component/s",
        metadata: expect.objectContaining({
          activityTypes: ["changelog"],
          changedFields: ["status", "Fix Version/s", "Component/s"],
          statusTransitions: [{ from: "To Do", to: "In Progress" }],
        }),
      }),
    ]);
  });

  it("ignores Jira supporting-only changelog activity", async () => {
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
                  id: "10012",
                  key: "GEN-12",
                  fields: {
                    summary: "Metadata-only update",
                    updated: "2026-05-14T19:00:00.000Z",
                    assignee: { accountId: "jira-user-1" },
                    reporter: { accountId: "someone-else" },
                  },
                },
              ],
            };
      }

      if (path.includes("GEN-12/changelog")) {
        return {
          startAt: 0,
          maxResults: 100,
          total: 1,
          values: [
            {
              id: "c12",
              created: "2026-05-14T19:00:00.000Z",
              author: { accountId: "jira-user-1" },
              items: [
                { field: "assignee", fromString: "A", toString: "Employee" },
                { field: "priority", fromString: "Medium", toString: "High" },
                { field: "labels", fromString: null, toString: "follow-up" },
              ],
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    expect(mockUpsertImportedActivities.mock.calls.at(-1)?.[3]).toEqual([]);
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
                    reporter: { accountId: "jira-user-1" },
                  },
                },
              ],
            };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    const activities = (mockUpsertImportedActivities.mock.calls.at(-1)?.[3] ??
      []) as NormalizedActivity[];

    expect(activities).toEqual([
      expect.objectContaining({
        sourceId: "issue:10009",
        description: "Updated issue",
        metadata: expect.objectContaining({
          activityTypes: ["issue"],
        }),
      }),
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
                    reporter: { accountId: "someone-else" },
                  },
                },
              ],
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
              items: [{ field: "Rank", fromString: "1", toString: "2" }],
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
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
                    reporter: { accountId: "jira-user-1" },
                  },
                },
              ],
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
              items: [{ field: "Rank", fromString: "1", toString: "2" }],
            },
          ],
        };
      }

      return {
        startAt: 0,
        maxResults: 100,
        total: 0,
        worklogs: [],
        values: [],
        comments: [],
      };
    });
    mockGetJiraConnection.mockResolvedValue({
      resource: { id: "cloud-1", url: "https://generis.atlassian.net" },
      fetch: jiraFetch,
    });

    const { syncJira } = await import("@/lib/services/sync");
    await syncJira("user-1", "2026-05-14");

    expect(mockUpsertImportedActivities.mock.calls.at(-1)?.[3]).toEqual([]);
  });

  it("imports HubSpot logged hours for the current user's email", async () => {
    mockSearchHubSpotLoggedHours.mockResolvedValue([
      {
        id: "hubspot-hours-1",
        properties: {
          user_email: "employee@generisgp.com",
          work_date: "2026-05-14T14:00:00.000Z",
          hours: "1.5",
          task_name: "Campaign landing page QA",
          notes: "Checked launch blockers",
        },
      },
    ]);

    const { syncHubSpot } = await import("@/lib/services/sync");
    await syncHubSpot("user-1", "2026-05-14");

    expect(mockSearchHubSpotLoggedHours).toHaveBeenCalledWith(
      expect.objectContaining({
        objectType: "time_entries",
        dateProperty: "work_date",
      }),
      "employee@generisgp.com",
      new Date("2026-05-14T04:00:00.000Z"),
      new Date("2026-05-15T04:00:00.000Z"),
    );
    expect(mockUpsertImportedActivities).toHaveBeenLastCalledWith(
      "HUBSPOT",
      "user-1",
      "2026-05-14",
      [
        expect.objectContaining({
          source: "HUBSPOT",
          sourceId: "logged-hours:time_entries:hubspot-hours-1",
          title: "Campaign landing page QA",
          description: "Checked launch blockers",
          durationMinutes: 90,
        }),
      ],
    );
  });

  it("paginates Google Calendar events", async () => {
    const eventsList = vi.fn(async (params) =>
      params.pageToken
        ? {
            data: {
              items: [
                {
                  id: "event-2",
                  summary: "Second",
                  start: { dateTime: "2026-05-14T10:00:00-04:00" },
                  end: { dateTime: "2026-05-14T10:30:00-04:00" },
                  attendees: [
                    {
                      email: "employee@generisgp.com",
                      responseStatus: "accepted",
                    },
                  ],
                },
              ],
            },
          }
        : {
            data: {
              items: [
                {
                  id: "event-1",
                  summary: "First",
                  start: { dateTime: "2026-05-14T09:00:00-04:00" },
                  end: { dateTime: "2026-05-14T09:30:00-04:00" },
                  attendees: [
                    {
                      email: "employee@generisgp.com",
                      responseStatus: "accepted",
                    },
                  ],
                },
              ],
              nextPageToken: "event-page-2",
            },
          },
    );
    mockGetGoogleServices.mockResolvedValue({
      calendar: { events: { list: eventsList } },
      tasks: {},
    });

    const { syncGoogleCalendar } = await import("@/lib/services/sync");
    await syncGoogleCalendar("user-1", "2026-05-14");

    expect(eventsList).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: "event-page-2" }),
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_CALENDAR",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "event-1" }),
        expect.objectContaining({ sourceId: "event-2" }),
      ]),
    );
  });

  it("imports only accepted Google Calendar meetings", async () => {
    const eventsList = vi.fn(async () => ({
      data: {
        items: [
          {
            id: "accepted-event",
            summary: "Accepted meeting",
            start: { dateTime: "2026-05-14T09:00:00-04:00" },
            end: { dateTime: "2026-05-14T09:30:00-04:00" },
            attendees: [
              { email: "employee@generisgp.com", responseStatus: "accepted" },
            ],
          },
          {
            id: "needs-action-event",
            summary: "Unanswered meeting",
            start: { dateTime: "2026-05-14T10:00:00-04:00" },
            end: { dateTime: "2026-05-14T10:30:00-04:00" },
            attendees: [
              {
                email: "employee@generisgp.com",
                responseStatus: "needsAction",
              },
            ],
          },
          {
            id: "tentative-event",
            summary: "Tentative meeting",
            start: { dateTime: "2026-05-14T11:00:00-04:00" },
            end: { dateTime: "2026-05-14T11:30:00-04:00" },
            attendees: [
              { email: "employee@generisgp.com", responseStatus: "tentative" },
            ],
          },
          {
            id: "declined-event",
            summary: "Declined meeting",
            start: { dateTime: "2026-05-14T12:00:00-04:00" },
            end: { dateTime: "2026-05-14T12:30:00-04:00" },
            attendees: [
              { email: "employee@generisgp.com", responseStatus: "declined" },
            ],
          },
          {
            id: "self-created-event",
            summary: "Focus block",
            creator: { self: true },
            start: { dateTime: "2026-05-14T13:00:00-04:00" },
            end: { dateTime: "2026-05-14T13:30:00-04:00" },
          },
        ],
      },
    }));
    mockGetGoogleServices.mockResolvedValue({
      calendar: { events: { list: eventsList } },
      tasks: {},
    });

    const { syncGoogleCalendar } = await import("@/lib/services/sync");
    await syncGoogleCalendar("user-1", "2026-05-14");

    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_CALENDAR",
      "user-1",
      "2026-05-14",
      [
        expect.objectContaining({
          sourceId: "accepted-event",
          status: "accepted",
        }),
      ],
    );
  });

  it("records a revision when adding an unfinished Google Task to a submitted report", async () => {
    const tasklistsList = vi.fn(async () => ({
      data: { items: [{ id: "list-1", title: "Primary tasks" }] },
    }));
    const tasksGet = vi.fn(async () => ({
      data: {
        id: "task-1",
        title: "Draft rollout plan",
        status: "needsAction",
        updated: "2026-05-14T15:00:00.000Z",
        notes: "Please update the agenda PDF",
        webViewLink: "https://tasks.google.com/task/1",
      },
    }));
    const submittedReport = {
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      workLocation: "OFFICE",
      summary: "Submitted summary",
      status: "SUBMITTED",
      submittedAt: new Date("2026-05-14T20:00:00.000Z"),
      activities: [{ id: "activity-old", selected: true, employeeNote: null }],
    };

    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { get: tasksGet },
      },
    });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: ["list-1"],
    });
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      status: "SUBMITTED",
    });
    mockDailyReportFindUnique
      .mockResolvedValueOnce(submittedReport)
      .mockResolvedValueOnce({
        ...submittedReport,
        revisions: [],
        comments: [],
        readReceipts: [],
      });

    const { addGoogleTaskReference } = await import("@/lib/services/sync");
    await addGoogleTaskReference("user-1", "2026-05-14", "list-1", "task-1");

    expect(mockReportRevisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "report-1",
          editedById: "user-1",
        }),
      }),
    );
    expect(mockActivityItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          dailyReportId: "report-1",
          selected: true,
          status: "in progress",
        }),
        create: expect.objectContaining({
          dailyReportId: "report-1",
          selected: true,
          status: "in progress",
        }),
      }),
    );
    expect(mockDailyReportUpdate).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it("preserves a local title override when manually adding the same unfinished Google Task", async () => {
    const tasklistsList = vi.fn(async () => ({
      data: { items: [{ id: "list-1", title: "Primary tasks" }] },
    }));
    const tasksGet = vi.fn(async () => ({
      data: {
        id: "task-1",
        title: "Remote rollout plan",
        status: "needsAction",
        updated: "2026-05-14T15:00:00.000Z",
        notes: "Please update the agenda PDF",
        webViewLink: "https://tasks.google.com/task/1",
      },
    }));

    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { get: tasksGet },
      },
    });
    mockUserIntegrationSettingsUpsert.mockResolvedValue({
      jiraCloudId: "cloud-1",
      jiraAccountId: "jira-user-1",
      googleCalendarId: "primary",
      googleTaskListIds: ["list-1"],
    });
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      status: "DRAFT",
    });
    mockDailyReportFindUnique
      .mockResolvedValueOnce({
        id: "report-1",
        status: "DRAFT",
      })
      .mockResolvedValueOnce({
        id: "report-1",
        status: "DRAFT",
        activities: [],
      });
    mockActivityItemFindUnique.mockResolvedValue({
      title: "Local rollout title",
      metadata: {
        generisLocalTitleOverride: true,
        generisRemoteTitle: "Old remote title",
      },
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
            sourceId: "task-1",
          },
        },
        select: {
          title: true,
          metadata: true,
        },
      }),
    );
    expect(mockActivityItemUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          title: "Local rollout title",
          metadata: expect.objectContaining({
            generisLocalTitleOverride: true,
            generisRemoteTitle: "Remote rollout plan",
            manuallyAdded: true,
          }),
        }),
        create: expect.objectContaining({
          title: "Local rollout title",
          metadata: expect.objectContaining({
            generisLocalTitleOverride: true,
            generisRemoteTitle: "Remote rollout plan",
            manuallyAdded: true,
          }),
        }),
      }),
    );
  });

  it("paginates Google Task lists and tasks", async () => {
    const tasklistsList = vi.fn(async (params) =>
      params.pageToken
        ? { data: { items: [] } }
        : {
            data: {
              items: [{ id: "list-1", title: "Primary tasks" }],
              nextPageToken: "task-list-page-2",
            },
          },
    );
    const tasksList = vi.fn(async (params) => {
      if (params.completedMin && !params.pageToken) {
        return {
          data: {
            items: [
              {
                id: "task-1",
                title: "First task",
                status: "completed",
                completed: "2026-05-14T14:00:00.000Z",
              },
            ],
            nextPageToken: "task-page-2",
          },
        };
      }

      if (params.pageToken === "task-page-2") {
        return {
          data: {
            items: [
              {
                id: "task-2",
                title: "Second task",
                status: "completed",
                completed: "2026-05-14T15:00:00.000Z",
              },
            ],
          },
        };
      }

      return { data: { items: [] } };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { list: tasksList },
      },
    });

    const { syncGoogleTasks } = await import("@/lib/services/sync");
    await syncGoogleTasks("user-1", "2026-05-14");

    expect(tasklistsList).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: "task-list-page-2" }),
    );
    expect(tasksList).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: "task-page-2" }),
    );
    expect(tasksList).toHaveBeenCalledWith(
      expect.objectContaining({
        showAssigned: true,
        showCompleted: true,
        showHidden: true,
      }),
    );
    expect(tasksList.mock.calls.map(([params]) => params)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dueMin: expect.any(String) }),
        expect.objectContaining({ updatedMin: expect.any(String) }),
        expect.objectContaining({ showCompleted: false }),
      ]),
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_TASKS",
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({ sourceId: "task-1", status: "completed" }),
        expect.objectContaining({ sourceId: "task-2", status: "completed" }),
      ]),
    );
  });

  it("imports completed assigned Google Chat space tasks", async () => {
    const tasklistsList = vi.fn(async () => ({
      data: { items: [{ id: "assigned", title: "Assigned to me" }] },
    }));
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
                  spaceInfo: { space: "spaces/AAAA" },
                },
              },
            ],
          },
        };
      }

      return { data: { items: [] } };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      tasks: {
        tasklists: { list: tasklistsList },
        tasks: { list: tasksList },
      },
    });

    const { syncGoogleTasks } = await import("@/lib/services/sync");
    await syncGoogleTasks("user-1", "2026-05-14");

    expect(tasksList).toHaveBeenCalledWith(
      expect.objectContaining({ showAssigned: true, showHidden: true }),
    );
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
            assignmentSpace: "spaces/AAAA",
          }),
        }),
      ]),
    );
  });

  it("imports Gmail AI work items from paginated sent threads", async () => {
    const bodyData = Buffer.from(
      "Drafted the client rollout follow-up.",
    ).toString("base64url");
    const threadsList = vi.fn(async (params) => {
      if (!params.pageToken) {
        return {
          data: {
            threads: [{ id: "thread-1" }],
            nextPageToken: "thread-page-2",
          },
        };
      }

      return {
        data: {
          threads: [{ id: "thread-2" }],
        },
      };
    });
    const threadsGet = vi.fn(async (params) => ({
      data: {
        id: params.id,
        messages: [
          {
            id: `${params.id}-message-1`,
            threadId: params.id,
            internalDate: String(
              new Date("2026-05-14T14:00:00.000Z").getTime(),
            ),
            payload: {
              headers: [
                { name: "Subject", value: "Client rollout" },
                { name: "From", value: "Employee <employee@generisgp.com>" },
                { name: "To", value: "Client <client@example.com>" },
              ],
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: bodyData },
                },
              ],
            },
          },
        ],
      },
    }));
    const gmailActivity: NormalizedActivity = {
      source: "GMAIL",
      sourceId: "thread:thread-1:candidate:abc123",
      sourceContainerId: "thread-1",
      title: "Draft client rollout follow-up",
      description: "Drafted the client rollout follow-up.",
      selected: true,
      metadata: {
        importBatch: "gmail-ai-v1",
        threadId: "thread-1",
        messageIds: ["thread-1-message-1"],
      },
    };
    mockExtractGmailActivitiesWithAI.mockResolvedValue([gmailActivity]);
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      gmail: {
        users: {
          threads: {
            list: threadsList,
            get: threadsGet,
          },
        },
      },
      tasks: {},
    });

    const { syncGmail } = await import("@/lib/services/sync");
    await syncGmail("user-1", "2026-05-14");

    expect(threadsList).toHaveBeenCalledWith(
      expect.objectContaining({
        pageToken: "thread-page-2",
        q: expect.stringContaining("in:sent"),
      }),
    );
    expect(threadsGet).toHaveBeenCalledTimes(2);
    expect(mockExtractGmailActivitiesWithAI).toHaveBeenCalledWith(
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({
          threadId: "thread-1",
          messages: expect.arrayContaining([
            expect.objectContaining({ id: "thread-1-message-1" }),
          ]),
        }),
      ]),
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GMAIL",
      "user-1",
      "2026-05-14",
      [gmailActivity],
    );
  });

  it("continues Gmail thread pagination beyond the first 50 sent threads", async () => {
    const bodyData = Buffer.from("Drafted a client follow-up.").toString(
      "base64url",
    );
    const firstPageThreads = Array.from({ length: 50 }, (_, index) => ({
      id: `thread-${index + 1}`,
    }));
    const threadsList = vi.fn(async (params) => {
      if (!params.pageToken) {
        return {
          data: {
            threads: firstPageThreads,
            nextPageToken: "thread-page-2",
          },
        };
      }

      return {
        data: {
          threads: [{ id: "thread-51" }],
        },
      };
    });
    const threadsGet = vi.fn(async (params) => ({
      data: {
        id: params.id,
        messages: [
          {
            id: `${params.id}-message-1`,
            threadId: params.id,
            internalDate: String(
              new Date("2026-05-14T14:00:00.000Z").getTime(),
            ),
            payload: {
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: bodyData },
                },
              ],
            },
          },
        ],
      },
    }));
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      gmail: {
        users: {
          threads: {
            list: threadsList,
            get: threadsGet,
          },
        },
      },
      tasks: {},
    });

    const { syncGmail } = await import("@/lib/services/sync");
    await syncGmail("user-1", "2026-05-14");

    expect(threadsList).toHaveBeenCalledTimes(2);
    expect(threadsList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        maxResults: 100,
        pageToken: undefined,
      }),
    );
    expect(threadsList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pageToken: "thread-page-2",
      }),
    );
    expect(threadsGet).toHaveBeenCalledTimes(51);
  });

  it("surfaces actionable Gmail permission failures", async () => {
    const threadsList = vi.fn(async () => {
      throw {
        response: {
          status: 403,
          data: {
            error: {
              message: "Request had insufficient authentication scopes.",
            },
          },
        },
      };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      gmail: {
        users: {
          threads: {
            list: threadsList,
            get: vi.fn(),
          },
        },
      },
      tasks: {},
    });

    const { syncGmail } = await import("@/lib/services/sync");

    await expect(syncGmail("user-1", "2026-05-14")).rejects.toThrow(
      "Reconnect Google and approve Gmail access.",
    );
    expect(mockSyncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("Reconnect Google"),
        }),
      }),
    );
  });

  it("surfaces missing Gmail migration failures before the sync run starts", async () => {
    mockSyncRunCreate.mockRejectedValue(
      new Error('invalid input value for enum "SyncProvider": "GMAIL"'),
    );

    const { syncGmail } = await import("@/lib/services/sync");

    await expect(syncGmail("user-1", "2026-05-14")).rejects.toThrow(
      "Gmail import needs the latest database migration.",
    );
    expect(mockSyncRunUpdate).not.toHaveBeenCalled();
  });

  it("stales Gmail imports when no sent threads match the day", async () => {
    const threadsList = vi.fn(async () => ({ data: {} }));
    const threadsGet = vi.fn();
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      gmail: {
        users: {
          threads: {
            list: threadsList,
            get: threadsGet,
          },
        },
      },
      tasks: {},
    });

    const { syncGmail } = await import("@/lib/services/sync");
    await syncGmail("user-1", "2026-05-14");

    expect(threadsGet).not.toHaveBeenCalled();
    expect(mockExtractGmailActivitiesWithAI).toHaveBeenCalledWith(
      "user-1",
      "2026-05-14",
      [],
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GMAIL",
      "user-1",
      "2026-05-14",
      [],
    );
  });

  it("records Gmail AI extraction failures on the sync run", async () => {
    const bodyData = Buffer.from("Drafted a client follow-up.").toString(
      "base64url",
    );
    const threadsList = vi.fn(async () => ({
      data: {
        threads: [{ id: "thread-1" }],
      },
    }));
    const threadsGet = vi.fn(async () => ({
      data: {
        id: "thread-1",
        messages: [
          {
            id: "message-1",
            threadId: "thread-1",
            internalDate: String(
              new Date("2026-05-14T14:00:00.000Z").getTime(),
            ),
            payload: {
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: bodyData },
                },
              ],
            },
          },
        ],
      },
    }));
    mockExtractGmailActivitiesWithAI.mockRejectedValue(
      new Error("Gemini unavailable"),
    );
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      gmail: {
        users: {
          threads: {
            list: threadsList,
            get: threadsGet,
          },
        },
      },
      tasks: {},
    });

    const { syncGmail } = await import("@/lib/services/sync");

    await expect(syncGmail("user-1", "2026-05-14")).rejects.toThrow(
      "Gemini unavailable",
    );
    expect(mockSyncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "Gemini unavailable",
        }),
      }),
    );
  });

  it("imports Google Chat AI work items from paginated same-day messages", async () => {
    const spacesList = vi.fn(async (params) => {
      if (!params.pageToken) {
        return {
          data: {
            spaces: [
              {
                name: "spaces/AAA",
                displayName: "Product",
                spaceUri: "https://chat.google.com/room/AAA",
                lastActiveTime: "2026-05-14T15:00:00.000Z",
              },
            ],
            nextPageToken: "space-page-2",
          },
        };
      }

      return {
        data: {
          spaces: [
            {
              name: "spaces/OLD",
              displayName: "Old space",
              lastActiveTime: "2026-05-13T15:00:00.000Z",
            },
          ],
        },
      };
    });
    const messagesList = vi.fn(async (params) => {
      if (!params.pageToken) {
        return {
          data: {
            messages: [
              {
                name: "spaces/AAA/messages/msg-1",
                createTime: "2026-05-14T14:00:00.000Z",
                text: "I finished the launch checklist and sent QA notes.",
                sender: { name: "users/current", type: "HUMAN" },
                thread: { name: "spaces/AAA/threads/thread-1" },
              },
            ],
            nextPageToken: "message-page-2",
          },
        };
      }

      return {
        data: {
          messages: [
            {
              name: "spaces/AAA/messages/msg-2",
              createTime: "2026-05-14T14:20:00.000Z",
              text: "QA notes are attached and ready for review.",
              sender: { name: "users/coworker", type: "HUMAN" },
              thread: { name: "spaces/AAA/threads/thread-1" },
            },
          ],
        },
      };
    });
    const getSpaceReadState = vi.fn(async () => ({
      data: {
        name: "users/current/spaces/AAA/spaceReadState",
      },
    }));
    const chatActivity: NormalizedActivity = {
      source: "GOOGLE_CHAT",
      sourceId: "chat:spaces/AAA/threads/thread-1:candidate:abc123",
      sourceContainerId: "spaces/AAA/threads/thread-1",
      title: "Send launch QA notes",
      description: "Prepared QA notes for the launch review.",
      selected: true,
      metadata: {
        importBatch: "google-chat-ai-v1",
        conversationId: "spaces/AAA/threads/thread-1",
        messageIds: ["spaces/AAA/messages/msg-1"],
      },
    };
    mockExtractGoogleChatActivitiesWithAI.mockResolvedValue([chatActivity]);
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      chat: {
        users: {
          spaces: {
            getSpaceReadState,
          },
        },
        spaces: {
          list: spacesList,
          messages: {
            list: messagesList,
          },
        },
      },
      gmail: {},
      tasks: {},
    });

    const { syncGoogleChat } = await import("@/lib/services/sync");
    await syncGoogleChat("user-1", "2026-05-14");

    expect(spacesList).toHaveBeenCalledWith(
      expect.objectContaining({ pageToken: "space-page-2" }),
    );
    expect(getSpaceReadState).toHaveBeenCalledWith({
      name: "users/me/spaces/AAA/spaceReadState",
    });
    expect(messagesList).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: "spaces/AAA",
        pageToken: "message-page-2",
        showDeleted: false,
        filter: expect.stringContaining("create_time"),
      }),
    );
    expect(messagesList).not.toHaveBeenCalledWith(
      expect.objectContaining({ parent: "spaces/OLD" }),
    );
    expect(mockExtractGoogleChatActivitiesWithAI).toHaveBeenCalledWith(
      "user-1",
      "2026-05-14",
      expect.arrayContaining([
        expect.objectContaining({
          conversationId: "spaces/AAA/threads/thread-1",
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: "spaces/AAA/messages/msg-1",
              isCurrentUser: true,
            }),
            expect.objectContaining({
              id: "spaces/AAA/messages/msg-2",
              isCurrentUser: false,
            }),
          ]),
        }),
      ]),
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_CHAT",
      "user-1",
      "2026-05-14",
      [chatActivity],
    );
  });

  it("stales Google Chat imports when no same-day messages match", async () => {
    const spacesList = vi.fn(async () => ({
      data: {
        spaces: [
          {
            name: "spaces/AAA",
            displayName: "Product",
            lastActiveTime: "2026-05-14T15:00:00.000Z",
          },
        ],
      },
    }));
    const messagesList = vi.fn(async () => ({ data: {} }));
    const getSpaceReadState = vi.fn(async () => ({
      data: {
        name: "users/current/spaces/AAA/spaceReadState",
      },
    }));
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      chat: {
        users: {
          spaces: {
            getSpaceReadState,
          },
        },
        spaces: {
          list: spacesList,
          messages: {
            list: messagesList,
          },
        },
      },
      gmail: {},
      tasks: {},
    });

    const { syncGoogleChat } = await import("@/lib/services/sync");
    await syncGoogleChat("user-1", "2026-05-14");

    expect(mockExtractGoogleChatActivitiesWithAI).toHaveBeenCalledWith(
      "user-1",
      "2026-05-14",
      [],
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockUpsertImportedActivities).toHaveBeenCalledWith(
      "GOOGLE_CHAT",
      "user-1",
      "2026-05-14",
      [],
    );
  });

  it("surfaces actionable Google Chat permission failures", async () => {
    const spacesList = vi.fn(async () => {
      throw {
        response: {
          status: 403,
          data: {
            error: {
              message: "Request had insufficient authentication scopes.",
            },
          },
        },
      };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      chat: {
        spaces: {
          list: spacesList,
          messages: {
            list: vi.fn(),
          },
        },
      },
      gmail: {},
      tasks: {},
    });

    const { syncGoogleChat } = await import("@/lib/services/sync");

    await expect(syncGoogleChat("user-1", "2026-05-14")).rejects.toThrow(
      "Google Chat access is blocked for this app.",
    );
    expect(mockSyncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: expect.stringContaining("Google Chat"),
        }),
      }),
    );
  });

  it("surfaces Google Chat API error details", async () => {
    const spacesList = vi.fn(async () => {
      throw {
        response: {
          status: 400,
          data: {
            error: {
              message: "Invalid Google Chat filter expression.",
            },
          },
        },
      };
    });
    mockGetGoogleServices.mockResolvedValue({
      calendar: {},
      chat: {
        spaces: {
          list: spacesList,
          messages: {
            list: vi.fn(),
          },
        },
      },
      gmail: {},
      tasks: {},
    });

    const { syncGoogleChat } = await import("@/lib/services/sync");

    await expect(syncGoogleChat("user-1", "2026-05-14")).rejects.toThrow(
      "Google Chat import failed: Invalid Google Chat filter expression.",
    );
    expect(mockSyncRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage:
            "Google Chat import failed: Invalid Google Chat filter expression.",
        }),
      }),
    );
  });

  it("surfaces missing Google Chat migration failures before the sync run starts", async () => {
    mockSyncRunCreate.mockRejectedValue(
      new Error('invalid input value for enum "SyncProvider": "GOOGLE_CHAT"'),
    );

    const { syncGoogleChat } = await import("@/lib/services/sync");

    await expect(syncGoogleChat("user-1", "2026-05-14")).rejects.toThrow(
      "Google Chat import needs the latest database migration.",
    );
    expect(mockSyncRunUpdate).not.toHaveBeenCalled();
  });
});
