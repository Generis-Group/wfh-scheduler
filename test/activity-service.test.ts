import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockActivityCreateMany,
  mockActivityFindMany,
  mockActivityUpdate,
  mockActivityUpdateMany,
  mockDailyReportUpsert,
} = vi.hoisted(() => ({
  mockActivityCreateMany: vi.fn(),
  mockActivityFindMany: vi.fn(),
  mockActivityUpdate: vi.fn(),
  mockActivityUpdateMany: vi.fn(),
  mockDailyReportUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: {
      upsert: mockDailyReportUpsert,
    },
    activityItem: {
      createMany: mockActivityCreateMany,
      findMany: mockActivityFindMany,
      update: mockActivityUpdate,
      updateMany: mockActivityUpdateMany,
    },
  },
}));

describe("activity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivityCreateMany.mockResolvedValue({ count: 1 });
    mockActivityUpdate.mockResolvedValue({});
    mockDailyReportUpsert.mockResolvedValue({
      id: "report-1",
      userId: "user-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      workLocation: "UNKNOWN",
      summary: "",
      status: "DRAFT",
      submittedAt: null,
      updatedAt: new Date("2026-05-14T12:00:00.000Z"),
    });
  });

  it("lists only active activities for a report date", async () => {
    mockActivityFindMany.mockResolvedValue([]);

    const { listActivities } = await import("@/lib/services/activity");
    await listActivities("user-1", "2026-05-14");

    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          staleAt: null,
        }),
      }),
    );
  });

  it("does not create a draft when an import has no results or stale rows", async () => {
    mockActivityFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { upsertImportedActivities } =
      await import("@/lib/services/activity");
    const result = await upsertImportedActivities(
      "JIRA",
      "user-1",
      "2026-05-14",
      [],
    );

    expect(result).toEqual({
      importedCount: 0,
      skippedCount: 0,
      staleCount: 0,
      activities: [],
    });
    expect(mockDailyReportUpsert).not.toHaveBeenCalled();
    expect(mockActivityCreateMany).not.toHaveBeenCalled();
    expect(mockActivityUpdate).not.toHaveBeenCalled();
    expect(mockActivityUpdateMany).not.toHaveBeenCalled();
  });

  it("preserves stale imported rows while attaching new imports to a draft", async () => {
    const importedActivity = {
      id: "activity-1",
      source: "JIRA",
      sourceId: "issue:10001",
    };
    const staleActivity = { id: "activity-old", metadata: null };
    mockActivityUpdateMany.mockResolvedValue({ count: 1 });
    mockActivityFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([staleActivity])
      .mockResolvedValueOnce([importedActivity]);

    const { upsertImportedActivities } =
      await import("@/lib/services/activity");
    const result = await upsertImportedActivities(
      "JIRA",
      "user-1",
      "2026-05-14",
      [
        {
          source: "JIRA",
          sourceId: "issue:10001",
          title: "GEN-1: Active issue",
        },
      ],
    );

    expect(result).toEqual({
      importedCount: 1,
      skippedCount: 0,
      staleCount: 1,
      activities: [importedActivity],
      report: expect.objectContaining({ id: "report-1" }),
    });
    expect(mockDailyReportUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_reportDate: {
            userId: "user-1",
            reportDate: expect.any(Date),
          },
        },
        create: expect.objectContaining({
          userId: "user-1",
          reportDate: expect.any(Date),
        }),
      }),
    );
    expect(mockActivityCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ dailyReportId: "report-1" }),
        ],
      }),
    );
    expect(mockActivityCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ selected: true, staleAt: null })],
      }),
    );
    expect(mockActivityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["activity-old"] },
        }),
        data: expect.objectContaining({
          staleAt: expect.any(Date),
        }),
      }),
    );
    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          source: "JIRA",
          staleAt: null,
        }),
      }),
    );
  });

  it("keeps manually added Google Tasks active when sync returns only completed tasks", async () => {
    const completedActivity = {
      id: "activity-complete",
      source: "GOOGLE_TASKS",
      sourceId: "task-complete",
    };
    const manualActivity = {
      id: "activity-manual",
      source: "GOOGLE_TASKS",
      sourceId: "task-manual",
      metadata: { manuallyAdded: true },
    };
    const staleActivity = { id: "activity-old", metadata: null };
    mockActivityUpdateMany.mockResolvedValue({ count: 1 });
    mockActivityFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([manualActivity, staleActivity])
      .mockResolvedValueOnce([completedActivity, manualActivity]);

    const { upsertImportedActivities } =
      await import("@/lib/services/activity");
    const result = await upsertImportedActivities(
      "GOOGLE_TASKS",
      "user-1",
      "2026-05-14",
      [
        {
          source: "GOOGLE_TASKS",
          sourceId: "task-complete",
          title: "Completed task",
        },
      ],
    );

    expect(result).toEqual({
      importedCount: 1,
      skippedCount: 0,
      staleCount: 1,
      activities: [completedActivity, manualActivity],
      report: expect.objectContaining({ id: "report-1" }),
    });
    expect(mockActivityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["activity-old"] } },
        data: expect.objectContaining({ staleAt: expect.any(Date) }),
      }),
    );
  });

  it("preserves local imported activity titles during sync refreshes", async () => {
    const existingActivity = {
      id: "activity-1",
      dailyReportId: null,
      sourceId: "issue:10001",
      sourceContainerId: null,
      title: "Local rollout name",
      description: null,
      status: null,
      sourceUrl: null,
      startedAt: null,
      endedAt: null,
      durationMinutes: null,
      selected: true,
      metadata: {
        generisLocalTitleOverride: true,
        generisRemoteTitle: "GEN-1: Active issue",
      },
      staleAt: null,
    };

    mockActivityUpdateMany.mockResolvedValue({ count: 0 });
    mockActivityFindMany
      .mockResolvedValueOnce([existingActivity])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { upsertImportedActivities } =
      await import("@/lib/services/activity");
    await upsertImportedActivities("JIRA", "user-1", "2026-05-14", [
      {
        source: "JIRA",
        sourceId: "issue:10001",
        title: "GEN-1: Remote title changed",
      },
    ]);

    expect(mockActivityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "activity-1" },
        data: expect.objectContaining({
          dailyReportId: "report-1",
          title: "Local rollout name",
          metadata: expect.objectContaining({
            generisLocalTitleOverride: true,
            generisRemoteTitle: "GEN-1: Remote title changed",
          }),
        }),
      }),
    );
  });

  it("preserves excluded imported activities during sync refreshes", async () => {
    const existingActivity = {
      id: "activity-1",
      dailyReportId: "report-1",
      sourceId: "issue:10001",
      sourceContainerId: null,
      title: "GEN-1: Active issue",
      description: null,
      status: null,
      sourceUrl: null,
      startedAt: null,
      endedAt: null,
      durationMinutes: null,
      selected: false,
      metadata: null,
      staleAt: null,
    };

    mockActivityUpdateMany.mockResolvedValue({ count: 0 });
    mockActivityFindMany
      .mockResolvedValueOnce([existingActivity])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existingActivity]);

    const { upsertImportedActivities } =
      await import("@/lib/services/activity");
    const result = await upsertImportedActivities("JIRA", "user-1", "2026-05-14", [
      {
        source: "JIRA",
        sourceId: "issue:10001",
        title: "GEN-1: Active issue",
      },
    ]);

    expect(result.activities).toEqual([
      expect.objectContaining({ id: "activity-1", selected: false }),
    ]);
    expect(mockActivityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selected: false,
        }),
      }),
    );
  });
});
