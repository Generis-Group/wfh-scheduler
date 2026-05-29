import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
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

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnvValue("EMAIL_FROM");
  restoreEnvValue("RESEND_API_KEY");
});

describe("email sender configuration", () => {
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
