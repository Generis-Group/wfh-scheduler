import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserFindMany } = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: mockUserFindMany,
    },
  },
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

describe("bug report admin emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    restoreEnvValue("APP_BASE_URL");
    restoreEnvValue("EMAIL_FROM");
    restoreEnvValue("RESEND_API_KEY");
  });

  it("selects active Generis admins, including users with additive admin roles", async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: "admin-1",
        email: "admin@generisgp.com",
        name: "Admin",
        role: "ADMIN",
        roles: ["ADMIN"],
        status: "ACTIVE",
      },
      {
        id: "it-admin-1",
        email: "it@generisgp.com",
        name: "IT Admin",
        role: "EMPLOYEE",
        roles: ["EMPLOYEE", "ADMIN"],
        status: "ACTIVE",
      },
      {
        id: "reviewer-1",
        email: "reviewer@generisgp.com",
        name: "Reviewer",
        role: "REVIEWER",
        roles: ["REVIEWER"],
        status: "ACTIVE",
      },
      {
        id: "external-admin-1",
        email: "admin@example.com",
        name: "External Admin",
        role: "ADMIN",
        roles: ["ADMIN"],
        status: "ACTIVE",
      },
    ]);

    const { selectBugReportAdminRecipients } = await import(
      "@/lib/services/bug-report-emails"
    );

    await expect(selectBugReportAdminRecipients()).resolves.toEqual([
      { email: "admin@generisgp.com", name: "Admin" },
      { email: "it@generisgp.com", name: "IT Admin" },
    ]);
  });

  it("emails all admin recipients with a direct bug report link", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.APP_BASE_URL = "https://reports.generisgp.com";
    delete process.env.EMAIL_FROM;
    mockUserFindMany.mockResolvedValue([
      {
        id: "admin-1",
        email: "admin@generisgp.com",
        name: "Admin",
        role: "ADMIN",
        roles: ["ADMIN"],
        status: "ACTIVE",
      },
      {
        id: "admin-2",
        email: "ops@generisgp.com",
        name: "Ops",
        role: "EMPLOYEE",
        roles: ["EMPLOYEE", "ADMIN"],
        status: "ACTIVE",
      },
    ]);
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "bug-email-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendBugReportAdminEmail } = await import(
      "@/lib/services/bug-report-emails"
    );
    const result = await sendBugReportAdminEmail({
      id: "bug-report-1",
      body: "The review dashboard gets stuck loading.",
      pagePath: "/review",
      userAgent: "Vitest",
      reporter: {
        name: "Alex Employee",
        email: "alex@generisgp.com",
      },
      attachments: [{ id: "attachment-1" }],
    });

    expect(result).toEqual({
      status: "SENT",
      providerMessageId: "bug-email-1",
    });
    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    const body = JSON.parse(request.body);

    expect(body).toMatchObject({
      from: "Generis Reports <reports@generisgp.com>",
      to: ["admin@generisgp.com", "ops@generisgp.com"],
      subject: "New bug report from Alex Employee",
    });
    expect(body.text).toContain(
      "Open bug report: https://reports.generisgp.com/bugs?reportId=bug-report-1",
    );
  });

  it("skips email when there are no active admin recipients", async () => {
    mockUserFindMany.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn());

    const { sendBugReportAdminEmail } = await import(
      "@/lib/services/bug-report-emails"
    );

    await expect(
      sendBugReportAdminEmail({
        id: "bug-report-1",
        body: "The page is blank.",
        reporter: { email: "employee@generisgp.com" },
      }),
    ).resolves.toEqual({
      status: "SKIPPED",
      reason: "No active admin recipients with @generisgp.com emails.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
