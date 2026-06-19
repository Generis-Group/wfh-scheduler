import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGoogleClientMock } = vi.hoisted(() => ({
  getGoogleClientMock: vi.fn(),
}));

vi.mock("@/lib/integrations/google", () => ({
  getGoogleClient: getGoogleClientMock,
}));

vi.mock("server-only", () => ({}));

import { getGeminiClient, getGeminiModel } from "@/lib/integrations/gemini";
import { GEMINI_OAUTH_SCOPES, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";

const originalEnv = {
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_QUOTA_PROJECT: process.env.GOOGLE_CLOUD_QUOTA_PROJECT,
};

beforeEach(() => {
  vi.clearAllMocks();

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("Gemini integration", () => {
  it("uses a user's connected Google account for Gemini requests", async () => {
    const request = vi.fn(async () => ({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: "Generated " }, { text: "summary" }],
            },
            finishReason: "STOP",
          },
        ],
      },
    }));
    const authClient = { request };
    getGoogleClientMock.mockResolvedValue(authClient);
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = "quota-project-1";

    const client = await getGeminiClient("user-1");
    const result = await client.models.generateContent({
      model: "gemini-test",
      contents: "Write a summary.",
      config: { maxOutputTokens: 200, temperature: 0.2 },
    });

    expect(getGoogleClientMock).toHaveBeenCalledWith("user-1");
    expect(authClient).toMatchObject({ quotaProjectId: "quota-project-1" });
    expect(request).toHaveBeenCalledWith({
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
      method: "POST",
      headers: {
        "x-goog-user-project": "quota-project-1",
      },
      data: {
        contents: [
          {
            parts: [{ text: "Write a summary." }],
          },
        ],
        generationConfig: { maxOutputTokens: 200, temperature: 0.2 },
      },
    });
    expect(result.text).toBe("Generated summary");
  });

  it("falls back to GOOGLE_CLOUD_PROJECT for the Gemini quota project", async () => {
    const authClient = { request: vi.fn() };
    getGoogleClientMock.mockResolvedValue(authClient);
    delete process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = "cloud-project-1";

    await getGeminiClient("user-1");

    expect(authClient).toMatchObject({ quotaProjectId: "cloud-project-1" });
  });

  it("requires a quota project for Gemini OAuth requests", async () => {
    getGoogleClientMock.mockResolvedValue({ request: vi.fn() });
    delete process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    await expect(getGeminiClient("user-1")).rejects.toThrow(
      "GOOGLE_CLOUD_QUOTA_PROJECT or GOOGLE_CLOUD_PROJECT is required for Gemini OAuth requests.",
    );
  });

  it("keeps Gemini scopes in the Google consent flow", () => {
    for (const scope of GEMINI_OAUTH_SCOPES) {
      expect(GOOGLE_OAUTH_SCOPE).toContain(scope);
    }
    expect(GOOGLE_OAUTH_SCOPE).toContain(
      "https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(GOOGLE_OAUTH_SCOPE).toContain(
      "https://www.googleapis.com/auth/chat.spaces.readonly",
    );
    expect(GOOGLE_OAUTH_SCOPE).toContain(
      "https://www.googleapis.com/auth/chat.messages.readonly",
    );
    expect(GOOGLE_OAUTH_SCOPE).toContain(
      "https://www.googleapis.com/auth/chat.users.readstate.readonly",
    );
  });

  it("keeps the existing default Gemini model", () => {
    delete process.env.GEMINI_MODEL;

    expect(getGeminiModel()).toBe("gemini-2.5-flash");
  });
});
