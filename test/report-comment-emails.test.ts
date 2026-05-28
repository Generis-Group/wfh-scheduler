import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("report comment emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    restoreEnvValue("APP_BASE_URL");
    restoreEnvValue("EMAIL_FROM");
    restoreEnvValue("RESEND_API_KEY");
  });

  it("sends reviewer comments to the employee through Resend", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "Generis Reports <reports@generisgp.com>";
    process.env.APP_BASE_URL = "https://reports.generisgp.com";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "comment-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { sendReportCommentEmail } = await import(
      "@/lib/services/report-comment-emails"
    );
    const result = await sendReportCommentEmail({
      report: {
        id: "report-1",
        reportDate: "2026-05-13",
        user: {
          name: "Alex Employee",
          email: "alex@generisgp.com",
        },
      },
      commentBody: "Please add the client follow-up.",
      author: {
        name: "Riley Reviewer",
        email: "riley@generisgp.com",
      },
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit & { body: string },
    ];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      from: "Generis Reports <reports@generisgp.com>",
      to: ["alex@generisgp.com"],
      subject: "New report comment - 2026-05-13",
    });
    expect(body.text).toContain("Riley Reviewer left a comment");
    expect(body.text).toContain(
      "Open report: https://reports.generisgp.com/reports?reportId=report-1",
    );
    expect(result).toEqual({
      status: "SENT",
      providerMessageId: "comment-1",
    });
  });

  it("skips internal reviewed comments", async () => {
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.EMAIL_FROM = "Generis Reports <reports@generisgp.com>";
    vi.stubGlobal("fetch", vi.fn());
    const { sendReportCommentEmail } = await import(
      "@/lib/services/report-comment-emails"
    );

    const result = await sendReportCommentEmail({
      report: {
        id: "report-1",
        reportDate: "2026-05-13",
        user: {
          name: "Alex Employee",
          email: "alex@generisgp.com",
        },
      },
      commentBody: "reviewed",
      author: {
        name: "Riley Reviewer",
        email: "riley@generisgp.com",
      },
    });

    expect(result).toEqual({
      status: "SKIPPED",
      reason: "No employee notification is needed for this comment.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
