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
      { email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER", status: "ACTIVE" },
      { email: "admin@generisgp.com", name: "Admin", role: "ADMIN", status: "ACTIVE" },
      { email: "employee@generisgp.com", name: "Employee", role: "EMPLOYEE", status: "ACTIVE" },
      { email: "disabled@generisgp.com", name: "Disabled", role: "REVIEWER", status: "DISABLED" },
      { email: "external@example.com", name: "External", role: "ADMIN", status: "ACTIVE" },
      { email: null, name: "No Email", role: "ADMIN", status: "ACTIVE" }
    ]);

    const { selectReviewDigestRecipients } = await import("@/lib/services/email-digest");
    const recipients = await selectReviewDigestRecipients();

    expect(recipients).toEqual([
      { email: "reviewer@generisgp.com", name: "Reviewer" },
      { email: "admin@generisgp.com", name: "Admin" }
    ]);
  });

  it("builds a concise digest for submitted, draft, missing, blocker, late, and edited reports", async () => {
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
            blockers: "",
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
            blockers: "Waiting on an answer",
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
            blockers: "",
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
      blockers: 1,
      late: 1,
      edited: 1
    });
    expect(digest.text).toContain("Open review dashboard: https://reports.generisgp.com/review?date=2026-05-14");
    expect(digest.text).toContain("Missing reports: Missing Employee");
    expect(digest.text).toContain("Reports with blockers: Draft Employee");
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
      dedupeKey: "review-digest:2026-05-14",
      createdAt: new Date("2026-05-14T22:00:00.000Z"),
      completedAt: new Date("2026-05-14T22:01:00.000Z")
    };
    mockEmailRunFindUnique.mockResolvedValue(failedRun);
    mockUserFindMany.mockResolvedValue([
      { email: "reviewer@generisgp.com", name: "Reviewer", role: "REVIEWER", status: "ACTIVE" }
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
    const result = await sendReviewDigest({ date: "2026-05-14", trigger: "SCHEDULED" });

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
