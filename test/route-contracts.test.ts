import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (callback: unknown) => callback
}));

vi.mock("@/lib/access", () => ({
  requireSession: vi.fn(async () => ({
    user: {
      id: "user-1",
      role: "EMPLOYEE",
      status: "ACTIVE"
    }
  })),
  requireRole: vi.fn(async () => ({
    user: {
      id: "admin-1",
      role: "ADMIN",
      status: "ACTIVE"
    }
  })),
  assertCanAccessUser: vi.fn(),
  assertCanAccessUserData: vi.fn(),
  assertCanAccessReport: vi.fn(),
  assertCanMutateReport: vi.fn()
}));

vi.mock("@/lib/services/reports", () => ({
  ensureDailyReport: vi.fn(async () => ({ id: "report-1", userId: "user-1" })),
  getDailyReport: vi.fn(async () => ({ id: "report-1" })),
  listReportsForDate: vi.fn(async () => []),
  getDashboardMetrics: vi.fn(async () => ({ users: 1, submitted: 0, sourceMix: [] })),
  getReviewDashboardData: vi.fn(async () => ({
    rows: [],
    metrics: { users: 1, submitted: 0, sourceMix: [] }
  })),
  getReportById: vi.fn(async () => ({ id: "report-1", userId: "user-1" })),
  updateReport: vi.fn(async () => ({ id: "report-1" })),
  submitReport: vi.fn(async () => ({ id: "report-1", status: "SUBMITTED" })),
  deleteDraftReport: vi.fn(async () => ({ ok: true })),
  addReportComment: vi.fn(async () => ({ id: "report-1" })),
  setReportReadState: vi.fn(async () => ({ id: "report-1", readReceipts: [{ reviewerId: "admin-1" }] }))
}));

vi.mock("@/lib/services/activity", () => ({
  listActivities: vi.fn(async () => [])
}));

vi.mock("@/lib/services/sync", () => ({
  syncJira: vi.fn(async () => ({ importedCount: 0, skippedCount: 0, staleCount: 0, activities: [] })),
  syncGoogleCalendar: vi.fn(async () => ({ importedCount: 0, skippedCount: 0, staleCount: 0, activities: [] })),
  syncGoogleTasks: vi.fn(async () => ({ importedCount: 0, skippedCount: 0, staleCount: 0, activities: [] })),
  searchIncompleteGoogleTasks: vi.fn(async () => []),
  addGoogleTaskReference: vi.fn(async () => ({ id: "report-1", userId: "user-1" }))
}));

vi.mock("@/lib/services/admin", () => ({
  createAppUser: vi.fn(async () => ({ user: { id: "user-2" }, temporaryPassword: "temporary123" })),
  updateAppUser: vi.fn(async () => ({ id: "user-2" })),
  resetAppUserPassword: vi.fn(async () => ({ user: { id: "user-2" }, temporaryPassword: "temporary456" })),
  changeOwnPassword: vi.fn(async () => ({ id: "user-1" })),
  updateOwnProfile: vi.fn(async () => ({
    id: "user-1",
    name: "Employee",
    email: "employee@generisgp.com",
    image: null,
    role: "EMPLOYEE",
    status: "ACTIVE",
    mustChangePassword: false
  }))
}));

vi.mock("@/lib/services/email-digest", () => ({
  sendReviewDigest: vi.fn(async ({ trigger }) => ({
    skipped: trigger === "SCHEDULED",
    emailRun: {
      id: "email-run-1",
      status: trigger === "SCHEDULED" ? "SKIPPED" : "SUCCEEDED",
      recipientEmails: ["reviewer@generisgp.com"]
    }
  })),
  sendScheduledReviewDigests: vi.fn(async () => ({
    skipped: true,
    emailRuns: [
      {
        id: "email-run-1",
        status: "SKIPPED",
        recipientEmails: ["reviewer@generisgp.com"]
      }
    ]
  })),
  getLastReviewDigestRun: vi.fn(async () => null),
  getReviewDigestEmailStatus: vi.fn(() => ({
    configured: true,
    provider: "Resend",
    from: "reports@generisgp.com",
    digestTime: "6:00 PM America/Toronto",
    recipientRule: "Manual digests go to the sender; scheduled digests are scoped per active reviewer/admin"
  }))
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async () => [])
    },
    userIntegrationSettings: {
      upsert: vi.fn(async () => ({ userId: "user-1", googleTaskListIds: [] }))
    },
    appSetting: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async (_input) => ({ value: { jiraProjectKeys: [] } }))
    },
    account: {
      deleteMany: vi.fn(async () => ({ count: 1 }))
    },
    reportReadReceipt: {
      upsert: vi.fn(async () => ({ id: "read-1" })),
      deleteMany: vi.fn(async () => ({ count: 1 }))
    }
  }
}));

