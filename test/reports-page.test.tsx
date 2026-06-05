import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockListReportHistory } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockListReportHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/services/reports", () => ({
  listReportHistory: mockListReportHistory,
}));

vi.mock("@/lib/serializers", () => ({
  serialize: (value: unknown) => value,
}));

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes repeated reportId params before loading report history", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        role: "EMPLOYEE",
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    mockListReportHistory.mockResolvedValue({ reports: [], totalCount: 0 });

    const { default: ReportsPage } = await import("@/app/(app)/reports/page");
    const element = await ReportsPage({
      searchParams: { reportId: ["report-1", "report-2"] },
    });

    expect(mockListReportHistory).toHaveBeenCalledWith("user-1", {
      limit: 10,
      targetReportId: null,
    });
    expect(element.props.initialOpenedReportId).toBeNull();
  });

  it("passes a single reportId through to report history", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        role: "EMPLOYEE",
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    mockListReportHistory.mockResolvedValue({ reports: [], totalCount: 0 });

    const { default: ReportsPage } = await import("@/app/(app)/reports/page");
    const element = await ReportsPage({
      searchParams: { reportId: "report-1" },
    });

    expect(mockListReportHistory).toHaveBeenCalledWith("user-1", {
      limit: 10,
      targetReportId: "report-1",
    });
    expect(element.props.initialOpenedReportId).toBe("report-1");
  });
});
