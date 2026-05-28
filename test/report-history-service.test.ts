import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDailyReportFindFirst, mockDailyReportFindMany } = vi.hoisted(() => ({
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
      findFirst: mockDailyReportFindFirst,
      findMany: mockDailyReportFindMany,
    },
  },
}));

describe("report history service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes a directly linked report outside the latest history window", async () => {
    const recentReport = { id: "recent-report" };
    const linkedReport = { id: "linked-report" };
    mockDailyReportFindMany.mockResolvedValue([recentReport]);
    mockDailyReportFindFirst.mockResolvedValue(linkedReport);

    const { listReportHistory } = await import("@/lib/services/reports");
    const reports = await listReportHistory("user-1", 1, "linked-report");

    expect(reports).toEqual([linkedReport, recentReport]);
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
    const reports = await listReportHistory("user-1", 30, "linked-report");

    expect(reports).toEqual([linkedReport]);
    expect(mockDailyReportFindFirst).not.toHaveBeenCalled();
  });
});
