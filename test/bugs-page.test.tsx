import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockCanReviewBugReports,
  mockGetVisibleBugReport,
  mockListVisibleBugReports,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCanReviewBugReports: vi.fn(),
  mockGetVisibleBugReport: vi.fn(),
  mockListVisibleBugReports: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/performance", () => ({
  withServerTiming: (_label: string, callback: () => Promise<unknown>) =>
    callback(),
}));

vi.mock("@/lib/serializers", () => ({
  serialize: (value: unknown) => value,
}));

vi.mock("@/lib/services/bug-reports", () => ({
  canReviewBugReports: mockCanReviewBugReports,
  getVisibleBugReport: mockGetVisibleBugReport,
  listVisibleBugReports: mockListVisibleBugReports,
}));

const newestOpenReport = {
  id: "bug-new",
  body: "New bug",
  pagePath: "/bugs",
  userAgent: "Vitest",
  status: "OPEN" as const,
  solvedAt: null,
  solvedBy: null,
  createdAt: new Date("2026-06-04T16:00:00.000Z"),
  reporter: {
    id: "employee-1",
    name: "Alex Employee",
    email: "alex@generisgp.com",
    image: null,
  },
  attachments: [],
};

const olderLinkedReport = {
  ...newestOpenReport,
  id: "bug-linked",
  body: "Older linked bug",
  createdAt: new Date("2026-05-01T16:00:00.000Z"),
};

describe("BugsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: {
        id: "user-1",
        name: "Admin",
        email: "admin@generisgp.com",
        role: "ADMIN",
        roles: ["ADMIN"],
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
    mockCanReviewBugReports.mockReturnValue(true);
    mockListVisibleBugReports.mockImplementation(({ status }) =>
      Promise.resolve(
        status === "OPEN"
          ? {
              reports: [newestOpenReport],
              page: 1,
              pageSize: 10,
              totalCount: 26,
            }
          : {
              reports: [],
              page: 1,
              pageSize: 10,
              totalCount: 0,
            },
      ),
    );
    mockGetVisibleBugReport.mockResolvedValue(olderLinkedReport);
  });

  it("passes a direct-linked bug report separately from the first paginated page", async () => {
    const { default: BugsPage } = await import("@/app/(app)/bugs/page");
    const element = await BugsPage({
      searchParams: { reportId: olderLinkedReport.id },
    });

    expect(mockGetVisibleBugReport).toHaveBeenCalledWith(olderLinkedReport.id, {
      userId: "user-1",
      canReviewAll: true,
    });
    expect(element.props.initialSelectedReportId).toBe(olderLinkedReport.id);
    expect(
      element.props.initialOpenReports.map((report: { id: string }) => report.id),
    ).toEqual([newestOpenReport.id]);
    expect(element.props.initialSelectedReport.id).toBe(olderLinkedReport.id);
  });
});
