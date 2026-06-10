import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
};

function restoreEnvValue(key: keyof typeof originalEnv) {
  if (originalEnv[key] === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = originalEnv[key];
}

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnvValue("APP_BASE_URL");
  restoreEnvValue("EMAIL_FROM");
  restoreEnvValue("NEXTAUTH_URL");
  restoreEnvValue("RESEND_API_KEY");
  restoreEnvValue("VERCEL_PROJECT_PRODUCTION_URL");
  restoreEnvValue("VERCEL_URL");
});

describe("email sender configuration", () => {
  it("never builds app email links with localhost", async () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.NEXTAUTH_URL = "http://127.0.0.1:3000";
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;

    const { appUrl } = await import("@/lib/email");

    expect(appUrl("/login")).toBe("https://report.generisgp.com/login");
  });

  it("uses a Vercel URL for email links when explicit app URLs are local", async () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "wfh-scheduler-two.vercel.app";
    delete process.env.VERCEL_URL;

    const { appUrl } = await import("@/lib/email");

    expect(appUrl("/reports")).toBe(
      "https://wfh-scheduler-two.vercel.app/reports",
    );
  });

  it("uses the verified Generis sender when EMAIL_FROM is not overridden", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    delete process.env.EMAIL_FROM;
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getEmailStatus, sendEmail } = await import("@/lib/email");

    expect(getEmailStatus()).toEqual({
      configured: true,
      provider: "Resend",
      from: "Generis Reports <reports@generisgp.com>",
    });

    await sendEmail({
      to: "employee@generisgp.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    expect(JSON.parse(request.body)).toMatchObject({
      from: "Generis Reports <reports@generisgp.com>",
      to: ["employee@generisgp.com"],
    });
  });

  it("ignores the old Resend testing sender override", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "WFH Scheduler <onboarding@resend.dev>";

    const { getEmailStatus } = await import("@/lib/email");

    expect(getEmailStatus()).toEqual({
      configured: true,
      provider: "Resend",
      from: "Generis Reports <reports@generisgp.com>",
    });
  });
});
