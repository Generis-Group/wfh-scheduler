import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDailyReportCount, mockDailyReportFindFirst, mockDailyReportFindMany } = vi.hoisted(() => ({
  mockDailyReportCount: vi.fn(),
  mockDailyReportFindFirst: vi.fn(),
  mockDailyReportFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (callback: unknown) => callback,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: {
      count: mockDailyReportCount,
      findFirst: mockDailyReportFindFirst,
      findMany: mockDailyReportFindMany,
    },
  },
}));

describe("report history service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDailyReportCount.mockResolvedValue(1);
  });

  it("returns a directly linked report separately from the paginated page", async () => {
    const recentReport = { id: "recent-report" };
    const linkedReport = { id: "linked-report" };
    mockDailyReportFindMany.mockResolvedValue([recentReport]);
    mockDailyReportFindFirst.mockResolvedValue(linkedReport);

    const { listReportHistory } = await import("@/lib/services/reports");
    const page = await listReportHistory("user-1", 1, "linked-report");

    expect(page.reports).toEqual([recentReport]);
    expect(page.targetReport).toEqual(linkedReport);
    expect(page.totalCount).toBe(1);
    expect(mockDailyReportFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "linked-report", userId: "user-1" },
      }),
    );
  });

  it("does not fetch the linked report again when it is already loaded", async () => {
    const linkedReport = { id: "linked-report" };
    mockDailyReportFindMany.mockResolvedValue([linkedReport]);

    const { listReportHistory } = await import("@/lib/services/reports");
    const page = await listReportHistory("user-1", 30, "linked-report");

    expect(page.reports).toEqual([linkedReport]);
    expect(page.targetReport).toEqual(linkedReport);
    expect(page.totalCount).toBe(1);
    expect(mockDailyReportFindFirst).not.toHaveBeenCalled();
  });
});
