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
    mockActivityUpsert.mockResolvedValue({});
    mockActivityUpdateMany.mockResolvedValue({ count: 2 });
    mockActivityFindMany.mockResolvedValue([importedActivity]);

    const { upsertImportedActivities } = await import("@/lib/services/activity");
    const result = await upsertImportedActivities("JIRA", "user-1", "2026-05-14", [
      {
        source: "JIRA",
        sourceId: "issue:10001",
        title: "GEN-1: Active issue"
      }
    ]);

    expect(result).toEqual({ importedCount: 1, skippedCount: 0, staleCount: 2, activities: [importedActivity] });
    expect(mockDailyReportFindUnique).not.toHaveBeenCalled();
    expect(mockActivityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.not.objectContaining({ dailyReportId: expect.anything() }),
        create: expect.not.objectContaining({ dailyReportId: expect.anything() })
      })
    );
    expect(mockActivityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ staleAt: null }),
        create: expect.objectContaining({ staleAt: null })
      })
    );
    expect(mockActivityUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          source: "JIRA",
          staleAt: null,
          sourceId: { notIn: ["issue:10001"] }
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
          staleAt: null,
          sourceId: { in: ["issue:10001"] }
        })
      })
    );
  });
});
