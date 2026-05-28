import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
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
  vi.clearAllMocks();
  restoreEnvValue("APP_BASE_URL");
  restoreEnvValue("EMAIL_FROM");
  restoreEnvValue("NEXTAUTH_URL");
  restoreEnvValue("RESEND_API_KEY");
});

describe("account emails", () => {
  it("sends temporary password emails through Resend", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "Generis Reports <reports@generisgp.com>";
    process.env.APP_BASE_URL = "https://reports.generisgp.com";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "email-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendTemporaryPasswordEmail } = await import(
      "@/lib/services/account-emails"
    );
    const result = await sendTemporaryPasswordEmail({
      user: {
        email: "employee@generisgp.com",
        name: "Employee",
      },
      temporaryPassword: "temporary123",
      kind: "INVITE",
    });

    expect(result).toEqual({
      status: "SENT",
      providerMessageId: "email-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend-test-key",
          "Content-Type": "application/json",
        }),
        body: expect.any(String),
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    const body = JSON.parse(init.body);

    expect(body).toMatchObject({
      from: "Generis Reports <reports@generisgp.com>",
      to: ["employee@generisgp.com"],
      subject: "Your Generis Reports account",
    });
    expect(body.text).toContain("https://reports.generisgp.com/login");
    expect(body.text).toContain("temporary123");
  });

  it("skips temporary password emails until Resend is configured", async () => {
    const { sendTemporaryPasswordEmail } = await import(
      "@/lib/services/account-emails"
    );
    const result = await sendTemporaryPasswordEmail({
      user: {
        email: "employee@generisgp.com",
        name: "Employee",
      },
      temporaryPassword: "temporary123",
      kind: "RESET",
    });

    expect(result).toEqual({
      status: "SKIPPED",
      reason: "Resend email is not configured.",
    });
  });
});