describe("route contracts", () => {
  it("returns a report for an employee date query", async () => {
    const { GET } = await import("@/app/api/reports/route");
    const response = await GET(new Request("http://localhost/api/reports?date=2026-05-13"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ report: { id: "report-1" } });
  });

  it("creates a report through autosave or submit requests", async () => {
    const reports = await import("@/lib/services/reports");
    const { POST } = await import("@/app/api/reports/route");
    vi.mocked(reports.ensureDailyReport).mockClear();

    const response = await POST(
      new Request("http://localhost/api/reports", {
        method: "POST",
        body: JSON.stringify({
          date: "2026-05-13",
          summary: "Autosaved draft"
        })
      })
    );

    expect(response.status).toBe(201);
    expect(reports.ensureDailyReport).toHaveBeenCalledWith("user-1", "2026-05-13");
  });

  it("accepts user-triggered sync requests", async () => {
    const { POST } = await import("@/app/api/sync/jira/route");
    const response = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-13" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ importedCount: 0, skippedCount: 0, staleCount: 0, activities: [] });
  });

  it("creates admin-managed credentials users", async () => {
    const { POST } = await import("@/app/api/admin/users/route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "employee@generisgp.com",
          name: "Employee",
          role: "EMPLOYEE",
          status: "ACTIVE"
        })
      })
    );

    expect(response.status).toBe(201);
  });

  it("rejects admin-managed users outside the Generis GP domain", async () => {
    const { POST } = await import("@/app/api/admin/users/route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "employee@example.com",
          name: "Employee",
          role: "EMPLOYEE",
          status: "ACTIVE"
        })
      })
    );

    expect(response.status).toBe(422);
  });

  it("updates account profile settings", async () => {
    const { PATCH } = await import("@/app/api/account/profile/route");
    const response = await PATCH(
      new Request("http://localhost/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: "Employee",
          email: "employee@generisgp.com"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "user-1",
        email: "employee@generisgp.com"
      }
    });
  });

  it("changes a temporary credentials password", async () => {
    const { PATCH } = await import("@/app/api/account/password/route");
    const response = await PATCH(
      new Request("http://localhost/api/account/password", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: "temporary123",
          newPassword: "permanent123"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("requires owner mutation access when updating a report", async () => {
    const access = await import("@/lib/access");
    const { PUT } = await import("@/app/api/reports/[id]/route");
    vi.mocked(access.assertCanMutateReport).mockClear();

    const response = await PUT(
      new Request("http://localhost/api/reports/report-1", {
        method: "PUT",
        body: JSON.stringify({ summary: "Updated summary" })
      }),
      { params: { id: "report-1" } }
    );

    expect(response.status).toBe(200);
    expect(access.assertCanMutateReport).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      expect.objectContaining({ id: "report-1", userId: "user-1" })
    );
  });

  it("skips route revalidation for autosave report updates", async () => {
    const cache = await import("next/cache");
    const { PUT } = await import("@/app/api/reports/[id]/route");
    vi.mocked(cache.revalidatePath).mockClear();

    const response = await PUT(
      new Request("http://localhost/api/reports/report-1", {
        method: "PUT",
        headers: { "x-generis-autosave": "1" },
        body: JSON.stringify({ summary: "Autosaved summary" })
      }),
      { params: { id: "report-1" } }
    );

    expect(response.status).toBe(200);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires owner mutation access when submitting a report", async () => {
    const access = await import("@/lib/access");
    const { POST } = await import("@/app/api/reports/[id]/submit/route");
    vi.mocked(access.assertCanMutateReport).mockClear();

    const response = await POST(new Request("http://localhost/api/reports/report-1/submit", { method: "POST" }), {
      params: { id: "report-1" }
    });

    expect(response.status).toBe(200);
    expect(access.assertCanMutateReport).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      expect.objectContaining({ id: "report-1", userId: "user-1" })
    );
  });

  it("requires owner mutation access when deleting a draft", async () => {
    const access = await import("@/lib/access");
    const reports = await import("@/lib/services/reports");
    const { DELETE } = await import("@/app/api/reports/[id]/route");
    vi.mocked(access.assertCanMutateReport).mockClear();
    vi.mocked(reports.deleteDraftReport).mockClear();

    const response = await DELETE(new Request("http://localhost/api/reports/report-1", { method: "DELETE" }), {
      params: { id: "report-1" }
    });

    expect(response.status).toBe(200);
    expect(access.assertCanMutateReport).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "user-1" }) }),
      expect.objectContaining({ id: "report-1", userId: "user-1" })
    );
    expect(reports.deleteDraftReport).toHaveBeenCalledWith("report-1");
  });

  it("sends a manual reviewer email digest", async () => {
    const { POST } = await import("@/app/api/review/email-digest/route");
    const response = await POST(
      new Request("http://localhost/api/review/email-digest", {
        method: "POST",
        body: JSON.stringify({
          date: "2026-05-13",
          filters: {
            search: ""
          }
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      emailRun: {
        id: "email-run-1",
        status: "SUCCEEDED"
      },
      skipped: false
    });
  });

  it("toggles reviewer report read state", async () => {
    const { PATCH } = await import("@/app/api/reports/[id]/read/route");
    const response = await PATCH(
      new Request("http://localhost/api/reports/report-1/read", {
        method: "PATCH",
        body: JSON.stringify({ read: true })
      }),
      { params: { id: "report-1" } }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ report: { id: "report-1", readReceipts: [{ reviewerId: "admin-1" }] } });
  });

  it("requires a cron secret for scheduled reviewer email digests", async () => {
    const previousSecret = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/review-digest/route");
    const response = await GET(new Request("http://localhost/api/cron/review-digest"));

    expect(response.status).toBe(500);
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  });

  it("runs the scheduled reviewer email digest during the 6 PM Toronto weekday hour", async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T22:05:00.000Z"));

    const { GET } = await import("@/app/api/cron/review-digest/route");
    const response = await GET(
      new Request("http://localhost/api/cron/review-digest", {
        headers: { authorization: "Bearer test-cron-secret" }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      emailRuns: [
        {
          id: "email-run-1",
          status: "SKIPPED"
        }
      ],
      skipped: true
    });

    vi.useRealTimers();
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }
  });
});
