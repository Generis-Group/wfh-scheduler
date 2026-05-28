import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockEmailRunCreate,
  mockEmailRunFindUnique,
  mockEmailRunUpdate,
  mockListReportsForDate,
  mockUserFindMany
} = vi.hoisted(() => ({
  mockEmailRunCreate: vi.fn(),
  mockEmailRunFindUnique: vi.fn(),
  mockEmailRunUpdate: vi.fn(),
  mockListReportsForDate: vi.fn(),
  mockUserFindMany: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany
    },
    emailRun: {
      findUnique: mockEmailRunFindUnique,
      findFirst: vi.fn(),
      create: mockEmailRunCreate,
      update: mockEmailRunUpdate
    }
  }
}));

vi.mock("@/lib/services/reports", () => ({
  listReportsForDate: mockListReportsForDate
}));

describe("review email digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("selects only active Generis reviewer/admin recipients", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "reviewer-1", email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER", status: "ACTIVE" },
      { id: "admin-1", email: "admin@generisgp.com", name: "Admin", role: "ADMIN", status: "ACTIVE" },
      { id: "employee-1", email: "employee@generisgp.com", name: "Employee", role: "EMPLOYEE", status: "ACTIVE" },
      { id: "disabled-1", email: "disabled@generisgp.com", name: "Disabled", role: "REVIEWER", status: "DISABLED" },
      { id: "external-1", email: "external@example.com", name: "External", role: "ADMIN", status: "ACTIVE" },
      { id: "no-email-1", email: null, name: "No Email", role: "ADMIN", status: "ACTIVE" }
    ]);

    const { selectReviewDigestRecipients } = await import("@/lib/services/email-digest");
    const recipients = await selectReviewDigestRecipients();

    expect(recipients).toEqual([
      { id: "reviewer-1", email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER" },
      { id: "admin-1", email: "admin@generisgp.com", name: "Admin", role: "ADMIN" }
    ]);
  });

  it("uses Toronto day boundaries for late and edited status", async () => {
    const { isReportEditedAfterDate, isReportLate } = await import("@/lib/services/email-digest");
    const report = {
      id: "r1",
      reportDate: "2026-05-14",
      status: "SUBMITTED" as const,
      workLocation: "WFH",
      submittedAt: "2026-05-15T03:30:00.000Z",
      updatedAt: "2026-05-15T03:30:00.000Z",
      activities: [],
      revisions: [{ createdAt: "2026-05-15T04:30:00.000Z" }]
    };

    expect(isReportLate(report, "2026-05-14")).toBe(false);
    expect(isReportEditedAfterDate(report, "2026-05-14")).toBe(true);
  });

  it("builds a concise digest for submitted, draft, missing, late, and edited reports", async () => {
    const { buildReviewDigest } = await import("@/lib/services/email-digest");
    const digest = buildReviewDigest({
      date: "2026-05-14",
      appBaseUrl: "https://reports.generisgp.com",
      recipients: [{ email: "reviewer@generisgp.com" }],
      rows: [
        {
          user: { id: "u1", name: "Submitted Employee", email: "submitted@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
          report: {
            id: "r1",
            reportDate: "2026-05-14",
            status: "SUBMITTED",
            workLocation: "HYBRID",
            submittedAt: "2026-05-14T18:00:00.000Z",
            updatedAt: "2026-05-14T18:00:00.000Z",
            activities: [{ selected: true, source: "JIRA" }],
            revisions: []
          }
        },
        {
          user: { id: "u2", name: "Draft Employee", email: "draft@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
          report: {
            id: "r2",
            reportDate: "2026-05-14",
            status: "DRAFT",
            workLocation: "WFH",
            submittedAt: null,
            updatedAt: "2026-05-14T19:00:00.000Z",
            activities: [],
            revisions: []
          }
        },
        {
          user: { id: "u3", name: "Late Employee", email: "late@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
          report: {
            id: "r3",
            reportDate: "2026-05-14",
            status: "SUBMITTED",
            workLocation: "OFFICE",
            submittedAt: "2026-05-15T04:30:00.000Z",
            updatedAt: "2026-05-15T04:30:00.000Z",
            activities: [],
            revisions: [{ createdAt: "2026-05-15T12:00:00.000Z" }]
          }
        },
        {
          user: { id: "u4", name: "Missing Employee", email: "missing@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
          report: null
        }
      ]
    });

    expect(digest.counts).toEqual({
      expected: 4,
      submitted: 2,
      drafts: 1,
      missing: 1,
      late: 1,
      edited: 1
    });
    expect(digest.text).toContain("Open review dashboard: https://reports.generisgp.com/review?date=2026-05-14");
    expect(digest.text).toContain("Missing reports: Missing Employee");
    expect(digest.text).toContain("Late/edited reports: Late Employee");
  });

  it("defaults digest coverage to employees who can submit reports", async () => {
    const { buildReviewDigest } = await import("@/lib/services/email-digest");
    const digest = buildReviewDigest({
      date: "2026-05-14",
      appBaseUrl: "https://reports.generisgp.com",
      recipients: [{ email: "reviewer@generisgp.com" }],
      rows: [
        {
          user: { id: "u1", name: "Employee", email: "employee@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
          report: null
        },
        {
          user: { id: "u2", name: "Reviewer", email: "reviewer@generisgp.com", role: "REVIEWER", status: "ACTIVE" },
          report: null
        },
        {
          user: { id: "u3", name: "Admin", email: "admin@generisgp.com", role: "ADMIN", status: "ACTIVE" },
          report: null
        }
      ]
    });

    expect(digest.counts.expected).toBe(1);
    expect(digest.text).toContain("Missing reports: Employee");
    expect(digest.text).not.toContain("Reviewer");
    expect(digest.text).not.toContain("Admin");
  });

  it("sends scheduled digests separately for each scoped reviewer/admin", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.EMAIL_FROM;
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "reports@generisgp.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "resend-message-1" }), { status: 200 }))
    );
    const reviewer = { id: "reviewer-1", email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER", status: "ACTIVE" };
    const admin = { id: "admin-1", email: "admin@generisgp.com", name: "Admin", role: "ADMIN", status: "ACTIVE" };
    mockUserFindMany
      .mockResolvedValueOnce([reviewer, admin])
      .mockResolvedValueOnce([reviewer])
      .mockResolvedValueOnce([admin]);
    mockEmailRunFindUnique.mockResolvedValue(null);
    mockListReportsForDate.mockResolvedValue([
      {
        user: { id: "u1", name: "Employee", email: "employee@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
        report: null
      }
    ]);
    mockEmailRunCreate.mockImplementation(async ({ data }) => ({ id: `run-${data.dedupeKey}`, ...data }));
    mockEmailRunUpdate.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));

    const { sendScheduledReviewDigests } = await import("@/lib/services/email-digest");
    const result = await sendScheduledReviewDigests({ date: "2026-05-14" });

    expect(result.emailRuns).toHaveLength(2);
    expect(mockListReportsForDate).toHaveBeenNthCalledWith(1, "2026-05-14", { userId: "reviewer-1", role: "REVIEWER" });
    expect(mockListReportsForDate).toHaveBeenNthCalledWith(2, "2026-05-14", { userId: "admin-1", role: "ADMIN" });
    expect(mockEmailRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: "review-digest:2026-05-14:reviewer-1" })
      })
    );
    expect(mockEmailRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dedupeKey: "review-digest:2026-05-14:admin-1" })
      })
    );

    if (previousApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = previousApiKey;
    }
    if (previousFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = previousFrom;
    }
  });

  it("continues scheduled digest delivery after one recipient fails", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.EMAIL_FROM;
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "reports@generisgp.com";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("temporary provider outage"))
        .mockResolvedValueOnce(new Response(JSON.stringify({ id: "resend-message-2" }), { status: 200 }))
    );
    const reviewer = { id: "reviewer-1", email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER", status: "ACTIVE" };
    const admin = { id: "admin-1", email: "admin@generisgp.com", name: "Admin", role: "ADMIN", status: "ACTIVE" };
    mockUserFindMany
      .mockResolvedValueOnce([reviewer, admin])
      .mockResolvedValueOnce([reviewer])
      .mockResolvedValueOnce([admin]);
    mockEmailRunFindUnique.mockResolvedValue(null);
    mockListReportsForDate.mockResolvedValue([
      {
        user: { id: "u1", name: "Employee", email: "employee@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
        report: null
      }
    ]);
    mockEmailRunCreate.mockImplementation(async ({ data }) => ({ id: `run-${data.dedupeKey}`, ...data }));
    mockEmailRunUpdate.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));

    const { sendScheduledReviewDigests } = await import("@/lib/services/email-digest");
    const result = await sendScheduledReviewDigests({ date: "2026-05-14" });

    expect(result.emailRuns).toHaveLength(2);
    expect(result.emailRuns[0]).toMatchObject({ status: "FAILED" });
    expect(result.emailRuns[1]).toMatchObject({ status: "SUCCEEDED", providerMessageId: "resend-message-2" });
    expect(fetch).toHaveBeenCalledTimes(2);

    if (previousApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = previousApiKey;
    }
    if (previousFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = previousFrom;
    }
  });

  it("retries a failed scheduled digest for the same report date", async () => {
    const previousApiKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.EMAIL_FROM;
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "reports@generisgp.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "resend-message-1" }), { status: 200 }))
    );
    const failedRun = {
      id: "email-run-1",
      reportDate: new Date("2026-05-14T00:00:00.000Z"),
      trigger: "SCHEDULED",
      status: "FAILED",
      recipientEmails: ["reviewer@generisgp.com"],
      subject: "Old digest",
      providerMessageId: null,
      errorMessage: "Resend email failed.",
      filters: null,
      dedupeKey: "review-digest:2026-05-14:reviewer-1",
      createdAt: new Date("2026-05-14T22:00:00.000Z"),
      completedAt: new Date("2026-05-14T22:01:00.000Z")
    };
    mockEmailRunFindUnique.mockResolvedValue(failedRun);
    mockUserFindMany.mockResolvedValue([
      { id: "reviewer-1", email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER", status: "ACTIVE" }
    ]);
    mockListReportsForDate.mockResolvedValue([
      {
        user: { id: "u1", name: "Employee", email: "employee@generisgp.com", role: "EMPLOYEE", status: "ACTIVE" },
        report: null
      }
    ]);
    mockEmailRunUpdate
      .mockResolvedValueOnce({ ...failedRun, status: "RUNNING", errorMessage: null, completedAt: null })
      .mockResolvedValueOnce({ ...failedRun, status: "SUCCEEDED", providerMessageId: "resend-message-1" });

    const { sendReviewDigest } = await import("@/lib/services/email-digest");
    const result = await sendReviewDigest({
      date: "2026-05-14",
      trigger: "SCHEDULED",
      scope: { userId: "reviewer-1", role: "REVIEWER" }
    });

    expect(result.skipped).toBe(false);
    expect(mockEmailRunCreate).not.toHaveBeenCalled();
    expect(mockEmailRunUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "email-run-1" },
        data: expect.objectContaining({
          status: "RUNNING",
          errorMessage: null,
          completedAt: null
        })
      })
    );

    if (previousApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = previousApiKey;
    }
    if (previousFrom === undefined) {
      delete process.env.EMAIL_FROM;
    } else {
      process.env.EMAIL_FROM = previousFrom;
    }
  });
});
