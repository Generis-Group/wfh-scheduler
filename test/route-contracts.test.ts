import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/access", () => ({
  requireSession: vi.fn(async () => ({
    user: {
      id: "user-1",
      role: "EMPLOYEE",
      status: "ACTIVE",
      timezone: "America/Toronto"
    }
  })),
  requireRole: vi.fn(async () => ({
    user: {
      id: "admin-1",
      role: "ADMIN",
      status: "ACTIVE",
      timezone: "America/Toronto"
    }
  })),
  assertCanAccessUser: vi.fn(),
  assertCanAccessReport: vi.fn()
}));

vi.mock("@/lib/services/reports", () => ({
  getDailyReport: vi.fn(async () => ({ id: "report-1" })),
  listReportsForDate: vi.fn(async () => []),
  getDashboardMetrics: vi.fn(async () => ({ users: 1, submitted: 0, blockers: 0, blockerTrend: [], sourceMix: [] })),
  getReportById: vi.fn(async () => ({ id: "report-1", userId: "user-1" })),
  updateReport: vi.fn(async () => ({ id: "report-1" })),
  submitReport: vi.fn(async () => ({ id: "report-1", status: "SUBMITTED" })),
  addReportComment: vi.fn(async () => ({ id: "report-1" }))
}));

vi.mock("@/lib/services/activity", () => ({
  listActivities: vi.fn(async () => [])
}));

vi.mock("@/lib/services/sync", () => ({
  syncJira: vi.fn(async () => ({ importedCount: 0, skippedCount: 0 })),
  syncGoogleCalendar: vi.fn(async () => ({ importedCount: 0, skippedCount: 0 })),
  syncGoogleTasks: vi.fn(async () => ({ importedCount: 0, skippedCount: 0 }))
}));

vi.mock("@/lib/services/admin", () => ({
  createAppUser: vi.fn(async () => ({ user: { id: "user-2" }, temporaryPassword: "temporary123" })),
  updateAppUser: vi.fn(async () => ({ id: "user-2" })),
  resetAppUserPassword: vi.fn(async () => ({ user: { id: "user-2" }, temporaryPassword: "temporary456" })),
  changeOwnPassword: vi.fn(async () => ({ id: "user-1" }))
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
      upsert: vi.fn(async (_input) => ({ value: { emailDomains: [], jiraProjectKeys: [] } }))
    },
    account: {
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

  it("accepts user-triggered sync requests", async () => {
    const { POST } = await import("@/app/api/sync/jira/route");
    const response = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ date: "2026-05-13" })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ importedCount: 0, skippedCount: 0 });
  });

  it("creates admin-managed credentials users", async () => {
    const { POST } = await import("@/app/api/admin/users/route");
    const response = await POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: "employee@generis.com",
          name: "Employee",
          role: "EMPLOYEE",
          status: "ACTIVE"
        })
      })
    );

    expect(response.status).toBe(201);
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
});
