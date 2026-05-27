import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockActivityFindMany, mockActivityUpdateMany, mockActivityUpsert, mockDailyReportFindUnique } = vi.hoisted(() => ({
  mockActivityFindMany: vi.fn(),
  mockActivityUpdateMany: vi.fn(),
  mockActivityUpsert: vi.fn(),
  mockDailyReportFindUnique: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: {
      findUnique: mockDailyReportFindUnique
    },
    activityItem: {
      findMany: mockActivityFindMany,
      upsert: mockActivityUpsert,
      updateMany: mockActivityUpdateMany
    }
  }
}));

describe("activity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only active activities for a report date", async () => {
    mockActivityFindMany.mockResolvedValue([]);

    const { listActivities } = await import("@/lib/services/activity");
    await listActivities("user-1", "2026-05-14");

    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          staleAt: null
        })
      })
    );
  });

  it("preserves stale imported rows while leaving new imports unattached until save", async () => {
    const importedActivity = { id: "activity-1", source: "JIRA", sourceId: "issue:10001" };
    const staleActivity = { id: "activity-old", metadata: null };
    mockActivityUpsert.mockResolvedValue({});
    mockActivityUpdateMany.mockResolvedValue({ count: 1 });
    mockActivityFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([staleActivity])
      .mockResolvedValueOnce([importedActivity]);

    const { upsertImportedActivities } = await import("@/lib/services/activity");
    const result = await upsertImportedActivities("JIRA", "user-1", "2026-05-14", [
      {
        source: "JIRA",
        sourceId: "issue:10001",
        title: "GEN-1: Active issue"
      }
    ]);

    expect(result).toEqual({ importedCount: 1, skippedCount: 0, staleCount: 1, activities: [importedActivity] });
    expect(mockDailyReportFindUnique).not.toHaveBeenCalled();
    expect(mockActivityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ dailyReportId: expect.anything() }),
        create: expect.not.objectContaining({ dailyReportId: expect.anything() })
      })
    );
    expect(mockActivityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ selected: true, staleAt: null }),
        create: expect.objectContaining({ selected: true, staleAt: null })
      })
    );
    expect(mockActivityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["activity-old"] }
        }),
        data: expect.objectContaining({
          staleAt: expect.any(Date)
        })
      })
    );
    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          source: "JIRA",
          staleAt: null
        })
      })
    );
  });

  it("keeps manually added Google Tasks active when sync returns only completed tasks", async () => {
    const completedActivity = { id: "activity-complete", source: "GOOGLE_TASKS", sourceId: "task-complete" };
    const manualActivity = {
      id: "activity-manual",
      source: "GOOGLE_TASKS",
      sourceId: "task-manual",
      metadata: { manuallyAdded: true }
    };
    const staleActivity = { id: "activity-old", metadata: null };
    mockActivityUpsert.mockResolvedValue({});
    mockActivityUpdateMany.mockResolvedValue({ count: 1 });
    mockActivityFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([manualActivity, staleActivity])
      .mockResolvedValueOnce([completedActivity, manualActivity]);

    const { upsertImportedActivities } = await import("@/lib/services/activity");
    const result = await upsertImportedActivities("GOOGLE_TASKS", "user-1", "2026-05-14", [
      {
        source: "GOOGLE_TASKS",
        sourceId: "task-complete",
        title: "Completed task"
      }
    ]);

    expect(result).toEqual({
      importedCount: 1,
      skippedCount: 0,
      staleCount: 1,
      activities: [completedActivity, manualActivity]
    });
    expect(mockActivityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["activity-old"] } },
        data: expect.objectContaining({ staleAt: expect.any(Date) })
      })
    );
  });

  it("preserves local imported activity titles during sync refreshes", async () => {
    const existingActivity = {
      sourceId: "issue:10001",
      title: "Local rollout name",
      metadata: {
        generisLocalTitleOverride: true,
        generisRemoteTitle: "GEN-1: Active issue"
      }
    };

    mockActivityUpsert.mockResolvedValue({});
    mockActivityUpdateMany.mockResolvedValue({ count: 0 });
    mockActivityFindMany
      .mockResolvedValueOnce([existingActivity])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { upsertImportedActivities } = await import("@/lib/services/activity");
    await upsertImportedActivities("JIRA", "user-1", "2026-05-14", [
      {
        source: "JIRA",
        sourceId: "issue:10001",
        title: "GEN-1: Remote title changed"
      }
    ]);

    expect(mockActivityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          title: "Local rollout name",
          metadata: expect.objectContaining({
            generisLocalTitleOverride: true,
            generisRemoteTitle: "GEN-1: Remote title changed"
          })
        })
      })
    );
  });
});
