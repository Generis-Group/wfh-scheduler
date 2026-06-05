import { beforeEach, describe, expect, it, vi } from "vitest";

const { googleGenAIMock, getGoogleClientMock } = vi.hoisted(() => ({
  googleGenAIMock: vi.fn(),
  getGoogleClientMock: vi.fn()
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: googleGenAIMock
}));

vi.mock("@/lib/integrations/google", () => ({
  getGoogleClient: getGoogleClientMock
}));

vi.mock("server-only", () => ({}));

import { getGeminiClient, getGeminiModel } from "@/lib/integrations/gemini";
import { GEMINI_OAUTH_SCOPES, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";

const originalEnv = {
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_QUOTA_PROJECT: process.env.GOOGLE_CLOUD_QUOTA_PROJECT
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
    const authClient = {};
    getGoogleClientMock.mockResolvedValue(authClient);
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT = "quota-project-1";

    await getGeminiClient("user-1");

    expect(getGoogleClientMock).toHaveBeenCalledWith("user-1");
    expect(authClient).toMatchObject({ quotaProjectId: "quota-project-1" });
    expect(googleGenAIMock).toHaveBeenCalledWith({
      googleAuthOptions: {
        authClient,
        scopes: GEMINI_OAUTH_SCOPES
      }
    });
  });

  it("falls back to GOOGLE_CLOUD_PROJECT for the Gemini quota project", async () => {
    const authClient = {};
    getGoogleClientMock.mockResolvedValue(authClient);
    delete process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
    process.env.GOOGLE_CLOUD_PROJECT = "cloud-project-1";

    await getGeminiClient("user-1");

    expect(authClient).toMatchObject({ quotaProjectId: "cloud-project-1" });
  });

  it("requires a quota project for Gemini OAuth requests", async () => {
    getGoogleClientMock.mockResolvedValue({});
    delete process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    await expect(getGeminiClient("user-1")).rejects.toThrow(
      "GOOGLE_CLOUD_QUOTA_PROJECT or GOOGLE_CLOUD_PROJECT is required for Gemini OAuth requests."
    );
  });

  it("keeps Gemini scopes in the Google consent flow", () => {
    for (const scope of GEMINI_OAUTH_SCOPES) {
      expect(GOOGLE_OAUTH_SCOPE).toContain(scope);
    }
  });

  it("keeps the existing default Gemini model", () => {
    delete process.env.GEMINI_MODEL;

    expect(getGeminiModel()).toBe("gemini-2.5-flash");
  });
});
