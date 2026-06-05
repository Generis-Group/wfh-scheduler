import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCount, mockFindMany, mockTransaction } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockFindMany: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: {
      count: mockCount,
      findMany: mockFindMany,
    },
    $transaction: mockTransaction,
  },
}));

describe("admin report search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);
    mockTransaction.mockImplementation((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
  });

  it("matches displayed status labels", async () => {
    const { listReportsForAdminManagement } = await import(
      "@/lib/services/reports"
    );

    await listReportsForAdminManagement({ search: "Submitted" });

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ status: "SUBMITTED" }]),
        }),
      }),
    );
  });

  it("matches displayed report dates", async () => {
    const { listReportsForAdminManagement } = await import(
      "@/lib/services/reports"
    );

    await listReportsForAdminManagement({ search: "Jun 4, 2026" });

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { reportDate: new Date("2026-06-04T00:00:00.000Z") },
          ]),
        }),
      }),
    );
  });

  it("ignores invalid date-shaped searches", async () => {
    const { listReportsForAdminManagement } = await import(
      "@/lib/services/reports"
    );

    await listReportsForAdminManagement({ search: "2026-99-99" });

    const where = mockCount.mock.calls[0]?.[0]?.where as {
      OR?: Array<Record<string, unknown>>;
    };

    expect(where.OR?.some((clause) => "reportDate" in clause)).toBe(false);
  });

  it("uses page-based pagination for report management", async () => {
    const { listReportsForAdminManagement } = await import(
      "@/lib/services/reports"
    );

    await listReportsForAdminManagement({ page: 3, limit: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
  });
});
