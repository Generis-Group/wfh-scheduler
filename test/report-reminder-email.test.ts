import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDailyReportFindUnique,
  mockGetReviewableEmployeeWhere,
  mockUserFindFirst,
} = vi.hoisted(() => ({
  mockDailyReportFindUnique: vi.fn(),
  mockGetReviewableEmployeeWhere: vi.fn(),
  mockUserFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: {
      findUnique: mockDailyReportFindUnique,
    },
    user: {
      findFirst: mockUserFindFirst,
    },
  },
}));

vi.mock("@/lib/services/departments", () => ({
  getReviewableEmployeeWhere: mockGetReviewableEmployeeWhere,
}));

const originalEnv = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

function restoreEnvValue(key: keyof typeof originalEnv) {
  if (originalEnv[key] === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = originalEnv[key];
}

describe("report reminder emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockGetReviewableEmployeeWhere.mockResolvedValue({ role: "EMPLOYEE" });
    mockDailyReportFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue({
      id: "employee-1",
      name: "Alex Employee",
      email: "alex@generisgp.com",
    });
  });

  afterEach(() => {
    restoreEnvValue("APP_BASE_URL");
    restoreEnvValue("EMAIL_FROM");
    restoreEnvValue("RESEND_API_KEY");
  });

  it("sends a daily report reminder through Resend", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "Generis Reports <reports@generisgp.com>";
    process.env.APP_BASE_URL = "https://reports.generisgp.com";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "reminder-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendReportReminderEmail } = await import(
      "@/lib/services/report-reminder-email"
    );
    const result = await sendReportReminderEmail({
      userId: "employee-1",
      date: "2026-05-13",
      scope: { userId: "reviewer-1", role: "REVIEWER" },
    });

    expect(mockGetReviewableEmployeeWhere).toHaveBeenCalledWith({
      userId: "reviewer-1",
      role: "REVIEWER",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      from: "Generis Reports <reports@generisgp.com>",
      to: ["alex@generisgp.com"],
      subject: "Daily report reminder - 2026-05-13",
    });
    expect(body.text).toContain(
      "Open your daily report: https://reports.generisgp.com/?date=2026-05-13",
    );
    expect(result.emailDelivery).toEqual({
      status: "SENT",
      providerMessageId: "reminder-1",
    });
  });

  it("does not remind employees whose report is already submitted", async () => {
    mockDailyReportFindUnique.mockResolvedValue({ status: "SUBMITTED" });
    const { sendReportReminderEmail } = await import(
      "@/lib/services/report-reminder-email"
    );

    await expect(
      sendReportReminderEmail({
        userId: "employee-1",
        date: "2026-05-13",
        scope: { userId: "reviewer-1", role: "REVIEWER" },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "That report has already been submitted.",
    });
  });

  it("skips reminders until Resend is configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const { sendReportReminderEmail } = await import(
      "@/lib/services/report-reminder-email"
    );

    const result = await sendReportReminderEmail({
      userId: "employee-1",
      date: "2026-05-13",
      scope: { userId: "reviewer-1", role: "REVIEWER" },
    });

    expect(result.emailDelivery).toEqual({
      status: "SKIPPED",
      reason: "Resend email is not configured.",
    });
  });
});
